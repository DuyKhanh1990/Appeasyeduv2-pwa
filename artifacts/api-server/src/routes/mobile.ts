import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable, classesTable, classSessionsTable, studentEnrollmentsTable, homeworksTable, homeworkSubmissionsTable, examsTable, examSubmissionsTable, studentSessionsTable, parentStudentLinksTable } from "@workspace/db";
import { eq, and, gte, lt, inArray, isNull, or, sql, count, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toISODate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  if (dateStr.includes("T")) return dateStr;
  return `${dateStr}T00:00:00.000Z`;
}

/** Safely convert a Date object or ISO string to ISO string. Returns null for falsy values. */
function safeISOString(val: Date | string | null | undefined): string | null {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString();
  // Drizzle may return timestamp columns as strings on some driver/config combos
  const d = new Date(val as string);
  return isNaN(d.getTime()) ? String(val) : d.toISOString();
}

async function getUserRole(userId: string): Promise<string> {
  const [user] = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  return user?.role ?? "student";
}

async function resolveStudentIds(userId: string, role: string): Promise<{ studentIds: string[]; isParent: boolean }> {
  if (role === "parent") {
    const links = await db
      .select({ studentId: parentStudentLinksTable.studentId })
      .from(parentStudentLinksTable)
      .where(eq(parentStudentLinksTable.parentId, userId));
    return { studentIds: links.map((l) => l.studentId), isParent: true };
  }
  return { studentIds: [userId], isParent: false };
}

async function getTeacherNames(teacherIds: string[]): Promise<string[]> {
  if (!teacherIds || teacherIds.length === 0) return [];
  const users = await db
    .select({ id: usersTable.id, name: usersTable.name, username: usersTable.username })
    .from(usersTable)
    .where(inArray(usersTable.id, teacherIds));
  const userMap = new Map(users.map((u) => [u.id, u.name ?? u.username]));
  return teacherIds.map((id) => userMap.get(id) ?? id);
}

async function getEnrolledCount(classId: string): Promise<number> {
  const [row] = await db
    .select({ cnt: count() })
    .from(studentEnrollmentsTable)
    .where(eq(studentEnrollmentsTable.classId, classId));
  return Number(row?.cnt ?? 0);
}

// ─── Assignments ──────────────────────────────────────────────────────────────

