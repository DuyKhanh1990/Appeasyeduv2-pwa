import { Router } from "express";
import multer from "multer";
import { db, usersTable, taskStatusesTable, taskLevelsTable, tasksTable, taskCommentsTable, classSessionsTable, studentSessionsTable } from "@workspace/db";
import { eq, and, or, inArray, notInArray, asc, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { uploadBufferToObjectStorage } from "../lib/uploadHelper";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

const router = Router();

type Permissions = {
  canView: boolean;
  canViewAll: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

function getPermissions(role: string): Permissions {
  if (role === "admin") {
    return { canView: true, canViewAll: true, canCreate: true, canEdit: true, canDelete: true };
  }
  if (role === "teacher" || role === "staff") {
    return { canView: true, canViewAll: false, canCreate: true, canEdit: true, canDelete: false };
  }
  return { canView: false, canViewAll: false, canCreate: false, canEdit: false, canDelete: false };
}

function canViewTask(task: any, userId: string, permissions: Permissions): boolean {
  if (!permissions.canView) return false;
  if (permissions.canViewAll) return true;
  const assignees: string[] = task.assigneeIds ?? [];
  return task.creatorId === userId || task.managerId === userId || assignees.includes(userId);
}

async function getUser(userId: string) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  return user ?? null;
}

const DEFAULT_STATUS = { id: "unknown", name: "Không xác định", color: "#6b7280", position: 0, isFixed: false };

async function enrichTask(task: any, allUsers: Map<string, any>, statuses: Map<string, any>, levels: Map<string, any>) {
  const assigneeIds: string[] = task.assigneeIds ?? [];
  const status = (task.statusId ? statuses.get(task.statusId) : null) || { ...DEFAULT_STATUS, id: task.statusId || "unknown" };
  const level = task.levelId ? (levels.get(task.levelId) || null) : null;
  const managerUser = task.managerId ? allUsers.get(task.managerId) : null;
  return {
    id: task.id,
    title: task.title,
    description: task.description || null,
    content: task.description || null,
    status,
    level,
    creator: task.creatorId ? pickPerson(allUsers.get(task.creatorId)) : null,
    creatorName: task.creatorId ? formatCreatorName(allUsers.get(task.creatorId)) : null,
    managers: managerUser ? [pickDetailPerson(managerUser)] : [],
    assignees: assigneeIds.map((id) => pickDetailPerson(allUsers.get(id))).filter(Boolean),
    attachments: task.attachments ?? [],
    locationIds: task.locationIds ?? [],
    locationDetails: [],
    departmentId: task.departmentId ?? null,
    department: null,
    subjectIds: task.subjectIds ?? [],
    subjects: (task.subjectIds ?? []).map((id: string) => {
      const u = allUsers.get(id);
      if (!u) return null;
      return { id: u.id, fullName: u.name ?? u.username, code: u.username?.toUpperCase() ?? "", type: "Học viên" };
    }).filter(Boolean),
    dueDate: task.dueDate ? task.dueDate.toISOString() : null,
    createdAt: task.createdAt?.toISOString() || null,
    updatedAt: task.updatedAt?.toISOString() || null,
  };
}

function formatCreatorName(user: any): string | null {
  if (!user) return null;
  const name = user.name ?? user.username;
  const code = user.username?.toUpperCase();
  return code ? `${name} (${code})` : name;
}

function pickPerson(user: any) {
  if (!user) return undefined;
  return { id: user.id, name: user.name ?? user.username, username: user.username };
}

function pickDetailPerson(user: any) {
  if (!user) return undefined;
  return {
    id: user.id,
    fullName: user.name ?? user.username,
    code: user.username?.toUpperCase() ?? "",
  };
}

async function buildUserMap(tasks: any[]): Promise<Map<string, any>> {
  const userIds = new Set<string>();
  for (const t of tasks) {
    if (t.creatorId) userIds.add(t.creatorId);
    if (t.managerId) userIds.add(t.managerId);
    const assignees: string[] = t.assigneeIds ?? [];
    assignees.forEach((id) => userIds.add(id));
    const subjects: string[] = t.subjectIds ?? [];
    subjects.forEach((id) => userIds.add(id));
  }
  if (userIds.size === 0) return new Map();
  const users = await db.select().from(usersTable).where(inArray(usersTable.id, [...userIds]));
  return new Map(users.map((u) => [u.id, u]));
}

async function ensureDefaultData() {
  const existingStatuses = await db.select().from(taskStatusesTable).limit(1);
  if (existingStatuses.length === 0) {
    await db.insert(taskStatusesTable).values([
      { name: "Cần làm", color: "#6b7280", position: 0, isFixed: true },
      { name: "Đang làm", color: "#3b82f6", position: 1, isFixed: false },
      { name: "Chờ duyệt", color: "#f59e0b", position: 2, isFixed: false },
      { name: "Hoàn thành", color: "#10b981", position: 3, isFixed: true },
    ]);
  }
  const existingLevels = await db.select().from(taskLevelsTable).limit(1);
  if (existingLevels.length === 0) {
    await db.insert(taskLevelsTable).values([
      { name: "Thấp", color: "#10b981", position: 0 },
      { name: "Bình thường", color: "#3b82f6", position: 1 },
      { name: "Cao", color: "#f59e0b", position: 2 },
      { name: "Khẩn cấp", color: "#ef4444", position: 3 },
    ]);
  }
}

router.get("/mobile/users", requireAuth, async (req, res) => {
  try {
    const user = await getUser(req.session.userId as string);
    if (!user) return res.status(401).json({ message: "Chưa đăng nhập" });
    const permissions = getPermissions(user.role);
    if (!permissions.canView) return res.status(403).json({ message: "Không có quyền" });
    const users = await db
      .select({ id: usersTable.id, name: usersTable.name, username: usersTable.username, role: usersTable.role })
      .from(usersTable)
      .where(notInArray(usersTable.role, ["student", "parent"]))
      .orderBy(asc(usersTable.name));
    return res.json(users.map((u) => ({ id: u.id, name: u.name ?? null, username: u.username, role: u.role })));
  } catch (err) {
    console.error("GET /mobile/users error:", err);
    return res.status(500).json({ message: "Lỗi server" });
  }
});

router.get("/mobile/subjects", requireAuth, async (req, res) => {
  try {
    const user = await getUser(req.session.userId as string);
    if (!user) return res.status(401).json({ message: "Chưa đăng nhập" });
    const permissions = getPermissions(user.role);
    if (!permissions.canView) return res.status(403).json({ message: "Không có quyền" });
    const { search } = req.query as { search?: string };
    let query = db
      .select({ id: usersTable.id, name: usersTable.name, username: usersTable.username, role: usersTable.role })
      .from(usersTable)
      .where(eq(usersTable.role, "student"))
      .$dynamic();
    const students = await query.orderBy(asc(usersTable.name));
    let result = students;
    if (search) {
      const s = search.toLowerCase();
      result = students.filter(
        (u) => (u.name ?? "").toLowerCase().includes(s) || u.username.toLowerCase().includes(s)
      );
    }
    return res.json(result.map((u) => ({ id: u.id, name: u.name ?? null, username: u.username, role: u.role })));
  } catch (err) {
    console.error("GET /mobile/subjects error:", err);
    return res.status(500).json({ message: "Lỗi server" });
  }
});

router.get("/mobile/tasks/meta", requireAuth, async (req, res) => {
  try {
    await ensureDefaultData();
    const user = await getUser(req.session.userId as string);
    if (!user) return res.status(401).json({ message: "Không tìm thấy người dùng" });
    const permissions = getPermissions(user.role);

    const [statuses, levels, staffList, studentList] = await Promise.all([
      db.select().from(taskStatusesTable).orderBy(asc(taskStatusesTable.position)),
      db.select().from(taskLevelsTable).orderBy(asc(taskLevelsTable.position)),
      db.select({ id: usersTable.id, name: usersTable.name, username: usersTable.username })
        .from(usersTable)
        .where(inArray(usersTable.role, ["teacher", "staff", "admin"]))
        .orderBy(asc(usersTable.name)),
      db.select({ id: usersTable.id, name: usersTable.name, username: usersTable.username })
        .from(usersTable)
        .where(eq(usersTable.role, "student"))
        .orderBy(asc(usersTable.name)),
    ]);

    return res.json({
      permissions,
      statuses: statuses.map((s) => ({ id: s.id, name: s.name, color: s.color, position: s.position, isFixed: s.isFixed })),
      levels: levels.map((l) => ({ id: l.id, name: l.name, color: l.color, position: l.position })),
      staff: staffList.map((u) => ({ id: u.id, fullName: u.name ?? u.username, code: u.username.toUpperCase() })),
      students: studentList.map((u) => ({ id: u.id, fullName: u.name ?? u.username, code: u.username.toUpperCase() })),
      locations: [],
      departments: [],
    });
  } catch (err) {
    console.error("GET /mobile/tasks/meta error:", err);
    return res.status(500).json({ message: "Lỗi server" });
  }
});

router.get("/mobile/tasks/kanban", requireAuth, async (req, res) => {
  try {
    await ensureDefaultData();
    const user = await getUser(req.session.userId as string);
    if (!user) return res.status(401).json({ message: "Không tìm thấy người dùng" });
    const permissions = getPermissions(user.role);

    if (!permissions.canView) {
      return res.status(403).json({ message: "Không có quyền xem công việc" });
    }

    const [allStatuses, allLevels, allTasks] = await Promise.all([
      db.select().from(taskStatusesTable).orderBy(asc(taskStatusesTable.position)),
      db.select().from(taskLevelsTable).orderBy(asc(taskLevelsTable.position)),
      db.select().from(tasksTable).orderBy(asc(tasksTable.createdAt)),
    ]);

    const filteredTasks = allTasks.filter((t) => canViewTask(t, user.id, permissions));
    const userMap = await buildUserMap(filteredTasks);
    const statusMap = new Map(allStatuses.map((s) => [s.id, { id: s.id, name: s.name, color: s.color, position: s.position, isFixed: s.isFixed }]));
    const levelMap = new Map(allLevels.map((l) => [l.id, { id: l.id, name: l.name, color: l.color, position: l.position }]));

    const enrichedTasks = await Promise.all(filteredTasks.map((t) => enrichTask(t, userMap, statusMap, levelMap)));

    const columns = allStatuses.map((status) => ({
      status: { id: status.id, name: status.name, color: status.color, position: status.position, isFixed: status.isFixed },
      tasks: enrichedTasks.filter((t) => t.status.id === status.id),
    }));

    return res.json({
      permissions,
      statuses: allStatuses.map((s) => ({ id: s.id, name: s.name, color: s.color, position: s.position, isFixed: s.isFixed })),
      levels: allLevels.map((l) => ({ id: l.id, name: l.name, color: l.color, position: l.position })),
      columns,
    });
  } catch (err) {
    console.error("GET /mobile/tasks/kanban error:", err);
    return res.status(500).json({ message: "Lỗi server" });
  }
});

router.get("/mobile/tasks", requireAuth, async (req, res) => {
  try {
    await ensureDefaultData();
    const user = await getUser(req.session.userId as string);
    if (!user) return res.status(401).json({ message: "Không tìm thấy người dùng" });
    const permissions = getPermissions(user.role);

    if (!permissions.canView) {
      return res.status(403).json({ message: "Không có quyền xem công việc" });
    }

    const { statusId, levelId, search } = req.query as Record<string, string>;

    let query = db.select().from(tasksTable).$dynamic();

    const conditions = [];
    if (statusId) conditions.push(eq(tasksTable.statusId, statusId));
    if (levelId) conditions.push(eq(tasksTable.levelId, levelId));
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    const allTasks = await query.orderBy(asc(tasksTable.createdAt));
    let filtered = allTasks.filter((t) => canViewTask(t, user.id, permissions));

    if (search) {
      const s = search.toLowerCase();
      filtered = filtered.filter((t) => t.title.toLowerCase().includes(s) || (t.description ?? "").toLowerCase().includes(s));
    }

    const [allStatuses, allLevels] = await Promise.all([
      db.select().from(taskStatusesTable),
      db.select().from(taskLevelsTable),
    ]);
    const statusMap = new Map(allStatuses.map((s) => [s.id, { id: s.id, name: s.name, color: s.color, position: s.position, isFixed: s.isFixed }]));
    const levelMap = new Map(allLevels.map((l) => [l.id, { id: l.id, name: l.name, color: l.color, position: l.position }]));
    const userMap = await buildUserMap(filtered);

    const enriched = await Promise.all(filtered.map((t) => enrichTask(t, userMap, statusMap, levelMap)));
    return res.json(enriched);
  } catch (err) {
    console.error("GET /mobile/tasks error:", err);
    return res.status(500).json({ message: "Lỗi server" });
  }
});

router.get("/mobile/staff/dashboard-stats", requireAuth, async (req, res) => {
  try {
    const staffId = req.session.userId as string;
    const user = await getUser(staffId);
    if (!user) return res.status(401).json({ message: "Không tìm thấy người dùng" });
    const permissions = getPermissions(user.role);

    const sessions = await db
      .select({ id: classSessionsTable.id, classId: classSessionsTable.classId })
      .from(classSessionsTable)
      .where(sql`${classSessionsTable.teacherIds}::jsonb @> ${JSON.stringify([staffId])}::jsonb`);

    const classCount = new Set(sessions.map((s) => s.classId)).size;
    const totalSessions = sessions.length;
    const sessionIds = sessions.map((s) => s.id);

    let taughtSessions = 0;
    if (sessionIds.length > 0) {
      const attendanceRows = await db
        .select({ classSessionId: studentSessionsTable.classSessionId })
        .from(studentSessionsTable)
        .where(and(inArray(studentSessionsTable.classSessionId, sessionIds), sql`${studentSessionsTable.attendanceStatus} != 'pending'`));
      taughtSessions = new Set(attendanceRows.map((r) => r.classSessionId)).size;
    }

    let taskDone = 0;
    let taskTotal = 0;
    if (permissions.canView) {
      const [allStatuses, allTasks] = await Promise.all([
        db.select().from(taskStatusesTable),
        db.select().from(tasksTable),
      ]);
      const statusMap = new Map(allStatuses.map((s) => [s.id, s]));
      const filteredTasks = allTasks.filter((t) => canViewTask(t, user.id, permissions));
      taskTotal = filteredTasks.length;
      taskDone = filteredTasks.filter((t) => statusMap.get(t.statusId)?.name === "Hoàn thành").length;
    }

    return res.json({
      classCount,
      tasks: { done: taskDone, total: taskTotal },
      sessions: { taught: taughtSessions, total: totalSessions },
    });
  } catch (err) {
    console.error("GET /mobile/staff/dashboard-stats error:", err);
    return res.status(500).json({ message: "Lỗi server" });
  }
});

router.get("/mobile/tasks/:id", requireAuth, async (req, res) => {
  try {
    const user = await getUser(req.session.userId as string);
    if (!user) return res.status(401).json({ message: "Không tìm thấy người dùng" });
    const permissions = getPermissions(user.role);
    if (!permissions.canView) return res.status(403).json({ message: "Không có quyền" });

    const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, req.params.id)).limit(1);
    if (!task) return res.status(404).json({ message: "Không tìm thấy công việc" });
    if (!canViewTask(task, user.id, permissions)) return res.status(403).json({ message: "Không có quyền xem công việc này" });

    const [allStatuses, allLevels] = await Promise.all([
      db.select().from(taskStatusesTable),
      db.select().from(taskLevelsTable),
    ]);
    const statusMap = new Map(allStatuses.map((s) => [s.id, { id: s.id, name: s.name, color: s.color, position: s.position, isFixed: s.isFixed }]));
    const levelMap = new Map(allLevels.map((l) => [l.id, { id: l.id, name: l.name, color: l.color, position: l.position }]));
    const userMap = await buildUserMap([task]);

    const enriched = await enrichTask(task, userMap, statusMap, levelMap);
    return res.json({
      permissions: { canEdit: permissions.canEdit, canDelete: permissions.canDelete },
      task: enriched,
      status: enriched.status,
      level: enriched.level,
      managers: enriched.managers,
      assignees: enriched.assignees,
      subjects: enriched.subjects,
      locationDetails: enriched.locationDetails,
      department: enriched.department,
      creatorName: enriched.creatorName,
    });
  } catch (err) {
    console.error("GET /mobile/tasks/:id error:", err);
    return res.status(500).json({ message: "Lỗi server" });
  }
});

