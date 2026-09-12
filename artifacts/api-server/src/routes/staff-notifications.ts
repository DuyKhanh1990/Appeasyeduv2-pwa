import { Router } from "express";
import { db, usersTable, notificationsTable } from "@workspace/db";
import { eq, and, inArray, desc, count } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

type NotificationRow = typeof notificationsTable.$inferSelect;

const STAFF_ROLES = ["staff", "teacher", "admin"];

/**
 * Trích xuất ngày (YYYY-MM-DD) từ nội dung text.
 * Hỗ trợ 3 dạng viết tắt phổ biến trong thông báo tiếng Việt:
 *   DD/MM/YYYY  →  2026-08-09
 *   DD/MM/YY   →  2026-08-09  (thêm "20" vào đầu năm)
 *   DD/MM      →  suy ra năm từ createdAt; nếu ngày đó cách createdAt > 90 ngày về quá khứ
 *               thì dùng năm kế tiếp (tránh nhầm lịch tháng trước sang năm cũ).
 *
 * Regex ưu tiên match dài (4 chữ số năm) trước để tránh "09/08/26" bị bắt như DD/MM.
 */
function extractDateFromContent(content: string, createdAt: Date): string | undefined {
  // DD/MM/YYYY (4-digit year)
  const m4 = content.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m4) return `${m4[3]}-${m4[2].padStart(2, "0")}-${m4[1].padStart(2, "0")}`;

  // DD/MM/YY (2-digit year) — negative lookahead tránh match thêm chữ số thứ 3
  const m2 = content.match(/(\d{1,2})\/(\d{1,2})\/(\d{2})(?!\d)/);
  if (m2) return `20${m2[3]}-${m2[2].padStart(2, "0")}-${m2[1].padStart(2, "0")}`;

  // DD/MM (không có năm) — suy ra năm từ ngày tạo thông báo
  // Negative lookahead (?!\/\d) đảm bảo không match "09/08" từ "09/08/26"
  const m1 = content.match(/(\d{1,2})\/(\d{1,2})(?!\/\d)/);
  if (m1) {
    const dd = m1[1].padStart(2, "0");
    const mm = m1[2].padStart(2, "0");
    const baseYear = createdAt.getFullYear();
    const candidate = new Date(`${baseYear}-${mm}-${dd}T00:00:00`);
    // Nếu ngày ứng viên cách thời điểm tạo thông báo > 90 ngày về quá khứ → dùng năm kế
    const diffMs = candidate.getTime() - createdAt.getTime();
    const year = diffMs < -90 * 24 * 3600 * 1000 ? baseYear + 1 : baseYear;
    return `${year}-${mm}-${dd}`;
  }

  return undefined;
}

function buildDeeplink(n: NotificationRow): { screen: string; params: Record<string, string> } | null {
  const category = n.category ?? "";
  const referenceType = n.referenceType ?? "";
  const text = `${n.title ?? ""} ${n.content ?? ""}`.toLowerCase();

  // Ưu tiên tuyệt đối: title/content chứa "bảng điểm" -> luôn StaffGradeBook
  if (text.includes("bảng điểm")) {
    return { screen: "StaffGradeBook", params: n.referenceId ? { gradeBookId: n.referenceId } : {} };
  }

  const dateStr = extractDateFromContent(n.content ?? "", n.createdAt);

  if (
    ["attendance", "schedule", "class", "session", "review"].includes(category) ||
    ["session", "class", "schedule", "attendance"].includes(referenceType)
  ) {
    return { screen: "StaffCalendar", params: dateStr ? { date: dateStr } : {} };
  }
  if (
    ["content", "assignment"].includes(category) ||
    ["assignment", "homework", "content"].includes(referenceType)
  ) {
    return { screen: "StaffCalendar", params: dateStr ? { date: dateStr } : {} };
  }
  if (["grade_book", "score_sheet"].includes(referenceType)) {
    return { screen: "StaffGradeBook", params: n.referenceId ? { gradeBookId: n.referenceId } : {} };
  }
  if (category === "finance" || ["salary", "payroll"].includes(referenceType)) {
    return { screen: "StaffSalary", params: {} };
  }
  if (category === "task" || referenceType === "task") {
    return { screen: "StaffTasks", params: n.referenceId ? { taskId: n.referenceId } : {} };
  }
  return null;
}

