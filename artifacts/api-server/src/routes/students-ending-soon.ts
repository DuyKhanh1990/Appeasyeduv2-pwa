import { Router } from "express";
import { db, usersTable, classesTable, classSessionsTable, studentEnrollmentsTable, studentSessionsTable } from "@workspace/db";
import { eq, inArray, and, sql, count } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

router.get("/mobile/students-ending-soon", requireAuth, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize as string) || 20));
    const search = ((req.query.search as string) || "").trim().toLowerCase();
    const classesFilter: string[] = Array.isArray(req.query.classes)
      ? (req.query.classes as string[]).filter(Boolean)
      : req.query.classes ? [(req.query.classes as string)] : [];
    const maxRemaining = req.query.maxRemaining !== undefined && req.query.maxRemaining !== ""
      ? parseInt(req.query.maxRemaining as string)
      : null;
    const dateFrom = (req.query.dateFrom as string) || null;
    const dateTo = (req.query.dateTo as string) || null;
    const statusFilter = (req.query.statusFilter as string) || "";

    const today = new Date().toISOString().slice(0, 10);

    // Fetch all classes
    let allClasses = await db
      .select({ id: classesTable.id, name: classesTable.name, code: classesTable.code })
      .from(classesTable);

    // Build availableClasses from ALL classes (before filtering) for the dropdown
    const availableClasses = allClasses.map((c) => ({ code: c.code ?? "", label: c.name ?? c.code ?? "" }));

    // Apply class filter
    if (classesFilter.length > 0) {
      const lower = classesFilter.map((c) => c.toLowerCase());
      allClasses = allClasses.filter((c) => c.code && lower.includes(c.code.toLowerCase()));
    }

    const classIds = allClasses.map((c) => c.id);

    if (classIds.length === 0) {
      return res.json({ data: [], total: 0, page, pageSize, availableClasses });
    }

    // Enrollments
    const enrollments = await db
      .select({
        id: studentEnrollmentsTable.id,
        studentId: studentEnrollmentsTable.studentId,
        classId: studentEnrollmentsTable.classId,
      })
      .from(studentEnrollmentsTable)
      .where(inArray(studentEnrollmentsTable.classId, classIds));

    if (enrollments.length === 0) {
      return res.json({ data: [], total: 0, page, pageSize, availableClasses });
    }

    const studentIds = [...new Set(enrollments.map((e) => e.studentId))].filter(Boolean);

    if (studentIds.length === 0) {
      return res.json({ data: [], total: 0, page, pageSize, availableClasses });
    }

    // Student info
    const studentRows = await db
      .select({ id: usersTable.id, name: usersTable.name, username: usersTable.username })
      .from(usersTable)
      .where(inArray(usersTable.id, studentIds));
    const studentMap = new Map(studentRows.map((s) => [s.id, s]));

    // Session stats per class
    const sessionStats = await db
      .select({
        classId: classSessionsTable.classId,
        startDate: sql<string>`min(${classSessionsTable.sessionDate})`,
        endDate: sql<string>`max(${classSessionsTable.sessionDate})`,
        sessionCount: count(classSessionsTable.id),
      })
      .from(classSessionsTable)
      .where(inArray(classSessionsTable.classId, classIds))
      .groupBy(classSessionsTable.classId);
    const sessionStatsMap = new Map(sessionStats.map((s) => [s.classId, s]));

    // All class session IDs for attendance lookup
    const allClassSessions = await db
      .select({ id: classSessionsTable.id, classId: classSessionsTable.classId })
      .from(classSessionsTable)
      .where(inArray(classSessionsTable.classId, classIds));
    const sessionToClassMap = new Map(allClassSessions.map((s) => [s.id, s.classId]));
    const allClassSessionIds = allClassSessions.map((s) => s.id).filter(Boolean);

    // Attended sessions per student per class
    const attendedMap = new Map<string, number>();
    if (allClassSessionIds.length > 0 && studentIds.length > 0) {
      const attendance = await db
        .select({
          studentId: studentSessionsTable.studentId,
          classSessionId: studentSessionsTable.classSessionId,
          status: studentSessionsTable.attendanceStatus,
        })
        .from(studentSessionsTable)
        .where(
          and(
            inArray(studentSessionsTable.studentId, studentIds),
            inArray(studentSessionsTable.classSessionId, allClassSessionIds)
          )
        );

      for (const a of attendance) {
        const classId = sessionToClassMap.get(a.classSessionId);
        if (!classId) continue;
        if (a.status === "present" || a.status === "late" || a.status === "attended") {
          const key = `${a.studentId}:${classId}`;
          attendedMap.set(key, (attendedMap.get(key) ?? 0) + 1);
        }
      }
    }

    // Build result rows
    type Row = {
      id: string; studentId: string; classId: string;
      status: string; startDate: string | null; endDate: string | null;
      studentStatus: string; totalSessions: number; attendedSessions: number;
      remainingSessions: number; studentCode: string; studentName: string;
      studentPhone: string; studentEmail: string; classCode: string; className: string;
    };

    const rows: Row[] = [];
    for (const e of enrollments) {
      const student = studentMap.get(e.studentId);
      if (!student) continue;
      const cls = allClasses.find((c) => c.id === e.classId);
      if (!cls) continue;

      const stats = sessionStatsMap.get(e.classId);
      const totalSessions = stats ? Number(stats.sessionCount) : 0;
      const attendedSessions = attendedMap.get(`${e.studentId}:${e.classId}`) ?? 0;
      const remainingSessions = Math.max(0, totalSessions - attendedSessions);
      const endDate = stats?.endDate ?? null;
      const startDate = stats?.startDate ?? null;

      // Status per spec
      let status: string;
      if (!endDate || endDate < today) {
        status = "ended";
      } else if (remainingSessions < 5) {
        status = "ending-soon";
      } else {
        status = "active";
      }

      rows.push({
        id: e.id,
        studentId: e.studentId,
        classId: e.classId,
        status,
        startDate,
        endDate,
        studentStatus: "Không xác định",
        totalSessions,
        attendedSessions,
        remainingSessions,
        studentCode: student.username ?? "",
        studentName: student.name ?? student.username ?? e.studentId,
        studentPhone: "",
        studentEmail: "",
        classCode: cls.code ?? "",
        className: cls.name ?? "",
      });
    }

    // Apply filters
    let filtered = rows;

    if (statusFilter === "ending-soon") filtered = filtered.filter((r) => r.status === "ending-soon");
    else if (statusFilter === "active") filtered = filtered.filter((r) => r.status === "active");
    else if (statusFilter === "ended") filtered = filtered.filter((r) => r.status === "ended");

    if (maxRemaining !== null && !isNaN(maxRemaining)) {
      filtered = filtered.filter((r) => r.remainingSessions <= maxRemaining);
    }
    if (dateFrom) filtered = filtered.filter((r) => r.endDate && r.endDate >= dateFrom);
    if (dateTo) filtered = filtered.filter((r) => r.endDate && r.endDate <= dateTo);
    if (search) {
      filtered = filtered.filter((r) =>
        r.studentName.toLowerCase().includes(search) || r.studentCode.toLowerCase().includes(search)
      );
    }

    // Sort: ending-soon → active → ended; within group: fewest remaining first
    const statusOrder: Record<string, number> = { "ending-soon": 0, "active": 1, "ended": 2 };
    filtered.sort((a, b) => {
      const so = (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3);
      return so !== 0 ? so : a.remainingSessions - b.remainingSessions;
    });

    const total = filtered.length;
    const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

    console.log(`[students-ending-soon] rows=${rows.length} filtered=${total} statusFilter=${statusFilter || "all"} classes=${classesFilter.join(",") || "all"}`);

    return res.json({ data: paginated, total, page, pageSize, availableClasses });
  } catch (err) {
    console.error("[students-ending-soon] error:", err instanceof Error ? err.stack : err);
    return res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
