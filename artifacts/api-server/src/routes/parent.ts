import { Router } from "express";
import { db, usersTable, parentProfilesTable, parentStudentLinksTable, studentEnrollmentsTable, classesTable, classSessionsTable, studentSessionsTable, notificationsTable } from "@workspace/db";
import { eq, and, inArray, or, desc, count, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

router.get("/mobile/parent/profile", requireAuth, async (req, res) => {
  const userId = req.session.userId as string;
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user) return res.status(401).json({ message: "Unauthorized" });
    if (user.role !== "parent") return res.status(403).json({ message: "Tài khoản này không phải tài khoản phụ huynh" });

    const [profile] = await db.select().from(parentProfilesTable).where(eq(parentProfilesTable.userId, userId)).limit(1);

    const links = await db
      .select()
      .from(parentStudentLinksTable)
      .where(eq(parentStudentLinksTable.parentId, userId));

    const studentIds = links.map((l) => l.studentId);

    const students = studentIds.length
      ? await db.select().from(usersTable).where(inArray(usersTable.id, studentIds))
      : [];

    const enrollments = studentIds.length
      ? await db.select().from(studentEnrollmentsTable).where(inArray(studentEnrollmentsTable.studentId, studentIds))
      : [];

    const classIds = [...new Set(enrollments.map((e) => e.classId))];

    const [classes, allSessions] = await Promise.all([
      classIds.length ? db.select({ id: classesTable.id, code: classesTable.code, name: classesTable.name }).from(classesTable).where(inArray(classesTable.id, classIds)) : [],
      classIds.length ? db.select({ id: classSessionsTable.id, classId: classSessionsTable.classId }).from(classSessionsTable).where(inArray(classSessionsTable.classId, classIds)) : [],
    ]);

    const sessionIds = allSessions.map((s) => s.id);

    const attendedSessions = studentIds.length && sessionIds.length
      ? await db
          .select({ classSessionId: studentSessionsTable.classSessionId, studentId: studentSessionsTable.studentId, attendanceStatus: studentSessionsTable.attendanceStatus })
          .from(studentSessionsTable)
          .where(and(inArray(studentSessionsTable.studentId, studentIds), inArray(studentSessionsTable.classSessionId, sessionIds)))
      : [];

    const classMap = new Map(classes.map((c) => [c.id, c]));
    const sessionsByClass = new Map<string, string[]>();
    for (const s of allSessions) {
      if (!sessionsByClass.has(s.classId)) sessionsByClass.set(s.classId, []);
      sessionsByClass.get(s.classId)!.push(s.id);
    }

    const attendedStatuses = new Set(["present", "attended", "makeup", "makeup_done", "makeup_wait", "late"]);

    // DEBUG: log raw attendance statuses to help diagnose counting issues
    const uniqueStatuses = [...new Set(attendedSessions.map(a => a.attendanceStatus))];
    console.log(`[parent/profile] studentIds=${studentIds.length}, sessionIds=${sessionIds.length}, attendedSessionsRows=${attendedSessions.length}, uniqueStatuses=${JSON.stringify(uniqueStatuses)}`);

    const linkedStudents = students.map((student) => {
      const link = links.find((l) => l.studentId === student.id);
      const studentEnrollments = enrollments.filter((e) => e.studentId === student.id);

      const enrolledClasses = studentEnrollments.map((enr) => {
        const cls = classMap.get(enr.classId);
        const classSessions = sessionsByClass.get(enr.classId) ?? [];
        const totalSessions = classSessions.length;
        const attendedCount = attendedSessions.filter(
          (a) => a.studentId === student.id && classSessions.includes(a.classSessionId) && attendedStatuses.has(a.attendanceStatus)
        ).length;
        return {
          classId: enr.classId,
          classCode: cls?.code ?? "",
          className: cls?.name ?? "",
          status: "active",
          startDate: null,
          endDate: null,
          totalSessions,
          attendedSessions: attendedCount,
          remainingSessions: Math.max(0, totalSessions - attendedCount),
        };
      });

      return {
        id: student.id,
        code: student.username,
        fullName: student.name ?? student.username,
        phone: null,
        email: null,
        dateOfBirth: null,
        gender: null,
        address: null,
        accountStatus: "Hoạt động",
        status: "active",
        relationship: link?.relationship ?? null,
        enrolledClasses,
      };
    });

    const parentData = {
      id: user.id,
      code: profile?.code ?? user.username,
      fullName: user.name ?? user.username,
      type: "Phụ huynh",
      phone: profile?.phone ?? null,
      email: profile?.email ?? null,
      dateOfBirth: profile?.dateOfBirth ?? null,
      gender: profile?.gender ?? null,
      address: profile?.address ?? null,
      relationship: profile?.relationship ?? null,
      accountStatus: profile?.accountStatus ?? "Hoạt động",
      status: "active",
    };

    return res.json({ parent: parentData, linkedStudents });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ─── Parent Notifications ─────────────────────────────────────────────────────

async function getParentAndStudentIds(userId: string): Promise<{ parentOk: boolean; allUserIds: string[]; studentMap: Map<string, { id: string; fullName: string; code: string }> }> {
  const [user] = await db.select({ id: usersTable.id, role: usersTable.role }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user || user.role !== "parent") return { parentOk: false, allUserIds: [], studentMap: new Map() };

  const links = await db.select({ studentId: parentStudentLinksTable.studentId }).from(parentStudentLinksTable).where(eq(parentStudentLinksTable.parentId, userId));
  const studentIds = links.map((l) => l.studentId);

  const studentMap = new Map<string, { id: string; fullName: string; code: string }>();
  if (studentIds.length) {
    const students = await db.select({ id: usersTable.id, name: usersTable.name, username: usersTable.username }).from(usersTable).where(inArray(usersTable.id, studentIds));
    for (const s of students) {
      studentMap.set(s.id, { id: s.id, fullName: s.name ?? s.username, code: s.username });
    }
  }

  return { parentOk: true, allUserIds: [userId, ...studentIds], studentMap };
}

// GET /mobile/parent/notifications
router.get("/mobile/parent/notifications", requireAuth, async (req, res) => {
  const userId = req.session.userId as string;
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Number(req.query.offset) || 0;

    const { parentOk, allUserIds, studentMap } = await getParentAndStudentIds(userId);
    if (!parentOk) return res.status(403).json({ message: "Tài khoản này không phải tài khoản phụ huynh" });

    if (!allUserIds.length) return res.json({ notifications: [], totalUnread: 0 });

    const [notifications, unreadRows] = await Promise.all([
      db.select().from(notificationsTable)
        .where(inArray(notificationsTable.userId, allUserIds))
        .orderBy(desc(notificationsTable.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ cnt: count() }).from(notificationsTable)
        .where(and(inArray(notificationsTable.userId, allUserIds), eq(notificationsTable.isRead, false))),
    ]);

    const totalUnread = Number(unreadRows[0]?.cnt ?? 0);

    const result = notifications.map((n) => {
      const isSelf = n.userId === userId;
      const student = isSelf ? null : (studentMap.get(n.userId) ?? null);
      return { ...n, isSelf, student };
    });

    return res.json({ items: result, totalUnread, limit, offset });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// GET /mobile/parent/notifications/unread-count
router.get("/mobile/parent/notifications/unread-count", requireAuth, async (req, res) => {
  const userId = req.session.userId as string;
  try {
    const { parentOk, allUserIds, studentMap } = await getParentAndStudentIds(userId);
    if (!parentOk) return res.status(403).json({ message: "Tài khoản này không phải tài khoản phụ huynh" });

    if (!allUserIds.length) return res.json({ total: 0, byStudent: [] });

    const rows = await db.select({ userId: notificationsTable.userId, cnt: count() })
      .from(notificationsTable)
      .where(and(inArray(notificationsTable.userId, allUserIds), eq(notificationsTable.isRead, false)))
      .groupBy(notificationsTable.userId);

    let total = 0;
    const byStudent: { studentId: string; fullName: string; code: string; unread: number }[] = [];

    for (const row of rows) {
      total += Number(row.cnt);
      if (row.userId !== userId) {
        const s = studentMap.get(row.userId);
        if (s) byStudent.push({ studentId: s.id, fullName: s.fullName, code: s.code, unread: Number(row.cnt) });
      }
    }

    return res.json({ total, byStudent });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// PATCH /mobile/parent/notifications/:id/read
router.patch("/mobile/parent/notifications/:id/read", requireAuth, async (req, res) => {
  const userId = req.session.userId as string;
  try {
    const { parentOk, allUserIds } = await getParentAndStudentIds(userId);
    if (!parentOk) return res.status(403).json({ message: "Tài khoản này không phải tài khoản phụ huynh" });

    const notifId = req.params.id;
    const [notif] = await db.select({ id: notificationsTable.id, userId: notificationsTable.userId })
      .from(notificationsTable).where(eq(notificationsTable.id, notifId)).limit(1);

    if (!notif || !allUserIds.includes(notif.userId)) return res.status(404).json({ message: "Không tìm thấy thông báo" });

    await db.update(notificationsTable).set({ isRead: true }).where(eq(notificationsTable.id, notifId));
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// PATCH /mobile/parent/notifications/read-all
router.patch("/mobile/parent/notifications/read-all", requireAuth, async (req, res) => {
  const userId = req.session.userId as string;
  try {
    const { parentOk, allUserIds } = await getParentAndStudentIds(userId);
    if (!parentOk) return res.status(403).json({ message: "Tài khoản này không phải tài khoản phụ huynh" });

    if (allUserIds.length) {
      await db.update(notificationsTable).set({ isRead: true }).where(inArray(notificationsTable.userId, allUserIds));
    }
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

export default router;