router.get("/mobile/student/assignments", requireAuth, async (req, res) => {
  const userId = req.session.userId as string;
  const monthParam = (req.query.month as string) || "";
  const dateFromParam = (req.query.dateFrom as string) || "";
  const dateToParam = (req.query.dateTo as string) || "";
  const statusFilter = (req.query.status as string) || "";
  const classNameFilter = ((req.query.className as string) || "").toLowerCase().trim();

  let monthLabel: string;
  let dateCondition: ReturnType<typeof and>;

  if (dateFromParam && dateToParam) {
    monthLabel = `${dateFromParam}:${dateToParam}`;
    dateCondition = and(gte(classSessionsTable.sessionDate, dateFromParam), lt(classSessionsTable.sessionDate, dateToParam))!;
  } else {
    const month = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : new Date().toISOString().slice(0, 7);
    const [year, mon] = month.split("-").map(Number);
    monthLabel = month;
    const monthStart = `${year}-${String(mon).padStart(2, "0")}-01`;
    const monthEnd = mon === 12 ? `${year + 1}-01-01` : `${year}-${String(mon + 1).padStart(2, "0")}-01`;
    dateCondition = and(gte(classSessionsTable.sessionDate, monthStart), lt(classSessionsTable.sessionDate, monthEnd))!;
  }

  try {
    const role = await getUserRole(userId);
    const { studentIds, isParent } = await resolveStudentIds(userId, role);

    if (studentIds.length === 0) return res.json({ month: monthLabel, rows: [] });

    const enrollments = await db
      .select({ classId: studentEnrollmentsTable.classId, studentId: studentEnrollmentsTable.studentId })
      .from(studentEnrollmentsTable)
      .where(inArray(studentEnrollmentsTable.studentId, studentIds));

    let classIds = [...new Set(enrollments.map((e) => e.classId))];
    if (classIds.length === 0) return res.json({ month: monthLabel, rows: [] });

    // Filter by className if provided
    if (classNameFilter) {
      const matchedClasses = await db
        .select({ id: classesTable.id, name: classesTable.name })
        .from(classesTable)
        .where(inArray(classesTable.id, classIds));
      const filtered = matchedClasses.filter((c) => (c.name ?? "").toLowerCase().includes(classNameFilter));
      classIds = filtered.map((c) => c.id);
      if (classIds.length === 0) return res.json({ month: monthLabel, rows: [] });
    }

    // Map classId -> [studentIds]
    const studentsByClass = new Map<string, string[]>();
    for (const e of enrollments) {
      if (!classIds.includes(e.classId)) continue;
      if (!studentsByClass.has(e.classId)) studentsByClass.set(e.classId, []);
      studentsByClass.get(e.classId)!.push(e.studentId);
    }

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
      .where(and(inArray(classSessionsTable.classId, classIds), dateCondition));

    if (sessions.length === 0) return res.json({ month: monthLabel, rows: [] });

    const sessionIds = sessions.map((s) => s.id);
    const sessionMap = new Map(sessions.map((s) => [s.id, s]));

    // Fetch class info, homeworks, exams first — we need their IDs to filter submissions
    const [classRows, homeworkRows, examRows, studentRows] = await Promise.all([
      db.select().from(classesTable).where(inArray(classesTable.id, classIds)),
      db.select().from(homeworksTable).where(inArray(homeworksTable.classSessionId, sessionIds)),
      db.select().from(examsTable).where(inArray(examsTable.classSessionId, sessionIds)),
      isParent
        ? db.select({ id: usersTable.id, name: usersTable.name, username: usersTable.username })
            .from(usersTable).where(inArray(usersTable.id, studentIds))
        : Promise.resolve([]),
    ]);

    // Fetch submissions scoped to this month's homeworks/exams only — avoids pulling
    // the entire submission history and prevents stale/corrupted rows from other months
    // from crashing the response.
    const homeworkIds = homeworkRows.map((h) => h.id);
    const examIds = examRows.map((e) => e.id);

    const [submissionRows, examSubmissionRows] = await Promise.all([
      homeworkIds.length > 0
        ? db.select().from(homeworkSubmissionsTable).where(
            and(
              inArray(homeworkSubmissionsTable.homeworkId, homeworkIds),
              inArray(homeworkSubmissionsTable.studentId, studentIds),
            ),
          )
        : Promise.resolve([]),
      examIds.length > 0
        ? db.select().from(examSubmissionsTable).where(
            and(
              inArray(examSubmissionsTable.examId, examIds),
              inArray(examSubmissionsTable.studentId, studentIds),
            ),
          )
        : Promise.resolve([]),
    ]);

    const classMap = new Map(classRows.map((c) => [c.id, c]));
    const submissionKey = (hwId: string, sId: string) => `${hwId}:${sId}`;
    const submissionMap = new Map(submissionRows.map((s) => [submissionKey(s.homeworkId, s.studentId), s]));

    // Build exam submission map — keep the most recent submission per examId:studentId
    const examSubmissionMap = new Map<string, (typeof examSubmissionRows)[0]>();
    const examAttemptsCountMap = new Map<string, number>();
    for (const es of examSubmissionRows) {
      const key = submissionKey(es.examId, es.studentId);
      const existing = examSubmissionMap.get(key);
      if (!existing || (es.submittedAt && existing.submittedAt && es.submittedAt > existing.submittedAt)) {
        examSubmissionMap.set(key, es);
      }
      examAttemptsCountMap.set(key, (examAttemptsCountMap.get(key) ?? 0) + 1);
    }
    const studentNameMap = new Map((studentRows as any[]).map((u: any) => [u.id, { name: u.name ?? u.username, code: u.username }]));

    const rows: any[] = [];

    for (const hw of homeworkRows) {
      const session = sessionMap.get(hw.classSessionId);
      if (!session) continue;
      const cls = classMap.get(session.classId);

      // Apply className filter properly by class name
      if (classNameFilter && !(cls?.name ?? "").toLowerCase().includes(classNameFilter)) continue;

      const studentsInClass = studentsByClass.get(session.classId) ?? [];
      const targets = hw.targetStudentId
        ? studentsInClass.filter((id) => id === hw.targetStudentId)
        : studentsInClass;

      for (const studentId of targets) {
        const submission = submissionMap.get(submissionKey(hw.id, studentId));
        const submStatus = submission?.status ?? "pending";
        if (statusFilter && submStatus !== statusFilter) continue;
        const studentInfo = studentNameMap.get(studentId);
        rows.push({
          itemType: "BTVN",
          classSessionId: session.id,
          className: cls?.name ?? "",
          classCode: cls?.code ?? "",
          sessionDate: toISODate(session.sessionDate),
          weekday: session.weekday ?? "",
          sessionIndex: session.sessionIndex,
          startTime: session.startTime ?? undefined,
          endTime: session.endTime ?? undefined,
          homeworkId: hw.id,
          title: hw.title,
          description: hw.description ?? undefined,
          attachments: hw.attachments ?? [],
          isPersonalized: hw.isPersonalized,
          submissionStatus: submStatus,
          submissionContent: submission?.submissionContent ?? null,
          submissionAttachments: submission?.submissionAttachments ?? [],
          studentSessionContentId: submission?.id ?? null,
          score: submission?.score ?? null,
          comment: submission?.comment ?? null,
          dueDate: safeISOString(hw.dueDate),
          examId: null,
          maxAttempts: null,
          attemptsUsed: null,
          ...(isParent ? {
            isParent: true,
            ...(studentInfo ? { student: { id: studentId, name: studentInfo.name, code: studentInfo.code } } : {}),
          } : {}),
        });
      }
    }

    for (const exam of examRows) {
      const session = sessionMap.get(exam.classSessionId);
      if (!session) continue;
      const cls = classMap.get(session.classId);
      if (classNameFilter && !(cls?.name ?? "").toLowerCase().includes(classNameFilter)) continue;

      const studentsInClass = studentsByClass.get(session.classId) ?? [];
      for (const studentId of studentsInClass) {
        const studentInfo = studentNameMap.get(studentId);
        const examSub = examSubmissionMap.get(submissionKey(exam.id, studentId));
        const examSubmStatus = examSub ? "submitted" : "pending";
        if (statusFilter && examSubmStatus !== statusFilter) continue;
        // score: use adjustedScore if set by teacher, fallback to system score
        const examScore = (examSub as any)?.adjustedScore ?? examSub?.score ?? null;
        rows.push({
          itemType: "Bài kiểm tra",
          classSessionId: session.id,
          classId: session.classId,
          className: cls?.name ?? "",
          classCode: cls?.code ?? "",
          sessionDate: toISODate(session.sessionDate),
          weekday: session.weekday ?? "",
          sessionIndex: session.sessionIndex,
          startTime: session.startTime ?? undefined,
          endTime: session.endTime ?? undefined,
          homeworkId: null,
          title: exam.title,
          description: exam.description ?? undefined,
          attachments: [],
          isPersonalized: false,
          submissionStatus: examSubmStatus,
          submissionContent: null,
          submissionAttachments: [],
          studentSessionContentId: null,
          score: examScore,
          comment: examSub?.comment ?? null,
          dueDate: null,
          examId: exam.id,
          maxAttempts: exam.maxAttempts ?? null,
          attemptsUsed: examAttemptsCountMap.get(submissionKey(exam.id, studentId)) ?? 0,
          submittedAt: safeISOString(examSub?.submittedAt),
          ...(isParent ? {
            isParent: true,
            ...(studentInfo ? { student: { id: studentId, name: studentInfo.name, code: studentInfo.code } } : {}),
          } : {}),
        });
      }
    }

    rows.sort((a, b) => {
      const dateA = a.sessionDate ?? "";
      const dateB = b.sessionDate ?? "";
      if (dateA < dateB) return -1;
      if (dateA > dateB) return 1;
      return (a.sessionIndex ?? 0) - (b.sessionIndex ?? 0);
    });

    return res.json({ month: monthLabel, rows });
  } catch (err: unknown) {
    console.error("Error fetching assignments:", err instanceof Error ? err.stack : err);
    return res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
  }
});