router.post("/mobile/tasks", requireAuth, async (req, res) => {
  try {
    const user = await getUser(req.session.userId as string);
    if (!user) return res.status(401).json({ message: "Không tìm thấy người dùng" });
    const permissions = getPermissions(user.role);
    if (!permissions.canCreate) return res.status(403).json({ message: "Không có quyền tạo công việc" });

    const { title, description, content, statusId, levelId, managerId, managerIds, assigneeIds, subjectIds, dueDate, attachments } = req.body;
    const resolvedDescription = description ?? content;
    const resolvedManagerId = managerId || (Array.isArray(managerIds) ? managerIds[0] : undefined);
    if (!title?.trim()) return res.status(400).json({ message: "Tiêu đề không được để trống" });
    if (!statusId) return res.status(400).json({ message: "Vui lòng chọn trạng thái" });

    const [status] = await db.select().from(taskStatusesTable).where(eq(taskStatusesTable.id, statusId)).limit(1);
    if (!status) return res.status(400).json({ message: "Trạng thái không hợp lệ" });

    const [newTask] = await db.insert(tasksTable).values({
      title: title.trim(),
      description: resolvedDescription?.trim() || null,
      statusId,
      levelId: levelId || null,
      creatorId: user.id,
      managerId: resolvedManagerId || null,
      assigneeIds: Array.isArray(assigneeIds) ? assigneeIds : [],
      subjectIds: Array.isArray(subjectIds) ? subjectIds : [],
      attachments: Array.isArray(attachments) ? attachments : [],
      dueDate: dueDate ? new Date(dueDate) : null,
    }).returning();

    const [allStatuses, allLevels] = await Promise.all([
      db.select().from(taskStatusesTable),
      db.select().from(taskLevelsTable),
    ]);
    const statusMap = new Map(allStatuses.map((s) => [s.id, { id: s.id, name: s.name, color: s.color, position: s.position, isFixed: s.isFixed }]));
    const levelMap = new Map(allLevels.map((l) => [l.id, { id: l.id, name: l.name, color: l.color, position: l.position }]));
    const userMap = await buildUserMap([newTask]);

    return res.status(201).json(await enrichTask(newTask, userMap, statusMap, levelMap));
  } catch (err) {
    console.error("POST /mobile/tasks error:", err);
    return res.status(500).json({ message: "Lỗi server" });
  }
});

