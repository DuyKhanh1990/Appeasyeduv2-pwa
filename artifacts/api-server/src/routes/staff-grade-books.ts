import { Router } from "express";
import { db, usersTable, classesTable, classSessionsTable, studentEnrollmentsTable, scoreSheetsTable, scoreSheetItemsTable, scoreCategoriesTable, gradeBooksTable, gradeBookScoresTable, notificationsTable } from "@workspace/db";
import { eq, and, inArray, sql, count, countDistinct } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

async function notifyStudentsGradeBookPublished(gb: typeof gradeBooksTable.$inferSelect) {
  const enrollments = await db
    .select({ studentId: studentEnrollmentsTable.studentId })
    .from(studentEnrollmentsTable)
    .where(eq(studentEnrollmentsTable.classId, gb.classId));
  if (enrollments.length === 0) return;

  const [cls] = await db
    .select({ name: classesTable.name })
    .from(classesTable)
    .where(eq(classesTable.id, gb.classId))
    .limit(1);
  const className = cls?.name ?? "";

  const rows = enrollments.map((e) => ({
    userId: e.studentId,
    title: "Bảng điểm mới",
    content: `Bảng điểm "${gb.title}"${className ? ` của lớp ${className}` : ""} đã được công bố.`,
    type: "info",
    category: "grade",
    referenceId: gb.id,
    referenceType: "grade_book",
  }));

  await db.insert(notificationsTable).values(rows);
}

async function getStaffClassIds(staffId: string): Promise<string[]> {
  const sessions = await db
    .selectDistinct({ classId: classSessionsTable.classId })
    .from(classSessionsTable)
    .where(sql`${classSessionsTable.teacherIds}::jsonb @> ${JSON.stringify([staffId])}::jsonb`);
  return sessions.map((s) => s.classId);
}

async function buildGradeBookSummary(gbs: typeof gradeBooksTable.$inferSelect[]) {
  if (gbs.length === 0) return [];
  const gbIds = gbs.map((g) => g.id);
  const classIds = [...new Set(gbs.map((g) => g.classId))];
  const ssIds = gbs.filter((g) => g.scoreSheetId).map((g) => g.scoreSheetId as string);
  const sessionIds = gbs.filter((g) => g.sessionId).map((g) => g.sessionId as string);
  const creatorIds = gbs.filter((g) => g.createdById).map((g) => g.createdById as string);
  const updaterIds = gbs.filter((g) => g.updatedById).map((g) => g.updatedById as string);
  const allUserIds = [...new Set([...creatorIds, ...updaterIds])];

  const [classes, sheets, sessions, users, scoreCounts, studentCounts] = await Promise.all([
    classIds.length ? db.select({ id: classesTable.id, code: classesTable.code, name: classesTable.name }).from(classesTable).where(inArray(classesTable.id, classIds)) : [],
    ssIds.length ? db.select({ id: scoreSheetsTable.id, name: scoreSheetsTable.name }).from(scoreSheetsTable).where(inArray(scoreSheetsTable.id, ssIds)) : [],
    sessionIds.length ? db.select({ id: classSessionsTable.id, sessionIndex: classSessionsTable.sessionIndex, sessionDate: classSessionsTable.sessionDate }).from(classSessionsTable).where(inArray(classSessionsTable.id, sessionIds)) : [],
    allUserIds.length ? db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(inArray(usersTable.id, allUserIds)) : [],
    db.select({ gradeBookId: gradeBookScoresTable.gradeBookId, cnt: count() }).from(gradeBookScoresTable).where(inArray(gradeBookScoresTable.gradeBookId, gbIds)).groupBy(gradeBookScoresTable.gradeBookId),
    db.select({ gradeBookId: gradeBookScoresTable.gradeBookId, cnt: countDistinct(gradeBookScoresTable.studentId) }).from(gradeBookScoresTable).where(inArray(gradeBookScoresTable.gradeBookId, gbIds)).groupBy(gradeBookScoresTable.gradeBookId),
  ]);

  const classMap = new Map(classes.map((c) => [c.id, c]));
  const sheetMap = new Map(sheets.map((s) => [s.id, s]));
  const sessionMap = new Map(sessions.map((s) => [s.id, s]));
  const userMap = new Map(users.map((u) => [u.id, u]));
  const scoreCountMap = new Map(scoreCounts.map((r) => [r.gradeBookId, Number(r.cnt)]));
  const studentCountMap = new Map(studentCounts.map((r) => [r.gradeBookId, Number(r.cnt)]));

  return gbs.map((gb) => {
    const cls = classMap.get(gb.classId);
    const sheet = gb.scoreSheetId ? sheetMap.get(gb.scoreSheetId) : null;
    const session = gb.sessionId ? sessionMap.get(gb.sessionId) : null;
    const creator = gb.createdById ? userMap.get(gb.createdById) : null;
    const updater = gb.updatedById ? userMap.get(gb.updatedById) : null;
    return {
      id: gb.id,
      title: gb.title,
      classId: gb.classId,
      classCode: cls?.code ?? "",
      className: cls?.name ?? "",
      scoreSheetId: gb.scoreSheetId ?? null,
      scoreSheetName: sheet?.name ?? "",
      sessionId: gb.sessionId ?? null,
      sessionIndex: session?.sessionIndex ?? null,
      sessionDate: session?.sessionDate ?? null,
      published: gb.published,
      scoreCount: scoreCountMap.get(gb.id) ?? 0,
      studentCount: studentCountMap.get(gb.id) ?? 0,
      createdByName: creator?.name ?? "",
      updatedByName: updater?.name ?? "",
      createdAt: gb.createdAt,
      updatedAt: gb.updatedAt,
    };
  });
}