router.post("/mobile/student/assignments/submit", requireAuth, async (req, res) => {
  const studentId = req.session.userId as string;
  const { homeworkId, submissionContent, submissionAttachments } = req.body as {
    homeworkId?: string;
    submissionContent?: string;
    submissionAttachments?: { name: string; url: string }[];
  };

  if (!homeworkId) return res.status(400).json({ message: "Thiếu homeworkId" });

  try {
    const [hw] = await db.select().from(homeworksTable).where(eq(homeworksTable.id, homeworkId)).limit(1);
    if (!hw) return res.status(404).json({ message: "Bài tập không tồn tại" });

    const [existing] = await db
      .select()
      .from(homeworkSubmissionsTable)
      .where(and(eq(homeworkSubmissionsTable.homeworkId, homeworkId), eq(homeworkSubmissionsTable.studentId, studentId)))
      .limit(1);

    if (existing) {
      await db.update(homeworkSubmissionsTable).set({
        submissionContent: submissionContent ?? null,
        submissionAttachments: submissionAttachments ?? [],
        status: "submitted",
        updatedAt: new Date(),
      }).where(eq(homeworkSubmissionsTable.id, existing.id));
    } else {
      await db.insert(homeworkSubmissionsTable).values({
        homeworkId,
        studentId,
        submissionContent: submissionContent ?? null,
        submissionAttachments: submissionAttachments ?? [],
        status: "submitted",
      });
    }

    return res.json({ message: "Nộp bài thành công" });
  } catch (err) {
    console.error("Error submitting assignment:", err);
    return res.status(500).json({ message: "Lỗi server" });
  }
});

// ─── Today schedule ───────────────────────────────────────────────────────────