router.patch("/mobile/tasks/:id", requireAuth, async (req, res) => {
  try {
    const user = await getUser(req.session.userId as string);
    if (!user) return res.status(401).json({ message: "Không tìm thấy người dùng" });
    const permissions = getPermissions(user.role);
    if (!permissions.canEdit) return res.status(403).json({ message: "Không có quyền sửa công việc" });

    const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, req.params.id)).limit(1);
    if (!task) return res.status(404).json({ message: "Không tìm thấy công việc" });
    if (!canViewTask(task, user.id, permissions)) return res.status(403).json({ message: "Không có quyền sửa công việc này" });

    const { title, description, content, statusId, levelId, managerId, managerIds, assigneeIds, subjectIds, dueDate, attachments } = req.body;
    const resolvedDescription = description ?? content;
    const resolvedManagerId = managerId !== undefined ? managerId : (Array.isArray(managerIds) ? managerIds[0] : undefined);

    const updates: any = { updatedAt: new Date() };
    if (title !== undefined) updates.title = title.trim();
    if (resolvedDescription !== undefined) updates.description = resolvedDescription?.trim() || null;
    if (statusId !== undefined) updates.statusId = statusId;
    if (levelId !== undefined) updates.levelId = levelId || null;
    if (resolvedManagerId !== undefined) updates.managerId = resolvedManagerId || null;
    if (assigneeIds !== undefined) updates.assigneeIds = Array.isArray(assigneeIds) ? assigneeIds : [];
    if (subjectIds !== undefined) updates.subjectIds = Array.isArray(subjectIds) ? subjectIds : [];
    if (attachments !== undefined) updates.attachments = Array.isArray(attachments) ? attachments : [];
    if (dueDate !== undefined) updates.dueDate = dueDate ? new Date(dueDate) : null;

    const [updated] = await db.update(tasksTable).set(updates).where(eq(tasksTable.id, req.params.id)).returning();

    const [allStatuses, allLevels] = await Promise.all([
      db.select().from(taskStatusesTable),
      db.select().from(taskLevelsTable),
    ]);
    const statusMap = new Map(allStatuses.map((s) => [s.id, { id: s.id, name: s.name, color: s.color, position: s.position, isFixed: s.isFixed }]));
    const levelMap = new Map(allLevels.map((l) => [l.id, { id: l.id, name: l.name, color: l.color, position: l.position }]));
    const userMap = await buildUserMap([updated]);

    return res.json(await enrichTask(updated, userMap, statusMap, levelMap));
  } catch (err) {
    console.error("PATCH /mobile/tasks/:id error:", err);
    return res.status(500).json({ message: "Lỗi server" });
  }
});

