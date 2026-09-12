import { Router } from "express";
import { db, studentSessionsTable, classSessionsTable, studentEnrollmentsTable, usersTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

async function ensureStudentSessions(classSessionId: string) {
  const [session] = await db
    .select({ classId: classSessionsTable.classId })
    .from(classSessionsTable)
    .where(eq(classSessionsTable.id, classSessionId))
    .limit(1);

  if (!session) return;

  const enrollments = await db
    .select({ studentId: studentEnrollmentsTable.studentId })
    .from(studentEnrollmentsTable)
    .where(eq(studentEnrollmentsTable.classId, session.classId));

  if (enrollments.length === 0) return;

  const existing = await db
    .select({ studentId: studentSessionsTable.studentId })
    .from(studentSessionsTable)
    .where(eq(studentSessionsTable.classSessionId, classSessionId));

  const existingIds = new Set(existing.map((e) => e.studentId));
  const missing = enrollments.filter((e) => !existingIds.has(e.studentId));

  if (missing.length > 0) {
    await db.insert(studentSessionsTable).values(
      missing.map((e, idx) => ({
        classSessionId,
        studentId: e.studentId,
        sessionOrder: existingIds.size + idx + 1,
      }))
    );
  }
}

router.get("/mobile/staff/calendar/session/:classSessionId/students", requireAuth, async (req, res) => {
  const { classSessionId } = req.params;

  try {
    await ensureStudentSessions(classSessionId);

    const rows = await db
      .select({
        studentSessionId: studentSessionsTable.id,
        studentId: studentSessionsTable.studentId,
        sessionOrder: studentSessionsTable.sessionOrder,
        attendanceStatus: studentSessionsTable.attendanceStatus,
        attendanceNote: studentSessionsTable.attendanceNote,
        hasReview: studentSessionsTable.hasReview,
        reviewPublished: studentSessionsTable.reviewPublished,
        studentName: usersTable.name,
        studentCode: usersTable.username,
      })
      .from(studentSessionsTable)
      .innerJoin(usersTable, eq(studentSessionsTable.studentId, usersTable.id))
      .where(eq(studentSessionsTable.classSessionId, classSessionId))
      .orderBy(studentSessionsTable.sessionOrder);

    const mapped = rows.map((r) => ({
      studentSessionId: r.studentSessionId,
      studentId: r.studentId,
      studentName: r.studentName ?? r.studentCode,
      studentCode: r.studentCode,
      attendanceStatus: r.attendanceStatus,
      attendanceNote: r.attendanceNote,
      sessionOrder: r.sessionOrder,
      hasReview: r.hasReview,
      reviewPublished: r.reviewPublished,
    }));

    return res.json(mapped);
  } catch (err) {
    console.error("Error fetching session students:", err);
    return res.status(500).json({ message: "Lỗi server" });
  }
});

router.patch("/student-sessions/:studentSessionId/attendance", requireAuth, async (req, res) => {
  const { studentSessionId } = req.params;
  const { status, note } = req.body as { status?: string; note?: string };

  if (!status) {
    return res.status(400).json({ message: "Thiếu trường status" });
  }

  try {
    await db
      .update(studentSessionsTable)
      .set({
        attendanceStatus: status,
        attendanceNote: note ?? "",
        updatedAt: new Date(),
      })
      .where(eq(studentSessionsTable.id, studentSessionId));

    return res.json({ success: true });
  } catch (err) {
    console.error("Error updating attendance:", err);
    return res.status(500).json({ message: "Lỗi server" });
  }
});

router.post("/student-sessions/bulk-attendance", requireAuth, async (req, res) => {
  const { session_id, students } = req.body as {
    session_id?: string;
    students?: { studentSessionId: string; attendanceStatus: string; attendanceNote?: string }[];
  };

  if (!students || !Array.isArray(students) || students.length === 0) {
    return res.status(400).json({ message: "Thiếu danh sách học viên" });
  }

  try {
    await Promise.all(
      students.map((s) =>
        db
          .update(studentSessionsTable)
          .set({
            attendanceStatus: s.attendanceStatus,
            attendanceNote: s.attendanceNote ?? "",
            updatedAt: new Date(),
          })
          .where(eq(studentSessionsTable.id, s.studentSessionId))
      )
    );

    return res.json({ success: true });
  } catch (err) {
    console.error("Error bulk updating attendance:", err);
    return res.status(500).json({ message: "Lỗi server" });
  }
});

router.get("/student-sessions/:studentSessionId/review", requireAuth, async (req, res) => {
  const { studentSessionId } = req.params;
  try {
    const [row] = await db
      .select({
        hasReview: studentSessionsTable.hasReview,
        reviewPublished: studentSessionsTable.reviewPublished,
        reviewData: studentSessionsTable.reviewData,
      })
      .from(studentSessionsTable)
      .where(eq(studentSessionsTable.id, studentSessionId))
      .limit(1);

    if (!row) return res.status(404).json({ message: "Không tìm thấy" });

    const reviewData = row.reviewData;
    console.info(`[review-get] studentSessionId=${studentSessionId} reviewData=${JSON.stringify(reviewData)}`);

    return res.json({
      hasReview: row.hasReview,
      reviewPublished: row.reviewPublished,
      reviewData: (reviewData && typeof reviewData === "object" && !Array.isArray(reviewData)) ? reviewData : {},
    });
  } catch (err) {
    console.error("Error fetching review:", err);
    return res.status(500).json({ message: "Lỗi server" });
  }
});

router.post("/student-sessions/review", requireAuth, async (req, res) => {
  const { studentSessionIds, reviewData, published } = req.body as {
    studentSessionIds?: string[];
    reviewData?: Record<string, unknown>;
    published?: boolean;
  };

  if (!studentSessionIds || !Array.isArray(studentSessionIds) || studentSessionIds.length === 0) {
    return res.status(400).json({ message: "Thiếu danh sách studentSessionIds" });
  }

  try {
    console.info(`[review-save] ids=${JSON.stringify(studentSessionIds)} reviewData=${JSON.stringify(reviewData)}`);

    await db
      .update(studentSessionsTable)
      .set({
        hasReview: true,
        reviewPublished: published ?? false,
        reviewData: reviewData ?? {},
        updatedAt: new Date(),
      })
      .where(inArray(studentSessionsTable.id, studentSessionIds));

    return res.json({ success: true });
  } catch (err) {
    console.error("Error saving review:", err);
    return res.status(500).json({ message: "Lỗi server" });
  }
});

export default router;