router.get("/mobile/schedule/today", requireAuth, async (req, res) => {
  const userId = req.session.userId as string;
  const today = new Date().toISOString().split("T")[0];

  try {
    const role = await getUserRole(userId);
    const { studentIds, isParent } = await resolveStudentIds(userId, role);

    if (studentIds.length === 0) return res.json({ userType: isParent ? "student" : role, date: today, sessions: [] });

    const enrollments = await db
      .select({ classId: studentEnrollmentsTable.classId, studentId: studentEnrollmentsTable.studentId })
      .from(studentEnrollmentsTable)
      .where(inArray(studentEnrollmentsTable.studentId, studentIds));

    const classIds = [...new Set(enrollments.map((e) => e.classId))];
    if (classIds.length === 0) return res.json({ userType: "student", date: today, sessions: [] });

    const [sessions, classRows] = await Promise.all([
      db.select({
        id: classSessionsTable.id,
        classId: classSessionsTable.classId,
        startTime: classSessionsTable.startTime,
        endTime: classSessionsTable.endTime,
        status: classSessionsTable.status,
        locationName: classSessionsTable.locationName,
        learningFormat: classSessionsTable.learningFormat,
        teacherIds: classSessionsTable.teacherIds,
      }).from(classSessionsTable)
        .where(and(inArray(classSessionsTable.classId, classIds), eq(classSessionsTable.sessionDate, today))),
      db.select().from(classesTable).where(inArray(classesTable.id, classIds)),
    ]);

    const classMap = new Map(classRows.map((c) => [c.id, c]));
    const sessionIds = sessions.map((s) => s.id);

    const allTeacherIds = [...new Set(sessions.flatMap((s) => s.teacherIds ?? []))];
    const [teacherUsers, studentUsers, studentSessionRows] = await Promise.all([
      allTeacherIds.length > 0
        ? db.select({ id: usersTable.id, name: usersTable.name, username: usersTable.username })
            .from(usersTable).where(inArray(usersTable.id, allTeacherIds))
        : [],
      isParent
        ? db.select({ id: usersTable.id, name: usersTable.name, username: usersTable.username })
            .from(usersTable).where(inArray(usersTable.id, studentIds))
        : [],
      sessionIds.length > 0
        ? db.select({ classSessionId: studentSessionsTable.classSessionId, studentId: studentSessionsTable.studentId, attendanceStatus: studentSessionsTable.attendanceStatus })
            .from(studentSessionsTable)
            .where(and(inArray(studentSessionsTable.studentId, studentIds), inArray(studentSessionsTable.classSessionId, sessionIds)))
        : [],
    ]);

    const teacherNameMap = new Map(teacherUsers.map((u) => [u.id, u.name ?? u.username]));
    const studentNameMap = new Map(studentUsers.map((u) => [u.id, u.name ?? u.username]));
    // classId -> studentId[]
    const classStudentMap = new Map<string, string[]>();
    for (const e of enrollments) {
      if (!classStudentMap.has(e.classId)) classStudentMap.set(e.classId, []);
      classStudentMap.get(e.classId)!.push(e.studentId);
    }
    // (classSessionId, studentId) -> attendanceStatus
    const ssKey = (csId: string, stId: string) => `${csId}::${stId}`;
    const ssMap = new Map(studentSessionRows.map((ss) => [ssKey(ss.classSessionId, ss.studentId), ss.attendanceStatus]));

    const mapped: object[] = [];
    for (const s of sessions) {
      const cls = classMap.get(s.classId);
      const enrolledStudents = classStudentMap.get(s.classId) ?? [];
      if (isParent) {
        // For parent: one entry per enrolled linked student
        for (const stId of enrolledStudents) {
          mapped.push({
            classSessionId: s.id,
            className: cls?.name ?? "",
            classCode: cls?.code ?? "",
            locationName: s.locationName ?? "",
            startTime: s.startTime ?? "",
            endTime: s.endTime ?? "",
            sessionStatus: s.status,
            learningFormat: s.learningFormat ?? "offline",
            teacherNames: (s.teacherIds ?? []).map((id) => teacherNameMap.get(id) ?? id),
            attendanceStatus: ssMap.get(ssKey(s.id, stId)) ?? "pending",
            studentName: studentNameMap.get(stId) ?? stId,
          });
        }
      } else {
        const stId = studentIds[0];
        mapped.push({
          classSessionId: s.id,
          className: cls?.name ?? "",
          classCode: cls?.code ?? "",
          locationName: s.locationName ?? "",
          startTime: s.startTime ?? "",
          endTime: s.endTime ?? "",
          sessionStatus: s.status,
          learningFormat: s.learningFormat ?? "offline",
          teacherNames: (s.teacherIds ?? []).map((id) => teacherNameMap.get(id) ?? id),
          attendanceStatus: ssMap.get(ssKey(s.id, stId)) ?? "pending",
        });
      }
    }

    return res.json({ userType: "student", date: today, sessions: mapped });
  } catch (err) {
    console.error("Error fetching schedule:", err);
    return res.status(500).json({ message: "Lỗi server" });
  }
});

// ─── Calendar: month dots ─────────────────────────────────────────────────────

router.get("/mobile/student/calendar/month", requireAuth, async (req, res) => {
  const userId = req.session.userId as string;
  const month = (req.query.month as string) ?? "";

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ message: "Tham số month không hợp lệ (YYYY-MM)" });
  }

  try {
    const role = await getUserRole(userId);
    const { studentIds } = await resolveStudentIds(userId, role);

    if (studentIds.length === 0) return res.json({ month, datesWithSessions: [] });

    const enrollments = await db
      .select({ classId: studentEnrollmentsTable.classId })
      .from(studentEnrollmentsTable)
      .where(inArray(studentEnrollmentsTable.studentId, studentIds));

    const classIds = [...new Set(enrollments.map((e) => e.classId))];
    if (classIds.length === 0) return res.json({ month, datesWithSessions: [] });

    const sessions = await db
      .select({ sessionDate: classSessionsTable.sessionDate })
      .from(classSessionsTable)
      .where(
        and(
          inArray(classSessionsTable.classId, classIds),
          sql`${classSessionsTable.sessionDate} LIKE ${month + "-%"}`
        )
      );

    const datesWithSessions = [...new Set(sessions.map((s) => s.sessionDate).filter(Boolean))].sort();
    return res.json({ month, datesWithSessions });
  } catch (err: unknown) {
    console.error("Error fetching calendar month:", err instanceof Error ? err.stack : err);
    return res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
  }
});

// ─── Calendar: month with full session list ────────────────────────────────────