router.delete("/mobile/tasks/:id", requireAuth, async (req, res) => {
  try {
    const user = await getUser(req.session.userId as string);
    if (!user) return res.status(401).json({ message: "Không tìm thấy người dùng" });
    const permissions = getPermissions(user.role);
    if (!permissions.canDelete) return res.status(403).json({ message: "Không có quyền xóa công việc" });

    const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, req.params.id)).limit(1);
    if (!task) return res.status(404).json({ message: "Không tìm thấy công việc" });

    await db.delete(tasksTable).where(eq(tasksTable.id, req.params.id));
    return res.json({ message: "Đã xóa công việc" });
  } catch (err) {
    console.error("DELETE /mobile/tasks/:id error:", err);
    return res.status(500).json({ message: "Lỗi server" });
  }
});

router.get("/mobile/tasks/:id/comments", requireAuth, async (req, res) => {
  try {
    const user = await getUser(req.session.userId as string);
    if (!user) return res.status(401).json({ message: "Không tìm thấy người dùng" });
    const permissions = getPermissions(user.role);
    if (!permissions.canView) return res.status(403).json({ message: "Không có quyền" });

    const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, req.params.id)).limit(1);
    if (!task) return res.status(404).json({ message: "Không tìm thấy công việc" });
    if (!canViewTask(task, user.id, permissions)) return res.status(403).json({ message: "Không có quyền xem công việc này" });

    const comments = await db.select().from(taskCommentsTable)
      .where(eq(taskCommentsTable.taskId, req.params.id))
      .orderBy(asc(taskCommentsTable.createdAt));

    const authorIds = [...new Set(comments.map((c) => c.authorId))];
    const authors = authorIds.length > 0
      ? await db.select().from(usersTable).where(inArray(usersTable.id, authorIds))
      : [];
    const authorMap = new Map(authors.map((a) => [a.id, a]));

    return res.json(comments.map((c) => ({
      id: c.id,
      content: c.content,
      author: pickPerson(authorMap.get(c.authorId)),
      createdAt: c.createdAt?.toISOString(),
    })));
  } catch (err) {
    console.error("GET /mobile/tasks/:id/comments error:", err);
    return res.status(500).json({ message: "Lỗi server" });
  }
});

