import { Router } from "express";
import { db, usersTable, classesTable, classSessionsTable, studentEnrollmentsTable, studentSessionsTable, evaluationCriteriaTable, homeworksTable, examsTable, homeworkSubmissionsTable, examSubmissionsTable } from "@workspace/db";
import { eq, and, inArray, count, gte, lt, lte, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

router.get("/mobile/staff/assignments", requireAuth, async (req, res) => {
  console.log("[staff/assignments] query:", JSON.stringify(req.query));
  const monthParam = (req.query.month as string) || "";
  const statusFilter = (req.query.status as string) || "all";
  const classNamesRaw = req.query.className;
  const classNames: string[] = (Array.isArray(classNamesRaw)
    ? (classNamesRaw as string[]).filter(Boolean)
    : classNamesRaw ? [classNamesRaw as string] : []).map((n) => n.toLowerCase());
  const studentIdsRaw = req.query.studentId;
  const studentIdsFilter: string[] = Array.isArray(studentIdsRaw)
    ? (studentIdsRaw as string[]).filter(Boolean)
    : studentIdsRaw ? [studentIdsRaw as string] : [];
  const studentNameFilter = (req.query.studentName as string || "").toLowerCase().trim();
  const dateFromParam = (req.query.dateFrom as string) || null;
  const dateToParam = (req.query.dateTo as string) || null;
  const useDateRange = !!(dateFromParam && dateToParam);

  let monthStr: string;
  let dateCondition: ReturnType<typeof and>;
  if (useDateRange) {
    monthStr = `${dateFromParam}:${dateToParam}`;
    dateCondition = and(gte(classSessionsTable.sessionDate, dateFromParam!), lte(classSessionsTable.sessionDate, dateToParam!))!;
  } else if (/^\d{4}-\d{2}$/.test(monthParam)) {
    monthStr = monthParam;
    const [y, m] = monthParam.split("-").map(Number);
    const monthStart = `${y}-${String(m).padStart(2, "0")}-01`;
    const monthEnd = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
    dateCondition = and(gte(classSessionsTable.sessionDate, monthStart), lt(classSessionsTable.sessionDate, monthEnd))!;
  } else {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    monthStr = `${y}-${String(m).padStart(2, "0")}`;
    const monthStart = `${y}-${String(m).padStart(2, "0")}-01`;
    const monthEnd = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
    dateCondition = and(gte(classSessionsTable.sessionDate, monthStart), lt(classSessionsTable.sessionDate, monthEnd))!;
  }

  try {
    const sessions = await db
      .select({
        id: classSessionsTable.id,
        classId: classSessionsTable.classId,
        sessionDate: classSessionsTable.sessionDate,
        sessionIndex: classSessionsTable.sessionIndex,
        weekday: classSessionsTable.weekday,
        startTime: classSessionsTable.startTime,
        endTime: classSessionsTable.endTime,
      })
      .from(classSessionsTable)
      .where(dateCondition);

    if (sessions.length === 0) return res.json({ month: monthStr, rows: [] });

    const classIds = [...new Set(sessions.map((s) => s.classId))];
    const allClassRows = await db.select().from(classesTable).where(inArray(classesTable.id, classIds));

    const classRows = classNames.length > 0
      ? allClassRows.filter((c) => classNames.includes((c.name ?? "").toLowerCase()))
      : allClassRows;

    const filteredClassIds = classRows.map((c) => c.id);
    const classMap = new Map(classRows.map((c) => [c.id, c]));
    const filteredSessions = sessions.filter((s) => filteredClassIds.includes(s.classId));
    const filteredSessionIds = filteredSessions.map((s) => s.id);
    const sessionMap = new Map(filteredSessions.map((s) => [s.id, s]));

    if (filteredSessionIds.length === 0) return res.json({ month: monthStr, rows: [] });

    const enrollmentWhere = studentIdsFilter.length > 0
      ? and(inArray(studentEnrollmentsTable.classId, filteredClassIds), inArray(studentEnrollmentsTable.studentId, studentIdsFilter))
      : inArray(studentEnrollmentsTable.classId, filteredClassIds);

    const enrollments = await db
      .select({ classId: studentEnrollmentsTable.classId, studentId: studentEnrollmentsTable.studentId })
      .from(studentEnrollmentsTable)
      .where(enrollmentWhere);

    const studentIds = [...new Set(enrollments.map((e) => e.studentId))];
    if (studentIds.length === 0) return res.json({ month: monthStr, rows: [] });

    const classStudents = new Map<string, string[]>();
    for (const e of enrollments) {
      if (!classStudents.has(e.classId)) classStudents.set(e.classId, []);
      classStudents.get(e.classId)!.push(e.studentId);
    }

    const [studentRows, homeworkRows, examRows, submissionRows, examSubmissionRows] = await Promise.all([
      db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(inArray(usersTable.id, studentIds)),
      db.select().from(homeworksTable).where(inArray(homeworksTable.classSessionId, filteredSessionIds)),
      db.select().from(examsTable).where(inArray(examsTable.classSessionId, filteredSessionIds)),
      db.select().from(homeworkSubmissionsTable).where(inArray(homeworkSubmissionsTable.studentId, studentIds)),
      db.select().from(examSubmissionsTable).where(inArray(examSubmissionsTable.studentId, studentIds)),
    ]);

    let filteredStudentRows = studentRows;
    if (studentIdsFilter.length === 0 && studentNameFilter) {
      filteredStudentRows = studentRows.filter((u) =>
        (u.name ?? "").toLowerCase().includes(studentNameFilter)
      );
    }
    const useStudentFilter = studentIdsFilter.length > 0 || !!studentNameFilter;
    const studentMap = new Map(filteredStudentRows.map((u) => [u.id, u.name ?? u.id]));
    const allowedStudentIds = new Set(filteredStudentRows.map((u) => u.id));
    const submissionKey = (hwId: string, sId: string) => `${hwId}:${sId}`;
    const submissionMap = new Map(submissionRows.map((s) => [submissionKey(s.homeworkId, s.studentId), s]));
    const examSubmissionMap = new Map<string, (typeof examSubmissionRows)[0]>();
    for (const es of examSubmissionRows) {
      const key = submissionKey(es.examId, es.studentId);
      const existing = examSubmissionMap.get(key);
      if (!existing || (es.submittedAt && existing.submittedAt && es.submittedAt > existing.submittedAt)) {
        examSubmissionMap.set(key, es);
      }
    }

    const rows: any[] = [];

    for (const hw of homeworkRows) {
      const session = sessionMap.get(hw.classSessionId);
      if (!session) continue;
      const cls = classMap.get(session.classId);
      const studentsInClass = classStudents.get(session.classId) ?? [];
      const targets = (hw.targetStudentId ? studentsInClass.filter((id) => id === hw.targetStudentId) : studentsInClass)
        .filter((id) => !useStudentFilter || allowedStudentIds.has(id));

      for (const studentId of targets) {
        const submission = submissionMap.get(submissionKey(hw.id, studentId));
        const submissionStatus = submission?.status ?? "pending";
        if (statusFilter !== "all" && submissionStatus !== statusFilter) continue;
        rows.push({
          itemType: "BTVN",
          classSessionId: session.id,
          className: cls?.name ?? "",
          classCode: cls?.code ?? "",
          sessionDate: session.sessionDate,
          weekday: session.weekday ?? null,
          sessionIndex: session.sessionIndex,
          startTime: session.startTime ?? "",
          endTime: session.endTime ?? "",
          studentId,
          studentName: studentMap.get(studentId) ?? "",
          homeworkId: hw.id,
          homeworkTitle: hw.title,
          homeworkDescription: hw.description ?? null,
          homeworkAttachments: hw.attachments ?? [],
          isPersonalized: hw.isPersonalized ?? false,
          submissionStatus,
          submissionContent: submission?.submissionContent ?? null,
          submissionAttachments: submission?.submissionAttachments ?? [],
          studentSessionContentId: submission?.id ?? null,
          score: submission?.score != null ? String(submission.score) : null,
          comment: submission?.comment ?? null,
          examId: null,
        });
      }
    }

    for (const exam of examRows) {
      const session = sessionMap.get(exam.classSessionId);
      if (!session) continue;
      const cls = classMap.get(session.classId);
      const studentsInClass = (classStudents.get(session.classId) ?? [])
        .filter((id) => !useStudentFilter || allowedStudentIds.has(id));

      for (const studentId of studentsInClass) {
        const examSub = examSubmissionMap.get(submissionKey(exam.id, studentId));
        const submissionStatus = examSub ? "submitted" : "pending";
        if (statusFilter !== "all" && submissionStatus !== statusFilter) continue;
        const examScore = (examSub as any)?.adjustedScore ?? examSub?.score ?? null;
        rows.push({
          itemType: "Bài kiểm tra",
          classSessionId: session.id,
          className: cls?.name ?? "",
          classCode: cls?.code ?? "",
          sessionDate: session.sessionDate,
          weekday: session.weekday ?? null,
          sessionIndex: session.sessionIndex,
          startTime: session.startTime ?? "",
          endTime: session.endTime ?? "",
          studentId,
          studentName: studentMap.get(studentId) ?? "",
          homeworkId: null,
          homeworkTitle: exam.title,
          homeworkDescription: exam.description ?? null,
          homeworkAttachments: [],
          isPersonalized: false,
          submissionStatus,
          submissionContent: null,
          submissionAttachments: [],
          studentSessionContentId: examSub?.id ?? null,
          score: examScore != null ? String(examScore) : null,
          comment: examSub?.comment ?? null,
          examId: exam.id,
        });
      }
    }

    rows.sort((a, b) => {
      if (a.sessionDate > b.sessionDate) return -1;
      if (a.sessionDate < b.sessionDate) return 1;
      return (b.sessionIndex ?? 0) - (a.sessionIndex ?? 0);
    });

    return res.json({ month: monthStr, rows });
  } catch (err) {
    console.error("Error fetching staff assignments:", err instanceof Error ? err.stack : err);
    return res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
  }
});

router.post("/mobile/staff/assignments/grade", requireAuth, async (req, res) => {
  const { studentSessionContentId, score, gradingComment } = req.body as {
    studentSessionContentId?: string;
    score?: string | null;
    gradingComment?: string | null;
  };

  if (!studentSessionContentId) {
    return res.status(400).json({ message: "Thiếu studentSessionContentId" });
  }

  try {
    const [existing] = await db
      .select()
      .from(homeworkSubmissionsTable)
      .where(eq(homeworkSubmissionsTable.id, studentSessionContentId))
      .limit(1);

    if (existing) {
      await db
        .update(homeworkSubmissionsTable)
        .set({
          score: score != null ? parseInt(score, 10) : null,
          comment: gradingComment ?? null,
          updatedAt: new Date(),
        })
        .where(eq(homeworkSubmissionsTable.id, studentSessionContentId));
      return res.json({ success: true });
    }

    return res.status(404).json({ message: "Không tìm thấy bài nộp" });
  } catch (err) {
    console.error("Error grading assignment:", err instanceof Error ? err.stack : err);
    return res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
  }
});

router.get("/mobile/staff/calendar", requireAuth, async (req, res) => {
  const teacherId = req.session.userId as string;
  const monthParam = (req.query.month as string) || "";

  let monthStr: string;
  let monthStart: string;
  let monthEnd: string;

  if (/^\d{4}-\d{2}$/.test(monthParam)) {
    const [y, m] = monthParam.split("-").map(Number);
    monthStr = monthParam;
    monthStart = `${y}-${String(m).padStart(2, "0")}-01`;
    monthEnd = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  } else {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    monthStr = `${y}-${String(m).padStart(2, "0")}`;
    monthStart = `${y}-${String(m).padStart(2, "0")}-01`;
    monthEnd = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  }

  try {
    const sessions = await db
      .select({
        id: classSessionsTable.id,
        classId: classSessionsTable.classId,
        sessionDate: classSessionsTable.sessionDate,
        sessionIndex: classSessionsTable.sessionIndex,
        weekday: classSessionsTable.weekday,
        startTime: classSessionsTable.startTime,
        endTime: classSessionsTable.endTime,
        locationName: classSessionsTable.locationName,
        learningFormat: classSessionsTable.learningFormat,
        status: classSessionsTable.status,
      })
      .from(classSessionsTable)
      .where(
        and(
          gte(classSessionsTable.sessionDate, monthStart),
          lt(classSessionsTable.sessionDate, monthEnd),
          sql`${classSessionsTable.teacherIds} @> ${JSON.stringify([teacherId])}::jsonb`
        )
      )
      .orderBy(classSessionsTable.sessionDate, classSessionsTable.startTime);

    const classIds = [...new Set(sessions.map((s) => s.classId))];
    const classRows = classIds.length > 0
      ? await db.select({ id: classesTable.id, name: classesTable.name, code: classesTable.code })
          .from(classesTable).where(inArray(classesTable.id, classIds))
      : [];
    const classMap = new Map(classRows.map((c) => [c.id, c]));

    const datesWithSessions = [...new Set(sessions.map((s) => s.sessionDate))];

    const result = sessions.map((s) => {
      const cls = classMap.get(s.classId);
      return {
        classSessionId: s.id,
        sessionDate: s.sessionDate,
        weekday: s.weekday ?? "",
        className: cls?.name ?? "",
        classCode: cls?.code ?? "",
        startTime: s.startTime ?? "",
        endTime: s.endTime ?? "",
        learningFormat: s.learningFormat ?? "offline",
        sessionStatus: s.status ?? "scheduled",
        sessionIndex: s.sessionIndex ?? 1,
        locationName: s.locationName ?? "",
      };
    });

    return res.json({ month: monthStr, datesWithSessions, sessions: result });
  } catch (err) {
    console.error("Error fetching staff calendar:", err instanceof Error ? err.stack : err);
    return res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
  }
});

router.get("/mobile/staff/calendar/session/:classSessionId", requireAuth, async (req, res) => {
  const { classSessionId } = req.params;

  try {
    const [session] = await db
      .select({
        id: classSessionsTable.id,
        classId: classSessionsTable.classId,
        sessionDate: classSessionsTable.sessionDate,
        sessionIndex: classSessionsTable.sessionIndex,
        totalSessions: classSessionsTable.totalSessions,
        weekday: classSessionsTable.weekday,
        startTime: classSessionsTable.startTime,
        endTime: classSessionsTable.endTime,
        locationName: classSessionsTable.locationName,
        learningFormat: classSessionsTable.learningFormat,
        status: classSessionsTable.status,
        teacherIds: classSessionsTable.teacherIds,
      })
      .from(classSessionsTable)
      .where(eq(classSessionsTable.id, classSessionId))
      .limit(1);

    if (!session) {
      return res.status(404).json({ message: "Không tìm thấy buổi học" });
    }

    const [cls] = await db
      .select({
        name: classesTable.name,
        code: classesTable.code,
        evaluationCriteriaIds: classesTable.evaluationCriteriaIds,
      })
      .from(classesTable)
      .where(eq(classesTable.id, session.classId))
      .limit(1);

    const enrolledCount = await db
      .select({ count: count() })
      .from(studentEnrollmentsTable)
      .where(eq(studentEnrollmentsTable.classId, session.classId))
      .then((r) => r[0]?.count ?? 0);

    const [pendingResult, reviewedResult] = await Promise.all([
      db
        .select({ count: count() })
        .from(studentSessionsTable)
        .where(and(
          eq(studentSessionsTable.classSessionId, classSessionId),
          eq(studentSessionsTable.attendanceStatus, "pending")
        ))
        .then((r) => r[0]?.count ?? 0),
      db
        .select({ count: count() })
        .from(studentSessionsTable)
        .where(and(
          eq(studentSessionsTable.classSessionId, classSessionId),
          eq(studentSessionsTable.hasReview, true)
        ))
        .then((r) => r[0]?.count ?? 0),
    ]);

    const teacherIds: string[] = (session.teacherIds as string[]) ?? [];
    const teachers: { id: string; fullName: string; teacherCode: string }[] = teacherIds.length > 0
      ? await db
          .select({ id: usersTable.id, fullName: usersTable.name, teacherCode: usersTable.username })
          .from(usersTable)
          .where(inArray(usersTable.id, teacherIds))
          .then((rows) => {
            const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
            return teacherIds
              .filter((id) => byId[id])
              .map((id) => ({
                id,
                fullName: (byId[id].fullName ?? id) as string,
                teacherCode: (byId[id].teacherCode ?? "") as string,
              }));
          })
      : [];

    return res.json({
      classSessionId: session.id,
      classId: session.classId,
      className: cls?.name ?? "",
      classCode: cls?.code ?? "",
      sessionDate: session.sessionDate,
      sessionIndex: session.sessionIndex,
      totalSessions: session.totalSessions ?? null,
      weekday: session.weekday ?? null,
      startTime: session.startTime ?? "",
      endTime: session.endTime ?? "",
      locationName: session.locationName ?? null,
      learningFormat: session.learningFormat ?? "offline",
      sessionStatus: session.status,
      teachers,
      evaluationCriteriaIds: (cls?.evaluationCriteriaIds as string[]) ?? [],
      enrolledCount: Number(enrolledCount),
      attendancePendingCount: Number(pendingResult),
      reviewedCount: Number(reviewedResult),
      generalContents: [],
    });
  } catch (err) {
    console.error("Error fetching staff session detail:", err);
    return res.status(500).json({ message: "Lỗi server" });
  }
});

router.get("/evaluation-criteria", requireAuth, async (req, res) => {
  try {
    const rows = await db
      .select({
        id: evaluationCriteriaTable.id,
        name: evaluationCriteriaTable.name,
        subCriteria: evaluationCriteriaTable.subCriteria,
      })
      .from(evaluationCriteriaTable)
      .orderBy(evaluationCriteriaTable.createdAt);

    return res.json(rows.map((r) => ({
      id: r.id,
      name: r.name,
      subCriteria: (r.subCriteria as { id: string; name: string }[]) ?? [],
    })));
  } catch (err) {
    console.error("Error fetching evaluation criteria:", err);
    return res.status(500).json({ message: "Lỗi server" });
  }
});

export default router;