router.get("/mobile/student/calendar", requireAuth, async (req, res) => {
  const userId = req.session.userId as string;
  const month = (req.query.month as string) ?? "";

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ message: "Tham số month không hợp lệ (YYYY-MM)" });
  }

  const [y, m] = month.split("-").map(Number);
  const monthStart = `${y}-${String(m).padStart(2, "0")}-01`;
  const monthEnd = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;

  try {
    const role = await getUserRole(userId);
    const { studentIds, isParent } = await resolveStudentIds(userId, role);

    if (studentIds.length === 0) return res.json({ month, datesWithSessions: [], sessions: [] });

    const enrollments = await db
      .select({ classId: studentEnrollmentsTable.classId, studentId: studentEnrollmentsTable.studentId })
      .from(studentEnrollmentsTable)
      .where(inArray(studentEnrollmentsTable.studentId, studentIds));

    const classIds = [...new Set(enrollments.map((e) => e.classId))];
    if (classIds.length === 0) return res.json({ month, datesWithSessions: [], sessions: [] });

    const studentByClass = new Map<string, string[]>();
    for (const e of enrollments) {
      if (!studentByClass.has(e.classId)) studentByClass.set(e.classId, []);
      studentByClass.get(e.classId)!.push(e.studentId);
    }

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
        teacherIds: classSessionsTable.teacherIds,
      })
      .from(classSessionsTable)
      .where(
        and(
          inArray(classSessionsTable.classId, classIds),
          gte(classSessionsTable.sessionDate, monthStart),
          lt(classSessionsTable.sessionDate, monthEnd)
        )
      )
      .orderBy(classSessionsTable.sessionDate, classSessionsTable.startTime);

    if (sessions.length === 0) return res.json({ month, datesWithSessions: [], sessions: [] });

    const sessionIds = sessions.map((s) => s.id);

    const [classRows, studentSessionRows, studentRows] = await Promise.all([
      db.select().from(classesTable).where(inArray(classesTable.id, classIds)),
      db.select({
        classSessionId: studentSessionsTable.classSessionId,
        studentId: studentSessionsTable.studentId,
        attendanceStatus: studentSessionsTable.attendanceStatus,
        attendanceNote: studentSessionsTable.attendanceNote,
        reviewPublished: studentSessionsTable.reviewPublished,
      }).from(studentSessionsTable).where(
        and(inArray(studentSessionsTable.studentId, studentIds), inArray(studentSessionsTable.classSessionId, sessionIds))
      ),
      isParent
        ? db.select({ id: usersTable.id, name: usersTable.name, username: usersTable.username })
            .from(usersTable).where(inArray(usersTable.id, studentIds))
        : Promise.resolve([]),
    ]);

    const classMap = new Map(classRows.map((c) => [c.id, c]));
    const ssKey = (sessionId: string, studentId: string) => `${sessionId}:${studentId}`;
    const ssMap = new Map(studentSessionRows.map((ss) => [ssKey(ss.classSessionId, ss.studentId), ss]));
    const studentNameMap = new Map((studentRows as any[]).map((u: any) => [u.id, { name: u.name ?? u.username, code: u.username }]));

    const allTeacherIds = [...new Set(sessions.flatMap((s) => s.teacherIds ?? []))];
    const teacherUsers = allTeacherIds.length > 0
      ? await db.select({ id: usersTable.id, name: usersTable.name, username: usersTable.username })
          .from(usersTable).where(inArray(usersTable.id, allTeacherIds))
      : [];
    const teacherNameMap = new Map(teacherUsers.map((u) => [u.id, u.name ?? u.username]));

    const result: any[] = [];

    for (const s of sessions) {
      const cls = classMap.get(s.classId);
      const studentsInClass = studentByClass.get(s.classId) ?? [];
      const teacherNames = (s.teacherIds ?? []).map((id) => teacherNameMap.get(id) ?? id);

      for (const studentId of studentsInClass) {
        const ss = ssMap.get(ssKey(s.id, studentId));
        const studentInfo = studentNameMap.get(studentId);
        result.push({
          classSessionId: s.id,
          sessionDate: toISODate(s.sessionDate),
          sessionIndex: s.sessionIndex ?? 1,
          weekday: s.weekday ?? "",
          className: cls?.name ?? "",
          classCode: cls?.code ?? "",
          locationName: s.locationName ?? "",
          startTime: s.startTime ?? "",
          endTime: s.endTime ?? "",
          learningFormat: s.learningFormat ?? "offline",
          sessionStatus: s.status ?? "scheduled",
          teacherNames,
          attendanceStatus: ss?.attendanceStatus ?? "pending",
          ...(isParent ? {
            isParent: true,
            ...(studentInfo ? { student: { id: studentId, name: studentInfo.name, code: studentInfo.code } } : {}),
          } : {}),
        });
      }
    }

    const datesWithSessions = [...new Set(sessions.map((s) => s.sessionDate).filter(Boolean))].sort();
    return res.json({ month, datesWithSessions, sessions: result });
  } catch (err) {
    console.error("Error fetching calendar:", err instanceof Error ? err.stack : err);
    return res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
  }
});

// ─── Calendar: day detail ─────────────────────────────────────────────────────