router.post("/mobile/tasks/:id/comments", requireAuth, async (req, res) => {
  try {
    const user = await getUser(req.session.userId as string);
    if (!user) return res.status(401).json({ message: "Không tìm thấy người dùng" });
    const permissions = getPermissions(user.role);
    if (!permissions.canView) return res.status(403).json({ message: "Không có quyền" });

    const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, req.params.id)).limit(1);
    if (!task) return res.status(404).json({ message: "Không tìm thấy công việc" });
    if (!canViewTask(task, user.id, permissions)) return res.status(403).json({ message: "Không có quyền" });

    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ message: "Nội dung bình luận không được để trống" });

    const [comment] = await db.insert(taskCommentsTable).values({
      taskId: req.params.id,
      authorId: user.id,
      content: content.trim(),
    }).returning();

    return res.status(201).json({
      id: comment.id,
      content: comment.content,
      author: pickPerson(user),
      createdAt: comment.createdAt?.toISOString(),
    });
  } catch (err) {
    console.error("POST /mobile/tasks/:id/comments error:", err);
    return res.status(500).json({ message: "Lỗi server" });
  }
});

router.delete("/mobile/tasks/:taskId/comments/:commentId", requireAuth, async (req, res) => {
  try {
    const user = await getUser(req.session.userId as string);
    if (!user) return res.status(401).json({ message: "Không tìm thấy người dùng" });
    const permissions = getPermissions(user.role);
    if (!permissions.canEdit && !permissions.canDelete) return res.status(403).json({ message: "Không có quyền" });

    const [comment] = await db.select().from(taskCommentsTable)
      .where(and(eq(taskCommentsTable.id, req.params.commentId), eq(taskCommentsTable.taskId, req.params.taskId)))
      .limit(1);

    if (!comment) return res.status(404).json({ message: "Không tìm thấy bình luận" });

    if (!permissions.canDelete && comment.authorId !== user.id) {
      return res.status(403).json({ message: "Chỉ có thể xóa bình luận của mình" });
    }

    await db.delete(taskCommentsTable).where(eq(taskCommentsTable.id, req.params.commentId));
    return res.json({ message: "Đã xóa bình luận" });
  } catch (err) {
    console.error("DELETE /mobile/tasks/:taskId/comments/:commentId error:", err);
    return res.status(500).json({ message: "Lỗi server" });
  }
});

