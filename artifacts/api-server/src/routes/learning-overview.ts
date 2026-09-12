import { Router } from "express";
import { db, classesTable, classSessionsTable, studentEnrollmentsTable, studentSessionsTable } from "@workspace/db";
import { eq, inArray, and, sql, count } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

router.get("/mobile/learning-overview/summary", requireAuth, async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);

    const allClasses = await db
      .select({ id: classesTable.id })
      .from(classesTable);

    const classIds = allClasses.map((c) => c.id);

    if (classIds.length === 0) {
      return res.json({ studentsEndingSoon: 0, classesEndingSoon: 0 });
    }

    const sessionStats = await db
      .select({
        classId: classSessionsTable.classId,
        endDate: sql<string>`max(${classSessionsTable.sessionDate})`,
        sessionCount: count(classSessionsTable.id),
      })
      .from(classSessionsTable)
      .where(inArray(classSessionsTable.classId, classIds))
      .groupBy(classSessionsTable.classId);

    const sessionStatsMap = new Map(sessionStats.map((s) => [s.classId, s]));

    const enrollments = await db
      .select({
        id: studentEnrollmentsTable.id,
        studentId: studentEnrollmentsTable.studentId,
        classId: studentEnrollmentsTable.classId,
      })
      .from(studentEnrollmentsTable)
      .where(inArray(studentEnrollmentsTable.classId, classIds));

    const allClassSessions = await db
      .select({ id: classSessionsTable.id, classId: classSessionsTable.classId })
      .from(classSessionsTable)
      .where(inArray(classSessionsTable.classId, classIds));

    const sessionToClassMap = new Map(allClassSessions.map((s) => [s.id, s.classId]));
    const allClassSessionIds = allClassSessions.map((s) => s.id).filter(Boolean);

    const studentIds = [...new Set(enrollments.map((e) => e.studentId))].filter(Boolean);

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

    let studentsEndingSoon = 0;
    const endingClassIds = new Set<string>();

    for (const e of enrollments) {
      const stats = sessionStatsMap.get(e.classId);
      const totalSessions = stats ? Number(stats.sessionCount) : 0;
      const attendedSessions = attendedMap.get(`${e.studentId}:${e.classId}`) ?? 0;
      const remainingSessions = Math.max(0, totalSessions - attendedSessions);
      const endDate = stats?.endDate ?? null;

      if (!endDate || endDate < today) continue;
      if (remainingSessions < 5) {
        studentsEndingSoon++;
        endingClassIds.add(e.classId);
      }
    }

    return res.json({ studentsEndingSoon, classesEndingSoon: endingClassIds.size });
  } catch (err) {
    console.error("[learning-overview/summary] error:", err instanceof Error ? err.stack : err);
    return res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