router.get("/mobile/student/calendar/day", requireAuth, async (req, res) => {
  const userId = req.session.userId as string;
  const date = (req.query.date as string) ?? "";

  if (!date) return res.status(400).json({ message: "Thiếu tham số date" });

  const dateKey = date.split("T")[0];

  try {
    const role = await getUserRole(userId);
    const { studentIds, isParent } = await resolveStudentIds(userId, role);

    if (studentIds.length === 0) return res.json({ date: toISODate(dateKey), sessions: [] });

    const enrollments = await db
      .select({ classId: studentEnrollmentsTable.classId, studentId: studentEnrollmentsTable.studentId })
      .from(studentEnrollmentsTable)
      .where(inArray(studentEnrollmentsTable.studentId, studentIds));

    const classIds = [...new Set(enrollments.map((e) => e.classId))];
    if (classIds.length === 0) return res.json({ date: toISODate(dateKey), sessions: [] });

    const studentByClass = new Map<string, string[]>();
    for (const e of enrollments) {
      if (!studentByClass.has(e.classId)) studentByClass.set(e.classId, []);
      studentByClass.get(e.classId)!.push(e.studentId);
    }

    const sessions = await db
      .select({
        id: classSessionsTable.id,
        classId: classSessionsTable.classId,
        sessionDate: classSessionsTable.sessionDate,
        sessionIndex: classSessionsTable.sessionIndex,
        startTime: classSessionsTable.startTime,
        endTime: classSessionsTable.endTime,
        locationName: classSessionsTable.locationName,
        learningFormat: classSessionsTable.learningFormat,
        status: classSessionsTable.status,
        teacherIds: classSessionsTable.teacherIds,
      })
      .from(classSessionsTable)
      .where(and(inArray(classSessionsTable.classId, classIds), eq(classSessionsTable.sessionDate, dateKey)));

    if (sessions.length === 0) return res.json({ date: toISODate(dateKey), sessions: [] });

    const sessionIds = sessions.map((s) => s.id);

    const [classRows, studentSessionRows, studentRows] = await Promise.all([
      db.select().from(classesTable).where(inArray(classesTable.id, classIds)),
      db.select({
        classSessionId: studentSessionsTable.classSessionId,
        studentId: studentSessionsTable.studentId,
        attendanceStatus: studentSessionsTable.attendanceStatus,
        attendanceNote: studentSessionsTable.attendanceNote,
        reviewPublished: studentSessionsTable.reviewPublished,
        reviewData: studentSessionsTable.reviewData,
      }).from(studentSessionsTable).where(
        and(inArray(studentSessionsTable.studentId, studentIds), inArray(studentSessionsTable.classSessionId, sessionIds))
      ),
      isParent
        ? db.select({ id: usersTable.id, name: usersTable.name, username: usersTable.username })
            .from(usersTable).where(inArray(usersTable.id, studentIds))
        : Promise.resolve([]),
    ]);

    const classMap = new Map(classRows.map((c) => [c.id, c]));
    const ssKey = (sessionId: string, studentId: string) => `${sessionId}:${studentId}`;
    const ssMap = new Map(studentSessionRows.map((ss) => [ssKey(ss.classSessionId, ss.studentId), ss]));
    const studentNameMap = new Map((studentRows as any[]).map((u: any) => [u.id, { name: u.name ?? u.username, code: u.username }]));

    const allTeacherIds = [...new Set(sessions.flatMap((s) => s.teacherIds ?? []))];
    const teacherUsers = allTeacherIds.length > 0
      ? await db.select({ id: usersTable.id, name: usersTable.name, username: usersTable.username })
          .from(usersTable).where(inArray(usersTable.id, allTeacherIds))
      : [];
    const teacherNameMap = new Map(teacherUsers.map((u) => [u.id, u.name ?? u.username]));

    const enrollCountMap = new Map<string, number>();
    for (const classId of classIds) {
      const [row] = await db.select({ cnt: count() }).from(studentEnrollmentsTable).where(eq(studentEnrollmentsTable.classId, classId));
      enrollCountMap.set(classId, Number(row?.cnt ?? 0));
    }

    const result: any[] = [];

    for (const s of sessions) {
      const cls = classMap.get(s.classId);
      const studentsInClass = studentByClass.get(s.classId) ?? [];
      const teacherNames = (s.teacherIds ?? []).map((id) => teacherNameMap.get(id) ?? id);

      for (const studentId of studentsInClass) {
        const ss = ssMap.get(ssKey(s.id, studentId));
        const studentInfo = studentNameMap.get(studentId);
        result.push({
          classSessionId: s.id,
          sessionDate: toISODate(s.sessionDate),
          sessionIndex: s.sessionIndex ?? 1,
          className: cls?.name ?? "",
          classCode: cls?.code ?? "",
          locationName: s.locationName ?? "",
          startTime: s.startTime ?? "",
          endTime: s.endTime ?? "",
          learningFormat: s.learningFormat ?? "offline",
          sessionStatus: s.status ?? "scheduled",
          teacherNames,
          attendanceStatus: ss?.attendanceStatus ?? "pending",
          attendanceNote: ss?.attendanceNote ?? null,
          reviewPublished: ss?.reviewPublished ?? false,
          reviewData: ss?.reviewData ?? {},
          generalContents: [],
          personalContents: [],
          enrolledCount: enrollCountMap.get(s.classId) ?? 0,
          ...(isParent && studentInfo
            ? { student: { id: studentId, name: studentInfo.name, code: studentInfo.code }, isParent: true }
            : {}),
        });
      }
    }

    result.sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? ""));
    return res.json({ date: toISODate(dateKey), sessions: result });
  } catch (err) {
    console.error("Error fetching calendar day:", err instanceof Error ? err.stack : err);
    return res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
  }
});

// ─── Session detail ───────────────────────────────────────────────────────────