router.get("/mobile/tasks/:id/attachments", requireAuth, async (req, res) => {
  try {
    const user = await getUser(req.session.userId as string);
    if (!user) return res.status(401).json({ message: "Không tìm thấy người dùng" });
    const permissions = getPermissions(user.role);
    if (!permissions.canView) return res.status(403).json({ message: "Không có quyền" });

    const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, req.params.id)).limit(1);
    if (!task) return res.status(404).json({ message: "Không tìm thấy công việc" });
    if (!canViewTask(task, user.id, permissions)) return res.status(403).json({ message: "Không có quyền xem công việc này" });

    return res.json((task as any).attachments ?? []);
  } catch (err) {
    console.error("GET /mobile/tasks/:id/attachments error:", err);
    return res.status(500).json({ message: "Lỗi server" });
  }
});

router.post("/mobile/tasks/:id/attachments", requireAuth, upload.array("files"), async (req, res) => {
  try {
    const user = await getUser(req.session.userId as string);
    if (!user) return res.status(401).json({ message: "Không tìm thấy người dùng" });
    const permissions = getPermissions(user.role);
    if (!permissions.canView) return res.status(403).json({ message: "Không có quyền" });

    const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, req.params.id as string)).limit(1);
    if (!task) return res.status(404).json({ message: "Không tìm thấy công việc" });
    if (!canViewTask(task, user.id, permissions)) return res.status(403).json({ message: "Không có quyền" });

    const files = (req.files as Express.Multer.File[]) || [];
    if (files.length === 0) return res.status(400).json({ message: "Không có file nào được gửi lên" });

    const uploaded = await Promise.all(files.map((f) => uploadBufferToObjectStorage(f)));
    const newAttachments = uploaded.map((u) => ({
      id: crypto.randomUUID(),
      name: u.name,
      url: u.url,
      size: u.size,
      mimetype: u.mimetype,
      uploadedBy: user.id,
      uploadedAt: new Date().toISOString(),
    }));

    const existing = ((task as any).attachments ?? []) as any[];
    const merged = [...existing, ...newAttachments];

    await db.update(tasksTable).set({ attachments: merged, updatedAt: new Date() }).where(eq(tasksTable.id, req.params.id as string));

    return res.status(201).json({ attachments: merged });
  } catch (err) {
    console.error("POST /mobile/tasks/:id/attachments error:", err);
    return res.status(500).json({ message: "Lỗi khi tải file lên" });
  }
});

