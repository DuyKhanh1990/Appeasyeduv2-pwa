import { Router } from "express";
import { db, usersTable, parentStudentLinksTable, notificationsTable } from "@workspace/db";
import { eq, and, inArray, desc, count } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

type NotificationRow = typeof notificationsTable.$inferSelect;

/**
 * Trích xuất ngày buổi học (YYYY-MM-DD) từ tiêu đề + nội dung thông báo.
 * Hỗ trợ DD/MM/YYYY, DD/MM/YY, DD/MM (suy ra năm từ createdAt).
 *
 * KHÔNG dùng n.createdAt làm date vì đó là ngày TẠO thông báo, không phải
 * ngày của buổi học — gây router về hôm nay thay vì ngày session thực.
 */
function extractSessionDate(text: string, createdAt: Date): string | undefined {
  // DD/MM/YYYY (4-digit year)
  const m4 = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m4) return `${m4[3]}-${m4[2].padStart(2, "0")}-${m4[1].padStart(2, "0")}`;

  // DD/MM/YY (2-digit year)
  const m2 = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{2})(?!\d)/);
  if (m2) return `20${m2[3]}-${m2[2].padStart(2, "0")}-${m2[1].padStart(2, "0")}`;

  // DD/MM (không có năm) — negative lookahead tránh match "09/08" từ "09/08/26"
  const m1 = text.match(/(\d{1,2})\/(\d{1,2})(?!\/\d)/);
  if (m1) {
    const dd = m1[1].padStart(2, "0");
    const mm = m1[2].padStart(2, "0");
    const baseYear = createdAt.getFullYear();
    const candidate = new Date(`${baseYear}-${mm}-${dd}T00:00:00`);
    const diffMs = candidate.getTime() - createdAt.getTime();
    // Nếu ngày đó cách createdAt > 90 ngày về quá khứ → thông báo nhiều khả năng thuộc năm kế
    const year = diffMs < -90 * 24 * 3600 * 1000 ? baseYear + 1 : baseYear;
    return `${year}-${mm}-${dd}`;
  }

  return undefined;
}

function buildDeeplink(n: NotificationRow): { screen: string; params: Record<string, string> } | null {
  const text = `${n.title ?? ""} ${n.content ?? ""}`;
  const sessionDate = extractSessionDate(text, n.createdAt);
  switch (n.category) {
    // Các loại liên quan đến buổi học → mở tab Lịch đúng ngày
    case "attendance":
    case "review":    // Nhận xét giáo viên
    case "schedule":  // Thông báo lịch học thay đổi
    case "content":   // Nội dung buổi học
    case "class":     // Thông tin lớp học
      return { screen: "Calendar", params: sessionDate ? { date: sessionDate } : {} };
    case "assignment":
    case "homework":
      return { screen: "Assignments", params: sessionDate ? { date: sessionDate } : {} };
    case "invoice":
    case "payment":
      return { screen: "Invoices", params: n.referenceId ? { invoiceId: n.referenceId } : {} };
    case "score":
    case "grade":
    case "exam":
      return { screen: "ScoreSheet", params: {} };
    default:
      return null;
  }
}

async function resolveStudentIds(userId: string): Promise<{
  ok: boolean;
  role: string;
  targetUserIds: string[];
  studentMap: Map<string, { id: string; fullName: string; code: string }>;
}> {
  const [user] = await db
    .select({ id: usersTable.id, role: usersTable.role, name: usersTable.name, username: usersTable.username })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user) return { ok: false, role: "", targetUserIds: [], studentMap: new Map() };

  const studentMap = new Map<string, { id: string; fullName: string; code: string }>();

  if (user.role === "student") {
    studentMap.set(user.id, { id: user.id, fullName: user.name ?? user.username, code: user.username });
    return { ok: true, role: "student", targetUserIds: [user.id], studentMap };
  }

  if (user.role === "parent") {
    const links = await db
      .select({ studentId: parentStudentLinksTable.studentId })
      .from(parentStudentLinksTable)
      .where(eq(parentStudentLinksTable.parentId, userId));

    const studentIds = links.map((l) => l.studentId);
    if (!studentIds.length) return { ok: true, role: "parent", targetUserIds: [], studentMap };

    const students = await db
      .select({ id: usersTable.id, name: usersTable.name, username: usersTable.username })
      .from(usersTable)
      .where(inArray(usersTable.id, studentIds));

    for (const s of students) {
      studentMap.set(s.id, { id: s.id, fullName: s.name ?? s.username, code: s.username });
    }
    return { ok: true, role: "parent", targetUserIds: studentIds, studentMap };
  }

  return { ok: false, role: user.role, targetUserIds: [], studentMap };
}