router.get("/mobile/student/session/:classSessionId", requireAuth, async (req, res) => {
  const userId = req.session.userId as string;
  const { classSessionId } = req.params;
  const studentIdParam = (req.query.studentId as string) || null;

  try {
    const role = await getUserRole(userId);
    const { studentIds, isParent } = await resolveStudentIds(userId, role);

    const targetStudentId = studentIdParam && studentIds.includes(studentIdParam)
      ? studentIdParam
      : studentIds[0];

    if (!targetStudentId) return res.status(403).json({ message: "Không có quyền truy cập" });

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

    if (!session) return res.status(404).json({ message: "Không tìm thấy buổi học" });

    const [cls, enrollment] = await Promise.all([
      db.select().from(classesTable).where(eq(classesTable.id, session.classId)).limit(1).then((r) => r[0] ?? null),
      db.select().from(studentEnrollmentsTable)
        .where(and(eq(studentEnrollmentsTable.studentId, targetStudentId), eq(studentEnrollmentsTable.classId, session.classId)))
        .limit(1).then((r) => r[0] ?? null),
    ]);

    if (!enrollment) return res.status(403).json({ message: "Học viên không học lớp này" });

    const [ss, teacherUsers, enrollCountRow, studentRow] = await Promise.all([
      db.select({
        id: studentSessionsTable.id,
        attendanceStatus: studentSessionsTable.attendanceStatus,
        attendanceNote: studentSessionsTable.attendanceNote,
        reviewPublished: studentSessionsTable.reviewPublished,
        reviewData: studentSessionsTable.reviewData,
      }).from(studentSessionsTable)
        .where(and(eq(studentSessionsTable.studentId, targetStudentId), eq(studentSessionsTable.classSessionId, classSessionId)))
        .limit(1).then((r) => r[0] ?? null),
      (session.teacherIds ?? []).length > 0
        ? db.select({ id: usersTable.id, name: usersTable.name, username: usersTable.username })
            .from(usersTable).where(inArray(usersTable.id, session.teacherIds!))
        : Promise.resolve([]),
      db.select({ cnt: count() }).from(studentEnrollmentsTable).where(eq(studentEnrollmentsTable.classId, session.classId)).then((r) => Number(r[0]?.cnt ?? 0)),
      isParent
        ? db.select({ id: usersTable.id, name: usersTable.name, username: usersTable.username })
            .from(usersTable).where(eq(usersTable.id, targetStudentId)).limit(1).then((r) => r[0] ?? null)
        : Promise.resolve(null),
    ]);

    const teacherNameMap = new Map((teacherUsers as any[]).map((u: any) => [u.id, u.name ?? u.username]));
    const teacherNames = (session.teacherIds ?? []).map((id) => teacherNameMap.get(id) ?? id);

    return res.json({
      classSessionId: session.id,
      studentSessionId: ss?.id ?? null,
      sessionDate: toISODate(session.sessionDate),
      sessionIndex: session.sessionIndex ?? 1,
      className: cls?.name ?? "",
      classCode: cls?.code ?? "",
      locationName: session.locationName ?? "",
      startTime: session.startTime ?? "",
      endTime: session.endTime ?? "",
      learningFormat: session.learningFormat ?? "offline",
      sessionStatus: session.status ?? "scheduled",
      teacherNames,
      attendanceStatus: ss?.attendanceStatus ?? "pending",
      attendanceNote: ss?.attendanceNote ?? null,
      reviewPublished: ss?.reviewPublished ?? false,
      reviewData: ss?.reviewData ?? {},
      generalContents: [],
      personalContents: [],
      enrolledCount: enrollCountRow,
      ...(isParent && studentRow
        ? { student: { id: targetStudentId, name: (studentRow as any).name ?? (studentRow as any).username, code: (studentRow as any).username }, isParent: true }
        : {}),
    });
  } catch (err) {
    console.error("Error fetching session detail:", err instanceof Error ? err.stack : err);
    return res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
  }
});

// ─── Exam: get full exam detail ───────────────────────────────────────────────

router.get("/exams/:examId", requireAuth, async (req, res) => {
  const { examId } = req.params;
  try {
    const [exam] = await db.select().from(examsTable).where(eq(examsTable.id, examId)).limit(1);
    if (!exam) return res.status(404).json({ message: "Không tìm thấy đề thi" });

    const sections = (exam.content as any)?.sections ?? [];
    const questionCount = sections.reduce((sum: number, s: any) => sum + (s.questions?.length ?? 0), 0);

    return res.json({
      id: exam.id,
      title: exam.title,
      description: exam.description ?? null,
      duration: exam.duration ?? null,
      maxAttempts: exam.maxAttempts ?? null,
      questionCount,
      sections,
      createdAt: exam.createdAt,
    });
  } catch (err) {
    console.error("Error fetching exam:", err);
    return res.status(500).json({ message: "Lỗi server" });
  }
});

// ─── Exam: attempt count ──────────────────────────────────────────────────────

router.get("/mobile/student/exam/:examId/attempt-count", requireAuth, async (req, res) => {
  const userId = req.session.userId as string;
  const { examId } = req.params;
  const classId = (req.query.classId as string) || null;
  const studentIdParam = (req.query.studentId as string) || null;

  try {
    const role = await getUserRole(userId);
    const { studentIds } = await resolveStudentIds(userId, role);
    const targetId = studentIdParam && studentIds.includes(studentIdParam)
      ? studentIdParam
      : studentIds[0];

    if (!targetId) return res.status(403).json({ message: "Không có quyền" });

    const conditions = [
      eq(examSubmissionsTable.examId, examId),
      eq(examSubmissionsTable.studentId, targetId),
    ];
    if (classId) conditions.push(eq(examSubmissionsTable.classId, classId));

    const [row] = await db
      .select({ cnt: count() })
      .from(examSubmissionsTable)
      .where(and(...conditions));

    const [exam] = await db
      .select({ maxAttempts: examsTable.maxAttempts })
      .from(examsTable)
      .where(eq(examsTable.id, examId))
      .limit(1);

    const attemptCount = Number(row?.cnt ?? 0);
    const maxAttempts = exam?.maxAttempts ?? null;
    return res.json({
      count: attemptCount,
      attemptCount,
      maxAttempts,
      canAttempt: maxAttempts === null || attemptCount < maxAttempts,
    });
  } catch (err) {
    console.error("Error fetching attempt count:", err);
    return res.status(500).json({ message: "Lỗi server" });
  }
});

