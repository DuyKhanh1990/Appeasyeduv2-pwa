import { Router } from "express";
import { db, usersTable, classesTable, classSessionsTable, studentEnrollmentsTable, chatGroupsTable, chatGroupMembersTable } from "@workspace/db";
import { eq, and, ilike, or, inArray, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function roleLabel(role: string): string {
  switch (role) {
    case "teacher": return "Giáo viên";
    case "staff":   return "Nhân viên";
    case "admin":   return "Quản trị";
    case "parent":  return "Phụ huynh";
    default:        return "Học viên";
  }
}

// ─── PUT /api/mobile/chat/uid — lưu tinode UID của user ───────────────────────
router.put("/api/mobile/chat/uid", requireAuth, async (req, res) => {
  const userId = req.session.userId as string;
  const { tinodeUid } = req.body as { tinodeUid?: string };
  if (!tinodeUid) return res.status(400).json({ success: false, error: "tinodeUid required" });
  await db.update(usersTable).set({ tinodeUid }).where(eq(usersTable.id, userId));
  return res.json({ success: true });
});

// ─── GET /api/mobile/chat/users?uids= — tra cứu displayName theo tinodeUid ───
router.get("/api/mobile/chat/users", requireAuth, async (req, res) => {
  const uidsParam = (req.query.uids as string) || "";
  const uids = uidsParam.split(",").map(s => s.trim()).filter(Boolean).slice(0, 50);
  if (!uids.length) return res.json({ success: true, data: { users: [] } });

  const rows = await db
    .select({ tinodeUid: usersTable.tinodeUid, displayName: usersTable.name, username: usersTable.username })
    .from(usersTable)
    .where(inArray(usersTable.tinodeUid, uids));

  return res.json({
    success: true,
    data: {
      users: rows.map(r => ({
        tinodeUid: r.tinodeUid,
        displayName: r.displayName ?? r.username,
      })),
    },
  });
});

// ─── GET /api/mobile/chat/search-users?q= — tìm user để thêm vào nhóm ────────
router.get("/api/mobile/chat/search-users", requireAuth, async (req, res) => {
  const q = ((req.query.q as string) || "").trim();
  const rows = await db
    .select({ userId: usersTable.id, displayName: usersTable.name, username: usersTable.username, role: usersTable.role })
    .from(usersTable)
    .where(
      q
        ? or(ilike(usersTable.name, `%${q}%`), ilike(usersTable.username, `%${q}%`))
        : sql`1=1`
    )
    .limit(20);

  return res.json({
    success: true,
    data: {
      users: rows.map(r => ({
        userId: r.userId,
        displayName: r.displayName ?? r.username,
        role: r.role,
      })),
    },
  });
});

// ─── GET /api/mobile/chat/classes/search?q= — tìm lớp học ───────────────────
router.get("/api/mobile/chat/classes/search", requireAuth, async (req, res) => {
  const q = ((req.query.q as string) || "").trim();

  const rows = await db
    .select({ id: classesTable.id, name: classesTable.name, code: classesTable.code })
    .from(classesTable)
    .where(
      q
        ? or(ilike(classesTable.name, `%${q}%`), ilike(classesTable.code, `%${q}%`))
        : sql`1=1`
    )
    .limit(20);

  return res.json({
    success: true,
    data: {
      classes: rows.map(r => ({
        id: r.id,
        name: r.name,
        classCode: r.code,
      })),
    },
  });
});

// ─── GET /api/mobile/chat/classes/:classId/members ───────────────────────────
router.get("/api/mobile/chat/classes/:classId/members", requireAuth, async (req, res) => {
  const { classId } = req.params;

  // Students enrolled in this class
  const students = await db
    .select({ userId: usersTable.id, displayName: usersTable.name, username: usersTable.username, role: usersTable.role })
    .from(studentEnrollmentsTable)
    .innerJoin(usersTable, eq(studentEnrollmentsTable.studentId, usersTable.id))
    .where(eq(studentEnrollmentsTable.classId, classId));

  // Teachers from class_sessions
  const sessions = await db
    .select({ teacherIds: classSessionsTable.teacherIds })
    .from(classSessionsTable)
    .where(eq(classSessionsTable.classId, classId));

  const teacherIdSet = new Set<string>();
  for (const s of sessions) {
    for (const tid of (s.teacherIds ?? [])) teacherIdSet.add(tid);
  }

  let teachers: { userId: string; displayName: string | null; username: string; role: string }[] = [];
  if (teacherIdSet.size > 0) {
    teachers = await db
      .select({ userId: usersTable.id, displayName: usersTable.name, username: usersTable.username, role: usersTable.role })
      .from(usersTable)
      .where(inArray(usersTable.id, [...teacherIdSet]));
  }

  const seen = new Set<string>();
  const members = [...teachers, ...students]
    .filter(m => { if (seen.has(m.userId)) return false; seen.add(m.userId); return true; })
    .map(m => ({
      userId: m.userId,
      displayName: m.displayName ?? m.username,
      role: m.role,
    }));

  return res.json({ success: true, data: { members } });
});

// ─── GET /api/mobile/chat/classes/:classId/groups ────────────────────────────
router.get("/api/mobile/chat/classes/:classId/groups", requireAuth, async (req, res) => {
  const { classId } = req.params;
  const groups = await db
    .select({ id: chatGroupsTable.id, name: chatGroupsTable.name })
    .from(chatGroupsTable)
    .where(eq(chatGroupsTable.classId, classId));

  return res.json({ success: true, data: { groups } });
});

// ─── GET /api/mobile/chat/groups — danh sách nhóm của user ───────────────────
router.get("/api/mobile/chat/groups", requireAuth, async (req, res) => {
  const userId = req.session.userId as string;

  const memberRows = await db
    .select({ groupId: chatGroupMembersTable.groupId })
    .from(chatGroupMembersTable)
    .where(eq(chatGroupMembersTable.userId, userId));

  const groupIds = memberRows.map(r => r.groupId);
  if (!groupIds.length) {
    return res.json({ success: true, data: { groups: [], total: 0, permissions: { canCreate: true } } });
  }

  const groups = await db
    .select({
      id: chatGroupsTable.id,
      name: chatGroupsTable.name,
      tinodeTopicId: chatGroupsTable.tinodeTopicId,
      classId: chatGroupsTable.classId,
      createdBy: chatGroupsTable.createdBy,
      createdAt: chatGroupsTable.createdAt,
    })
    .from(chatGroupsTable)
    .where(inArray(chatGroupsTable.id, groupIds));

  // member counts
  const counts = await db
    .select({ groupId: chatGroupMembersTable.groupId, cnt: sql<number>`count(*)` })
    .from(chatGroupMembersTable)
    .where(inArray(chatGroupMembersTable.groupId, groupIds))
    .groupBy(chatGroupMembersTable.groupId);

  const cntMap = new Map(counts.map(c => [c.groupId, Number(c.cnt)]));

  return res.json({
    success: true,
    data: {
      groups: groups.map(g => ({ ...g, memberCount: cntMap.get(g.id) ?? 0 })),
      total: groups.length,
      permissions: { canCreate: true },
    },
  });
});

// ─── POST /api/mobile/chat/groups — tạo nhóm ─────────────────────────────────
router.post("/api/mobile/chat/groups", requireAuth, async (req, res) => {
  const userId = req.session.userId as string;
  const { name, classId, memberUserIds } = req.body as {
    name?: string;
    classId?: string;
    memberUserIds?: string[];
  };

  if (!name?.trim()) return res.status(400).json({ success: false, error: "Tên nhóm không được để trống" });

  // Insert group
  const [group] = await db
    .insert(chatGroupsTable)
    .values({ name: name.trim(), classId: classId ?? null, createdBy: userId })
    .returning();

  // Collect members: creator + explicit list + class members
  const memberSet = new Set<string>([userId]);
  if (memberUserIds?.length) memberUserIds.forEach(id => memberSet.add(id));

  if (classId) {
    const students = await db
      .select({ studentId: studentEnrollmentsTable.studentId })
      .from(studentEnrollmentsTable)
      .where(eq(studentEnrollmentsTable.classId, classId));
    students.forEach(s => memberSet.add(s.studentId));

    const sessions = await db
      .select({ teacherIds: classSessionsTable.teacherIds })
      .from(classSessionsTable)
      .where(eq(classSessionsTable.classId, classId));
    sessions.forEach(s => (s.teacherIds ?? []).forEach(tid => memberSet.add(tid)));
  }

  await db.insert(chatGroupMembersTable).values(
    [...memberSet].map(uid => ({
      groupId: group.id,
      userId: uid,
      isCreator: uid === userId,
    }))
  );

  return res.status(201).json({
    success: true,
    data: { group: { ...group, memberCount: memberSet.size } },
  });
});

// ─── PUT /api/mobile/chat/groups/:id — đổi tên nhóm ─────────────────────────
router.put("/api/mobile/chat/groups/:id", requireAuth, async (req, res) => {
  const userId = req.session.userId as string;
  const { id } = req.params;
  const { name } = req.body as { name?: string };
  if (!name?.trim()) return res.status(400).json({ success: false, error: "Tên nhóm không được để trống" });

  const [group] = await db.select().from(chatGroupsTable).where(eq(chatGroupsTable.id, id)).limit(1);
  if (!group) return res.status(404).json({ success: false, error: "Không tìm thấy nhóm" });
  if (group.createdBy !== userId) return res.status(403).json({ success: false, error: "Không có quyền" });

  const [updated] = await db.update(chatGroupsTable).set({ name: name.trim() }).where(eq(chatGroupsTable.id, id)).returning();
  return res.json({ success: true, data: { group: updated } });
});

// ─── DELETE /api/mobile/chat/groups/:id — xoá nhóm ──────────────────────────
router.delete("/api/mobile/chat/groups/:id", requireAuth, async (req, res) => {
  const userId = req.session.userId as string;
  const { id } = req.params;

  const [group] = await db.select().from(chatGroupsTable).where(eq(chatGroupsTable.id, id)).limit(1);
  if (!group) return res.status(404).json({ success: false, error: "Không tìm thấy nhóm" });
  if (group.createdBy !== userId) return res.status(403).json({ success: false, error: "Không có quyền" });

  await db.delete(chatGroupsTable).where(eq(chatGroupsTable.id, id));
  return res.json({ success: true });
});

// ─── POST /api/mobile/chat/groups/:id/members — thêm thành viên ──────────────
router.post("/api/mobile/chat/groups/:id/members", requireAuth, async (req, res) => {
  const { id } = req.params;
  const { userIds } = req.body as { userIds?: string[] };
  if (!userIds?.length) return res.status(400).json({ success: false, error: "userIds required" });

  await db
    .insert(chatGroupMembersTable)
    .values(userIds.map(uid => ({ groupId: id, userId: uid })))
    .onConflictDoNothing();

  return res.json({ success: true });
});

// ─── DELETE /api/mobile/chat/groups/:id/members/me — rời nhóm ────────────────
router.delete("/api/mobile/chat/groups/:id/members/me", requireAuth, async (req, res) => {
  const userId = req.session.userId as string;
  const { id } = req.params;
  await db.delete(chatGroupMembersTable).where(
    and(eq(chatGroupMembersTable.groupId, id), eq(chatGroupMembersTable.userId, userId))
  );
  return res.json({ success: true });
});

// ─── DELETE /api/mobile/chat/groups/:id/members/:userId — kick thành viên ────
router.delete("/api/mobile/chat/groups/:id/members/:memberId", requireAuth, async (req, res) => {
  const requesterId = req.session.userId as string;
  const { id, memberId } = req.params;

  const [group] = await db.select().from(chatGroupsTable).where(eq(chatGroupsTable.id, id)).limit(1);
  if (!group) return res.status(404).json({ success: false, error: "Không tìm thấy nhóm" });
  if (group.createdBy !== requesterId) return res.status(403).json({ success: false, error: "Không có quyền" });

  await db.delete(chatGroupMembersTable).where(
    and(eq(chatGroupMembersTable.groupId, id), eq(chatGroupMembersTable.userId, memberId))
  );
  return res.json({ success: true });
});

export default router;