// GET /mobile/student/notifications
router.get("/mobile/student/notifications", requireAuth, async (req, res) => {
  const userId = req.session.userId as string;
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Number(req.query.offset) || 0;

    const { ok, role, targetUserIds, studentMap } = await resolveStudentIds(userId);
    if (!ok) return res.status(403).json({ message: "Tài khoản không có quyền truy cập" });
    if (!targetUserIds.length) return res.json({ items: [], totalUnread: 0, limit, offset });

    const [notifications, unreadRows] = await Promise.all([
      db.select().from(notificationsTable)
        .where(inArray(notificationsTable.userId, targetUserIds))
        .orderBy(desc(notificationsTable.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ cnt: count() }).from(notificationsTable)
        .where(and(inArray(notificationsTable.userId, targetUserIds), eq(notificationsTable.isRead, false))),
    ]);

    const totalUnread = Number(unreadRows[0]?.cnt ?? 0);

    const items = notifications.map((n) => {
      const student = role === "parent" ? (studentMap.get(n.userId) ?? null) : null;
      return {
        id: n.id,
        title: n.title,
        content: n.content,
        category: n.category,
        referenceId: n.referenceId,
        referenceType: n.referenceType,
        isRead: n.isRead,
        createdAt: n.createdAt,
        deeplink: buildDeeplink(n),
        student,
      };
    });

    return res.json({ items, totalUnread, limit, offset });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// GET /mobile/student/notifications/unread-count
router.get("/mobile/student/notifications/unread-count", requireAuth, async (req, res) => {
  const userId = req.session.userId as string;
  try {
    const { ok, targetUserIds } = await resolveStudentIds(userId);
    if (!ok) return res.status(403).json({ message: "Tài khoản không có quyền truy cập" });
    if (!targetUserIds.length) return res.json({ total: 0 });

    const [row] = await db
      .select({ cnt: count() })
      .from(notificationsTable)
      .where(and(inArray(notificationsTable.userId, targetUserIds), eq(notificationsTable.isRead, false)));

    return res.json({ total: Number(row?.cnt ?? 0) });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// PATCH /mobile/student/notifications/:id/read
router.patch("/mobile/student/notifications/:id/read", requireAuth, async (req, res) => {
  const userId = req.session.userId as string;
  try {
    const { ok, targetUserIds } = await resolveStudentIds(userId);
    if (!ok) return res.status(403).json({ message: "Tài khoản không có quyền truy cập" });

    const notifId = req.params.id;
    const [notif] = await db
      .select({ id: notificationsTable.id, userId: notificationsTable.userId })
      .from(notificationsTable)
      .where(eq(notificationsTable.id, notifId))
      .limit(1);

    if (!notif || !targetUserIds.includes(notif.userId)) {
      return res.status(404).json({ message: "Không tìm thấy thông báo" });
    }

    await db.update(notificationsTable).set({ isRead: true }).where(eq(notificationsTable.id, notifId));
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// PATCH /mobile/student/notifications/read-all
router.patch("/mobile/student/notifications/read-all", requireAuth, async (req, res) => {
  const userId = req.session.userId as string;
  try {
    const { ok, targetUserIds } = await resolveStudentIds(userId);
    if (!ok) return res.status(403).json({ message: "Tài khoản không có quyền truy cập" });

    if (targetUserIds.length) {
      await db.update(notificationsTable).set({ isRead: true })
        .where(inArray(notificationsTable.userId, targetUserIds));
    }
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

export default router;