// ─── Exam: submit ─────────────────────────────────────────────────────────────

router.post("/exam-submissions", requireAuth, async (req, res) => {
  const userId = req.session.userId as string;
  const { examId, classId, studentId, studentName, studentCode, score, partScores, answers, submittedAt } = req.body as {
    examId?: string;
    classId?: string;
    studentId?: string;
    studentName?: string;
    studentCode?: string;
    score?: string;
    partScores?: Record<string, number>;
    answers?: Record<string, unknown>;
    submittedAt?: string;
  };

  if (!examId || !classId) {
    return res.status(400).json({ message: "Thiếu examId hoặc classId" });
  }

  try {
    const role = await getUserRole(userId);
    const { studentIds } = await resolveStudentIds(userId, role);
    const targetId = studentId && studentIds.includes(studentId) ? studentId : studentIds[0];

    if (!targetId) return res.status(403).json({ message: "Không có quyền" });

    const [exam] = await db.select({ maxAttempts: examsTable.maxAttempts }).from(examsTable).where(eq(examsTable.id, examId)).limit(1);
    if (!exam) return res.status(404).json({ message: "Không tìm thấy đề thi" });

    if (exam.maxAttempts !== null) {
      const [countRow] = await db
        .select({ cnt: count() })
        .from(examSubmissionsTable)
        .where(and(eq(examSubmissionsTable.examId, examId), eq(examSubmissionsTable.studentId, targetId), eq(examSubmissionsTable.classId, classId)));
      if (Number(countRow?.cnt ?? 0) >= exam.maxAttempts) {
        return res.status(400).json({ message: "Đã hết lượt làm bài" });
      }
    }

    const [inserted] = await db
      .insert(examSubmissionsTable)
      .values({
        examId,
        classId,
        studentId: targetId,
        studentName: studentName ?? "",
        studentCode: studentCode ?? "",
        score: score ?? null,
        partScores: partScores ?? {},
        answers: answers ?? {},
        submittedAt: submittedAt ? new Date(submittedAt) : new Date(),
      })
      .returning();

    return res.status(201).json(inserted);
  } catch (err) {
    console.error("Error submitting exam:", err);
    return res.status(500).json({ message: "Lỗi server" });
  }
});

// ─── Exam: get submission ─────────────────────────────────────────────────────

router.get("/exam-submissions/:submissionId", requireAuth, async (req, res) => {
  const userId = req.session.userId as string;
  const { submissionId } = req.params;

  try {
    const role = await getUserRole(userId);
    const { studentIds } = await resolveStudentIds(userId, role);

    const [submission] = await db
      .select()
      .from(examSubmissionsTable)
      .where(eq(examSubmissionsTable.id, submissionId))
      .limit(1);

    if (!submission) return res.status(404).json({ message: "Không tìm thấy bài nộp" });
    if (!studentIds.includes(submission.studentId)) {
      return res.status(403).json({ message: "Không có quyền xem bài này" });
    }

    return res.json(submission);
  } catch (err) {
    console.error("Error fetching exam submission:", err);
    return res.status(500).json({ message: "Lỗi server" });
  }
});

// ─── Staff: Exam library ──────────────────────────────────────────────────────

router.get("/mobile/staff/exams", requireAuth, async (req, res) => {
  const page = Math.max(1, parseInt((req.query.page as string) || "1", 10));
  const pageSize = Math.min(100, Math.max(1, parseInt((req.query.pageSize as string) || "20", 10)));
  const search = ((req.query.search as string) || "").trim();
  const offsetVal = (page - 1) * pageSize;

  try {
    const whereClause = search
      ? sql`${examsTable.title} ILIKE ${"%" + search + "%"}`
      : undefined;

    const [countRows, items] = await Promise.all([
      db.select({ cnt: count() }).from(examsTable).where(whereClause),
      db
        .select({
          id: examsTable.id,
          title: examsTable.title,
          description: examsTable.description,
          duration: examsTable.duration,
          maxAttempts: examsTable.maxAttempts,
          createdAt: examsTable.createdAt,
        })
        .from(examsTable)
        .where(whereClause)
        .orderBy(desc(examsTable.createdAt))
        .limit(pageSize)
        .offset(offsetVal),
    ]);

    const total = Number(countRows[0]?.cnt ?? 0);
    const totalPages = Math.ceil(total / pageSize) || 1;

    return res.json({
      items: items.map((e, i) => ({
        id: e.id,
        code: `EX-${String(offsetVal + i + 1).padStart(3, "0")}`,
        name: e.title,
        status: "Đã xuất bản",
        timeLimitMinutes: e.duration ?? null,
        passingScore: null,
        maxAttempts: e.maxAttempts ?? null,
        description: e.description ?? null,
      })),
      total,
      page,
      pageSize,
      totalPages,
    });
  } catch (err) {
    console.error("Error fetching staff exams:", err);
    return res.status(500).json({ message: err instanceof Error ? err.message : "Lỗi server" });
  }
});

// ─── Notifications ────────────────────────────────────────────────────────────

router.get("/notifications", requireAuth, async (req, res) => {
  return res.json([]);
});

export default router;