// 0. Student: get own published score sheets
router.get("/mobile/student/score-sheet", requireAuth, async (req, res) => {
  const studentId = req.session.userId as string;
  try {
    const [user] = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, studentId)).limit(1);
    if (!user) return res.status(401).json({ message: "Unauthorized" });
    if (user.role !== "student") return res.status(403).json({ message: "Tài khoản không phải học viên" });

    const enrollments = await db
      .select({ classId: studentEnrollmentsTable.classId })
      .from(studentEnrollmentsTable)
      .where(eq(studentEnrollmentsTable.studentId, studentId));

    if (enrollments.length === 0) return res.json([]);

    const classIds = enrollments.map((e) => e.classId);

    const gbs = await db
      .select()
      .from(gradeBooksTable)
      .where(and(inArray(gradeBooksTable.classId, classIds), eq(gradeBooksTable.published, true)));

    if (gbs.length === 0) return res.json([]);

    const gbIds = gbs.map((g) => g.id);
    const ssIds = [...new Set(gbs.filter((g) => g.scoreSheetId).map((g) => g.scoreSheetId as string))];
    const sessionIds = gbs.filter((g) => g.sessionId).map((g) => g.sessionId as string);
    const creatorIds = [...new Set(gbs.filter((g) => g.createdById).map((g) => g.createdById as string))];

    const [classes, sheets, sessions, creators, studentScores, sheetItems] = await Promise.all([
      classIds.length ? db.select({ id: classesTable.id, code: classesTable.code, name: classesTable.name }).from(classesTable).where(inArray(classesTable.id, classIds)) : [],
      ssIds.length ? db.select().from(scoreSheetsTable).where(inArray(scoreSheetsTable.id, ssIds)) : [],
      sessionIds.length ? db.select({ id: classSessionsTable.id, sessionIndex: classSessionsTable.sessionIndex, sessionDate: classSessionsTable.sessionDate }).from(classSessionsTable).where(inArray(classSessionsTable.id, sessionIds)) : [],
      creatorIds.length ? db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(inArray(usersTable.id, creatorIds)) : [],
      db.select().from(gradeBookScoresTable).where(and(inArray(gradeBookScoresTable.gradeBookId, gbIds), eq(gradeBookScoresTable.studentId, studentId))),
      ssIds.length ? db.select().from(scoreSheetItemsTable).where(inArray(scoreSheetItemsTable.scoreSheetId, ssIds)) : ([] as (typeof scoreSheetItemsTable.$inferSelect)[]),
    ]);

    const catIds = [...new Set(sheetItems.map((i) => i.categoryId))];
    const categories = catIds.length ? await db.select().from(scoreCategoriesTable).where(inArray(scoreCategoriesTable.id, catIds)) : [];

    const classMap = new Map(classes.map((c) => [c.id, c]));
    const sheetMap = new Map(sheets.map((s) => [s.id, s]));
    const sessionMap = new Map(sessions.map((s) => [s.id, s]));
    const creatorMap = new Map(creators.map((u) => [u.id, u]));
    const catMap = new Map(categories.map((c) => [c.id, c]));
    const scoresByGb = new Map<string, typeof gradeBookScoresTable.$inferSelect[]>();
    for (const s of studentScores) {
      if (!scoresByGb.has(s.gradeBookId)) scoresByGb.set(s.gradeBookId, []);
      scoresByGb.get(s.gradeBookId)!.push(s);
    }

    const result = gbs.map((gb) => {
      const cls = classMap.get(gb.classId);
      const sheet = gb.scoreSheetId ? sheetMap.get(gb.scoreSheetId) : null;
      const session = gb.sessionId ? sessionMap.get(gb.sessionId) : null;
      const creator = gb.createdById ? creatorMap.get(gb.createdById) : null;
      const gbScores = scoresByGb.get(gb.id) ?? [];
      const comments = (gb.studentComments ?? {}) as Record<string, string>;
      const teacherComment = comments[studentId] ?? null;

      let scores: { categoryId: string; categoryName: string; score: string }[] = [];
      if (gbScores.length > 0 && gb.scoreSheetId) {
        const items = sheetItems
          .filter((i) => i.scoreSheetId === gb.scoreSheetId)
          .sort((a, b) => a.order - b.order);
        const mapped = items
          .map((item) => {
            const sc = gbScores.find((s) => s.categoryId === item.categoryId);
            if (!sc) return null;
            const cat = catMap.get(item.categoryId);
            return { categoryId: item.categoryId, categoryName: cat?.name ?? "", score: sc.score };
          })
          .filter((s): s is NonNullable<typeof s> => s !== null);
        scores = mapped;
      } else if (gbScores.length > 0) {
        scores = gbScores.map((s) => {
          const cat = catMap.get(s.categoryId);
          return { categoryId: s.categoryId, categoryName: cat?.name ?? "", score: s.score };
        });
      }

      return {
        id: gb.id,
        title: gb.title,
        classId: gb.classId,
        classCode: cls?.code ?? "",
        className: cls?.name ?? "",
        scoreSheetId: gb.scoreSheetId ?? null,
        scoreSheetName: sheet?.name ?? "",
        sessionId: gb.sessionId ?? null,
        sessionIndex: session?.sessionIndex ?? null,
        sessionDate: session?.sessionDate ?? null,
        published: gb.published,
        createdAt: gb.createdAt,
        updatedAt: gb.updatedAt,
        createdByName: creator?.name ?? "",
        scores,
        teacherComment,
      };
    });

    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// 1. All grade books for staff
router.get("/mobile/staff/score-sheet", requireAuth, async (req, res) => {
  const staffId = req.session.userId as string;
  const paginated = req.query.limit !== undefined || req.query.offset !== undefined;
  try {
    const classIds = await getStaffClassIds(staffId);
    if (classIds.length === 0) return res.json(paginated ? { items: [], total: 0, limit: 20, offset: 0, hasMore: false } : []);
    const gbs = await db.select().from(gradeBooksTable).where(inArray(gradeBooksTable.classId, classIds));
    const sorted = gbs.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    if (!paginated) {
      const result = await buildGradeBookSummary(sorted);
      return res.json(result);
    }

    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const page = sorted.slice(offset, offset + limit);
    const result = await buildGradeBookSummary(page);
    return res.json({ items: result, total: sorted.length, limit, offset, hasMore: offset + limit < sorted.length });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// 2. Staff classes
router.get("/mobile/staff/classes", requireAuth, async (req, res) => {
  const staffId = req.session.userId as string;
  try {
    const classIds = await getStaffClassIds(staffId);
    if (classIds.length === 0) return res.json([]);
    const classes = await db.select({ id: classesTable.id, code: classesTable.code, name: classesTable.name }).from(classesTable).where(inArray(classesTable.id, classIds));
    return res.json(classes.map((c) => ({ id: c.id, classCode: c.code, name: c.name, locationId: null, scoreSheetId: null })));
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// 3. Score sheet templates
router.get("/mobile/score-sheets", requireAuth, async (req, res) => {
  try {
    const sheets = await db.select().from(scoreSheetsTable);
    const sheetIds = sheets.map((s) => s.id);
    const items = sheetIds.length
      ? await db.select({ id: scoreSheetItemsTable.id, scoreSheetId: scoreSheetItemsTable.scoreSheetId, categoryId: scoreSheetItemsTable.categoryId, formula: scoreSheetItemsTable.formula, order: scoreSheetItemsTable.order }).from(scoreSheetItemsTable).where(inArray(scoreSheetItemsTable.scoreSheetId, sheetIds))
      : [];
    const catIds = [...new Set(items.map((i) => i.categoryId))];
    const categories = catIds.length ? await db.select().from(scoreCategoriesTable).where(inArray(scoreCategoriesTable.id, catIds)) : [];
    const catMap = new Map(categories.map((c) => [c.id, c]));
    return res.json(sheets.map((s) => ({
      id: s.id,
      name: s.name,
      items: items.filter((i) => i.scoreSheetId === s.id).sort((a, b) => a.order - b.order).map((i) => {
        const cat = catMap.get(i.categoryId);
        return { id: i.id, scoreSheetId: i.scoreSheetId, categoryId: i.categoryId, formula: i.formula, order: i.order, category: cat ? { id: cat.id, name: cat.name, code: cat.code } : null };
      }),
    })));
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// 4. Sessions of a class
router.get("/mobile/staff/classes/:classId/sessions", requireAuth, async (req, res) => {
  const { classId } = req.params;
  try {
    const sessions = await db.select({ id: classSessionsTable.id, sessionIndex: classSessionsTable.sessionIndex, sessionDate: classSessionsTable.sessionDate, weekday: classSessionsTable.weekday, startTime: classSessionsTable.startTime, endTime: classSessionsTable.endTime }).from(classSessionsTable).where(eq(classSessionsTable.classId, classId));
    return res.json(sessions);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// 5. Active students in a class
router.get("/mobile/staff/classes/:classId/active-students", requireAuth, async (req, res) => {
  const { classId } = req.params;
  try {
    const enrollments = await db.select({ studentId: studentEnrollmentsTable.studentId }).from(studentEnrollmentsTable).where(eq(studentEnrollmentsTable.classId, classId));
    if (enrollments.length === 0) return res.json([]);
    const studentIds = enrollments.map((e) => e.studentId);
    const students = await db.select({ id: usersTable.id, name: usersTable.name, username: usersTable.username }).from(usersTable).where(inArray(usersTable.id, studentIds));
    return res.json(students.map((s) => ({ id: s.id, fullName: s.name ?? s.username, code: s.username, phone: null, email: null })));
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// 6. Grade books for a class
router.get("/mobile/staff/classes/:classId/grade-books", requireAuth, async (req, res) => {
  const { classId } = req.params;
  const paginated = req.query.limit !== undefined || req.query.offset !== undefined;
  try {
    const gbs = await db.select().from(gradeBooksTable).where(eq(gradeBooksTable.classId, classId));
    const sorted = gbs.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    if (!paginated) {
      const result = await buildGradeBookSummary(sorted);
      return res.json(result);
    }

    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const page = sorted.slice(offset, offset + limit);
    const result = await buildGradeBookSummary(page);
    return res.json({ items: result, total: sorted.length, limit, offset, hasMore: offset + limit < sorted.length });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// 7. Grade book detail
router.get("/mobile/staff/classes/:classId/grade-books/:id", requireAuth, async (req, res) => {
  const { classId, id } = req.params;
  try {
    const [gb] = await db.select().from(gradeBooksTable).where(and(eq(gradeBooksTable.id, id), eq(gradeBooksTable.classId, classId))).limit(1);
    if (!gb) return res.status(404).json({ message: "Không tìm thấy bảng điểm" });
    const scores = await db.select().from(gradeBookScoresTable).where(eq(gradeBookScoresTable.gradeBookId, id));
    return res.json({ scores: scores.map((s) => ({ id: s.id, gradeBookId: s.gradeBookId, studentId: s.studentId, categoryId: s.categoryId, score: s.score })), studentComments: gb.studentComments ?? {} });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// 8. Create grade book
router.post("/mobile/staff/classes/:classId/grade-books", requireAuth, async (req, res) => {
  const { classId } = req.params;
  const staffId = req.session.userId as string;
  const { title, scoreSheetId, sessionId, published, scores, studentComments } = req.body as {
    title: string;
    scoreSheetId?: string;
    sessionId?: string | null;
    published?: boolean;
    scores?: { studentId: string; categoryId: string; score: string }[];
    studentComments?: Record<string, string>;
  };
  if (!title) return res.status(400).json({ message: "Thiếu tiêu đề" });
  try {
    const [gb] = await db.insert(gradeBooksTable).values({
      title,
      classId,
      scoreSheetId: scoreSheetId ?? null,
      sessionId: sessionId ?? null,
      published: published ?? false,
      studentComments: studentComments ?? {},
      createdById: staffId,
      updatedById: staffId,
    }).returning();
    if (scores && scores.length > 0) {
      await db.insert(gradeBookScoresTable).values(scores.map((s) => ({ gradeBookId: gb.id, studentId: s.studentId, categoryId: s.categoryId, score: s.score })));
    }
    if (gb.published) {
      await notifyStudentsGradeBookPublished(gb);
    }
    const [result] = await buildGradeBookSummary([gb]);
    return res.status(201).json(result);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// 9. Update grade book
router.put("/mobile/staff/classes/:classId/grade-books/:id", requireAuth, async (req, res) => {
  const { classId, id } = req.params;
  const staffId = req.session.userId as string;
  const { title, scoreSheetId, sessionId, published, scores, studentComments } = req.body as {
    title?: string;
    scoreSheetId?: string;
    sessionId?: string | null;
    published?: boolean;
    scores?: { studentId: string; categoryId: string; score: string }[];
    studentComments?: Record<string, string>;
  };
  try {
    const [existing] = await db.select().from(gradeBooksTable).where(and(eq(gradeBooksTable.id, id), eq(gradeBooksTable.classId, classId))).limit(1);
    if (!existing) return res.status(404).json({ message: "Không tìm thấy bảng điểm" });
    const updateData: Partial<typeof gradeBooksTable.$inferInsert> = { updatedById: staffId, updatedAt: new Date() };
    if (title !== undefined) updateData.title = title;
    if (scoreSheetId !== undefined) updateData.scoreSheetId = scoreSheetId;
    if (sessionId !== undefined) updateData.sessionId = sessionId;
    if (published !== undefined) updateData.published = published;
    if (studentComments !== undefined) updateData.studentComments = studentComments;
    const [updated] = await db.update(gradeBooksTable).set(updateData).where(eq(gradeBooksTable.id, id)).returning();
    if (scores !== undefined) {
      await db.delete(gradeBookScoresTable).where(eq(gradeBookScoresTable.gradeBookId, id));
      if (scores.length > 0) {
        await db.insert(gradeBookScoresTable).values(scores.map((s) => ({ gradeBookId: id, studentId: s.studentId, categoryId: s.categoryId, score: s.score })));
      }
    }
    if (!existing.published && updated.published) {
      await notifyStudentsGradeBookPublished(updated);
    }
    const [result] = await buildGradeBookSummary([updated]);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// 10. Delete grade book
router.delete("/mobile/staff/classes/:classId/grade-books/:id", requireAuth, async (req, res) => {
  const { classId, id } = req.params;
  try {
    const [existing] = await db.select().from(gradeBooksTable).where(and(eq(gradeBooksTable.id, id), eq(gradeBooksTable.classId, classId))).limit(1);
    if (!existing) return res.status(404).json({ message: "Không tìm thấy bảng điểm" });
    await db.delete(gradeBooksTable).where(eq(gradeBooksTable.id, id));
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

export default router;