async function resolveStaffUser(userId: string): Promise<{ ok: boolean }> {
  const [user] = await db
    .select({ id: usersTable.id, role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user) return { ok: false };
  if (!STAFF_ROLES.includes(user.role)) return { ok: false };
  return { ok: true };
}

// GET /mobile/staff/notifications
router.get("/mobile/staff/notifications", requireAuth, async (req, res) => {
  const userId = req.session.userId as string;
  try {
    const { ok } = await resolveStaffUser(userId);
    if (!ok) return res.status(403).json({ message: "Không phải nhân viên" });

    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Number(req.query.offset) || 0;

    const [notifications, unreadRows] = await Promise.all([
      db.select().from(notificationsTable)
        .where(eq(notificationsTable.userId, userId))
        .orderBy(desc(notificationsTable.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ cnt: count() }).from(notificationsTable)
        .where(and(eq(notificationsTable.userId, userId), eq(notificationsTable.isRead, false))),
    ]);

    const totalUnread = Number(unreadRows[0]?.cnt ?? 0);

    const items = notifications.map((n: NotificationRow) => ({
      id: n.id,
      title: n.title,
      content: n.content,
      type: n.type,
      category: n.category,
      referenceId: n.referenceId,
      referenceType: n.referenceType,
      isRead: n.isRead,
      createdAt: n.createdAt,
      deeplink: buildDeeplink(n),
    }));

    return res.json({ items, totalUnread, limit, offset });
  } catch (err: any) {
    return res.status(500).json({ message: err.message ?? "Lỗi server" });
  }
});

// GET /mobile/staff/notifications/unread-count
router.get("/mobile/staff/notifications/unread-count", requireAuth, async (req, res) => {
  const userId = req.session.userId as string;
  try {
    const { ok } = await resolveStaffUser(userId);
    if (!ok) return res.status(403).json({ message: "Không phải nhân viên" });

    const [row] = await db
      .select({ cnt: count() })
      .from(notificationsTable)
      .where(and(eq(notificationsTable.userId, userId), eq(notificationsTable.isRead, false)));

    return res.json({ total: Number(row?.cnt ?? 0) });
  } catch (err: any) {
    return res.status(500).json({ message: err.message ?? "Lỗi server" });
  }
});

// PATCH /mobile/staff/notifications/:id/read
router.patch("/mobile/staff/notifications/:id/read", requireAuth, async (req, res) => {
  const userId = req.session.userId as string;
  try {
    const { ok } = await resolveStaffUser(userId);
    if (!ok) return res.status(403).json({ message: "Không phải nhân viên" });

    const notifId = req.params.id;
    const [notif] = await db
      .select({ id: notificationsTable.id, userId: notificationsTable.userId })
      .from(notificationsTable)
      .where(eq(notificationsTable.id, notifId))
      .limit(1);

    if (!notif || notif.userId !== userId) {
      return res.status(404).json({ message: "Không tìm thấy thông báo" });
    }

    await db.update(notificationsTable).set({ isRead: true }).where(eq(notificationsTable.id, notifId));
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ message: err.message ?? "Lỗi server" });
  }
});

// PATCH /mobile/staff/notifications/read-all
router.patch("/mobile/staff/notifications/read-all", requireAuth, async (req, res) => {
  const userId = req.session.userId as string;
  try {
    const { ok } = await resolveStaffUser(userId);
    if (!ok) return res.status(403).json({ message: "Không phải nhân viên" });

    await db.update(notificationsTable).set({ isRead: true }).where(eq(notificationsTable.userId, userId));
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ message: err.message ?? "Lỗi server" });
  }
});

export default router;