router.delete("/mobile/tasks/:id/attachments", requireAuth, async (req, res) => {
  try {
    const user = await getUser(req.session.userId as string);
    if (!user) return res.status(401).json({ message: "Không tìm thấy người dùng" });
    const permissions = getPermissions(user.role);
    if (!permissions.canEdit && !permissions.canDelete) return res.status(403).json({ message: "Không có quyền" });

    const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, req.params.id)).limit(1);
    if (!task) return res.status(404).json({ message: "Không tìm thấy công việc" });

    const { url } = req.body as { url?: string };
    if (!url) return res.status(400).json({ message: "Thiếu url của file cần xoá" });

    const existing = ((task as any).attachments ?? []) as any[];
    const target = existing.find((a: any) => a.url === url);
    if (!target) return res.status(404).json({ message: "Không tìm thấy file đính kèm" });

    if (!permissions.canDelete && target.uploadedBy !== user.id) {
      return res.status(403).json({ message: "Chỉ có thể xóa file mình đã tải lên" });
    }

    const remaining = existing.filter((a: any) => a.url !== url);
    await db.update(tasksTable).set({ attachments: remaining, updatedAt: new Date() }).where(eq(tasksTable.id, req.params.id));

    return res.json({ attachments: remaining });
  } catch (err) {
    console.error("DELETE /mobile/tasks/:id/attachments error:", err);
    return res.status(500).json({ message: "Lỗi server" });
  }
});

export default router;
