import { Router } from "express";
import multer from "multer";
import { db, newsFeedPostsTable, newsFeedReactionsTable, usersTable } from "@workspace/db";
import { eq, and, desc, inArray, sql, count } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { uploadBufferToObjectStorage } from "../lib/uploadHelper";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const VALID_REACTIONS = ["👍", "❤️", "🎉", "😮", "😢", "👏"];
const VALID_CATEGORIES = ["thong-bao", "su-kien", "hoat-dong", "hoc-thuat", "khuyen-mai"];

function isStaffOrAdmin(role: string) {
  return role === "staff" || role === "teacher" || role === "admin";
}

async function getUserInfo(userId: string) {
  const [u] = await db
    .select({ id: usersTable.id, name: usersTable.name, username: usersTable.username, role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  return u ?? null;
}

/** Build aggregated reactions + myReaction for a list of postIds */
async function buildReactionMaps(postIds: string[], userId: string) {
  if (postIds.length === 0) return { totals: new Map(), mine: new Map() };

  const rows = await db
    .select({ postId: newsFeedReactionsTable.postId, reaction: newsFeedReactionsTable.reaction, userId: newsFeedReactionsTable.userId })
    .from(newsFeedReactionsTable)
    .where(inArray(newsFeedReactionsTable.postId, postIds));

  const totals = new Map<string, Record<string, number>>();
  const mine = new Map<string, string | null>();

  for (const postId of postIds) {
    totals.set(postId, { "👍": 0, "❤️": 0, "🎉": 0, "😮": 0, "😢": 0, "👏": 0 });
    mine.set(postId, null);
  }

  for (const row of rows) {
    const map = totals.get(row.postId);
    if (map) map[row.reaction] = (map[row.reaction] ?? 0) + 1;
    if (row.userId === userId) mine.set(row.postId, row.reaction);
  }

  return { totals, mine };
}

function formatPost(post: typeof newsFeedPostsTable.$inferSelect, authorName: string, authorRole: string | null, reactions: Record<string, number>, myReaction: string | null) {
  return {
    id: post.id,
    authorId: post.authorId,
    authorName,
    authorRole,
    category: post.category,
    content: post.content,
    imageUrl: post.imageUrl ?? null,
    imageUrls: (post.imageUrls as string[]) ?? [],
    isPinned: post.isPinned,
    postLocationIds: (post.postLocationIds as string[]) ?? [],
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
    reactions,
    myReaction,
  };
}

// ─── GET /api/mobile/news-feed ────────────────────────────────────────────────
router.get("/mobile/news-feed", requireAuth, async (req, res) => {
  const userId = req.session.userId as string;
  const category = (req.query.category as string) || "";
  const limit = Math.min(50, Math.max(1, parseInt((req.query.limit as string) || "20", 10)));
  const offset = Math.max(0, parseInt((req.query.offset as string) || "0", 10));

  try {
    const user = await getUserInfo(userId);
    if (!user) return res.status(401).json({ message: "Chưa đăng nhập" });

    const whereClause = category && category !== "all" && VALID_CATEGORIES.includes(category)
      ? eq(newsFeedPostsTable.category, category)
      : undefined;

    const [countRow, posts] = await Promise.all([
      db.select({ cnt: count() }).from(newsFeedPostsTable).where(whereClause),
      db
        .select()
        .from(newsFeedPostsTable)
        .where(whereClause)
        .orderBy(desc(newsFeedPostsTable.isPinned), desc(newsFeedPostsTable.createdAt))
        .limit(limit)
        .offset(offset),
    ]);

    const total = Number(countRow[0]?.cnt ?? 0);
    const postIds = posts.map((p) => p.id);

    // Fetch author info
    const authorIds = [...new Set(posts.map((p) => p.authorId))];
    const authors = authorIds.length > 0
      ? await db.select({ id: usersTable.id, name: usersTable.name, username: usersTable.username, role: usersTable.role })
          .from(usersTable).where(inArray(usersTable.id, authorIds))
      : [];
    const authorMap = new Map(authors.map((a) => [a.id, a]));

    const { totals, mine } = await buildReactionMaps(postIds, userId);

    const data = posts.map((p) => {
      const author = authorMap.get(p.authorId);
      return formatPost(
        p,
        author?.name ?? author?.username ?? "Ẩn danh",
        author?.role ?? null,
        totals.get(p.id) ?? { "👍": 0, "❤️": 0, "🎉": 0, "😮": 0, "😢": 0, "👏": 0 },
        mine.get(p.id) ?? null,
      );
    });

    const canCreate = isStaffOrAdmin(user.role);

    return res.json({ data, total, hasMore: offset + limit < total, permissions: { canCreate } });
  } catch (err) {
    console.error("GET /api/mobile/news-feed error:", err);
    return res.status(500).json({ message: "Lỗi server" });
  }
});

// ─── GET /api/mobile/news-feed/promotions ─────────────────────────────────────
// IMPORTANT: must be defined BEFORE /:id to avoid param conflict
router.get("/mobile/news-feed/promotions", requireAuth, async (req, res) => {
  const userId = req.session.userId as string;
  const limit = Math.min(20, Math.max(1, parseInt((req.query.limit as string) || "20", 10)));

  try {
    const posts = await db
      .select()
      .from(newsFeedPostsTable)
      .where(eq(newsFeedPostsTable.category, "khuyen-mai"))
      .orderBy(desc(newsFeedPostsTable.isPinned), desc(newsFeedPostsTable.createdAt))
      .limit(limit);

    const postIds = posts.map((p) => p.id);
    const authorIds = [...new Set(posts.map((p) => p.authorId))];
    const authors = authorIds.length > 0
      ? await db.select({ id: usersTable.id, name: usersTable.name, username: usersTable.username, role: usersTable.role })
          .from(usersTable).where(inArray(usersTable.id, authorIds))
      : [];
    const authorMap = new Map(authors.map((a) => [a.id, a]));
    const { totals, mine } = await buildReactionMaps(postIds, userId);

    const data = posts.map((p) => {
      const author = authorMap.get(p.authorId);
      return formatPost(
        p,
        author?.name ?? author?.username ?? "Ẩn danh",
        author?.role ?? null,
        totals.get(p.id) ?? { "👍": 0, "❤️": 0, "🎉": 0, "😮": 0, "😢": 0, "👏": 0 },
        mine.get(p.id) ?? null,
      );
    });

    return res.json({ data, total: data.length, hasMore: false });
  } catch (err) {
    console.error("GET /api/mobile/news-feed/promotions error:", err);
    return res.status(500).json({ message: "Lỗi server" });
  }
});

// ─── GET /api/mobile/news-feed/:id ───────────────────────────────────────────
router.get("/mobile/news-feed/:id", requireAuth, async (req, res) => {
  const userId = req.session.userId as string;
  const { id } = req.params;

  try {
    const [post] = await db.select().from(newsFeedPostsTable).where(eq(newsFeedPostsTable.id, id)).limit(1);
    if (!post) return res.status(404).json({ message: "Không tìm thấy bài viết" });

    const author = await getUserInfo(post.authorId);
    const { totals, mine } = await buildReactionMaps([post.id], userId);

    return res.json(formatPost(
      post,
      author?.name ?? author?.username ?? "Ẩn danh",
      author?.role ?? null,
      totals.get(post.id) ?? { "👍": 0, "❤️": 0, "🎉": 0, "😮": 0, "😢": 0, "👏": 0 },
      mine.get(post.id) ?? null,
    ));
  } catch (err) {
    console.error("GET /api/mobile/news-feed/:id error:", err);
    return res.status(500).json({ message: "Lỗi server" });
  }
});

// ─── POST /api/mobile/news-feed/:id/react ────────────────────────────────────
router.post("/mobile/news-feed/:id/react", requireAuth, async (req, res) => {
  const userId = req.session.userId as string;
  const { id } = req.params;
  const { reaction } = req.body as { reaction?: string };

  if (!reaction || !VALID_REACTIONS.includes(reaction)) {
    return res.status(400).json({ message: "Reaction không hợp lệ" });
  }

  try {
    const [post] = await db.select({ id: newsFeedPostsTable.id }).from(newsFeedPostsTable).where(eq(newsFeedPostsTable.id, id)).limit(1);
    if (!post) return res.status(404).json({ message: "Không tìm thấy bài viết" });

    const [existing] = await db
      .select()
      .from(newsFeedReactionsTable)
      .where(and(eq(newsFeedReactionsTable.postId, id), eq(newsFeedReactionsTable.userId, userId)))
      .limit(1);

    if (existing) {
      if (existing.reaction === reaction) {
        // Toggle off
        await db.delete(newsFeedReactionsTable).where(eq(newsFeedReactionsTable.id, existing.id));
        return res.json({ myReaction: null });
      } else {
        // Switch reaction
        await db.update(newsFeedReactionsTable).set({ reaction }).where(eq(newsFeedReactionsTable.id, existing.id));
        return res.json({ myReaction: reaction });
      }
    } else {
      await db.insert(newsFeedReactionsTable).values({ postId: id, userId, reaction });
      return res.json({ myReaction: reaction });
    }
  } catch (err) {
    console.error("POST /api/mobile/news-feed/:id/react error:", err);
    return res.status(500).json({ message: "Lỗi server" });
  }
});

// ─── POST /api/mobile/staff/news-feed ────────────────────────────────────────
router.post("/mobile/staff/news-feed", requireAuth, async (req, res) => {
  const userId = req.session.userId as string;

  try {
    const user = await getUserInfo(userId);
    if (!user || !isStaffOrAdmin(user.role)) {
      return res.status(403).json({ message: "Không có quyền đăng bài" });
    }

    const { content, category, imageUrls, locationIds } = req.body as {
      content?: string;
      category?: string;
      imageUrls?: string[];
      locationIds?: string[];
    };

    if (!content?.trim()) return res.status(400).json({ message: "Nội dung không được để trống" });
    if (category && !VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ message: "Danh mục không hợp lệ" });
    }

    const urls: string[] = Array.isArray(imageUrls) ? imageUrls.filter((u) => typeof u === "string") : [];
    const firstImage = urls[0] ?? null;

    const [inserted] = await db
      .insert(newsFeedPostsTable)
      .values({
        authorId: userId,
        category: category ?? "thong-bao",
        content: content.trim(),
        imageUrl: firstImage,
        imageUrls: urls,
        isPinned: false,
        postLocationIds: Array.isArray(locationIds) ? locationIds : [],
      })
      .returning();

    const author = await getUserInfo(userId);
    return res.status(201).json(formatPost(inserted, author?.name ?? author?.username ?? "Ẩn danh", author?.role ?? null, { "👍": 0, "❤️": 0, "🎉": 0, "😮": 0, "😢": 0, "👏": 0 }, null));
  } catch (err) {
    console.error("POST /api/mobile/staff/news-feed error:", err);
    return res.status(500).json({ message: "Lỗi server" });
  }
});

// ─── PATCH /api/mobile/staff/news-feed/:id ────────────────────────────────────
router.patch("/mobile/staff/news-feed/:id", requireAuth, async (req, res) => {
  const userId = req.session.userId as string;
  const { id } = req.params;

  try {
    const user = await getUserInfo(userId);
    if (!user || !isStaffOrAdmin(user.role)) {
      return res.status(403).json({ message: "Không có quyền" });
    }

    const [post] = await db.select().from(newsFeedPostsTable).where(eq(newsFeedPostsTable.id, id)).limit(1);
    if (!post) return res.status(404).json({ message: "Không tìm thấy bài viết" });
    if (post.authorId !== userId && user.role !== "admin") {
      return res.status(403).json({ message: "Chỉ tác giả mới được sửa bài" });
    }

    const { content, category, imageUrls, locationIds } = req.body as {
      content?: string;
      category?: string;
      imageUrls?: string[];
      locationIds?: string[];
    };

    const updates: Partial<typeof newsFeedPostsTable.$inferInsert> = { updatedAt: new Date() };
    if (content !== undefined) updates.content = content.trim();
    if (category !== undefined && VALID_CATEGORIES.includes(category)) updates.category = category;
    if (imageUrls !== undefined) {
      const urls = imageUrls.filter((u) => typeof u === "string");
      updates.imageUrls = urls;
      updates.imageUrl = urls[0] ?? null;
    }
    if (locationIds !== undefined) updates.postLocationIds = locationIds;

    const [updated] = await db.update(newsFeedPostsTable).set(updates).where(eq(newsFeedPostsTable.id, id)).returning();
    const author = await getUserInfo(updated.authorId);
    const { totals, mine } = await buildReactionMaps([updated.id], userId);

    return res.json(formatPost(updated, author?.name ?? author?.username ?? "Ẩn danh", author?.role ?? null, totals.get(updated.id) ?? { "👍": 0, "❤️": 0, "🎉": 0, "😮": 0, "😢": 0, "👏": 0 }, mine.get(updated.id) ?? null));
  } catch (err) {
    console.error("PATCH /api/mobile/staff/news-feed/:id error:", err);
    return res.status(500).json({ message: "Lỗi server" });
  }
});

// ─── DELETE /api/mobile/staff/news-feed/:id ───────────────────────────────────
router.delete("/mobile/staff/news-feed/:id", requireAuth, async (req, res) => {
  const userId = req.session.userId as string;
  const { id } = req.params;

  try {
    const user = await getUserInfo(userId);
    if (!user || !isStaffOrAdmin(user.role)) {
      return res.status(403).json({ message: "Không có quyền" });
    }

    const [post] = await db.select({ id: newsFeedPostsTable.id, authorId: newsFeedPostsTable.authorId }).from(newsFeedPostsTable).where(eq(newsFeedPostsTable.id, id)).limit(1);
    if (!post) return res.status(404).json({ message: "Không tìm thấy bài viết" });
    if (post.authorId !== userId && user.role !== "admin") {
      return res.status(403).json({ message: "Chỉ tác giả mới được xoá bài" });
    }

    await db.delete(newsFeedPostsTable).where(eq(newsFeedPostsTable.id, id));
    return res.json({ message: "Đã xoá bài viết" });
  } catch (err) {
    console.error("DELETE /api/mobile/staff/news-feed/:id error:", err);
    return res.status(500).json({ message: "Lỗi server" });
  }
});

// ─── POST /api/mobile/staff/news-feed/upload-image ───────────────────────────
router.post("/mobile/staff/news-feed/upload-image", requireAuth, upload.single("file"), async (req, res) => {
  const userId = req.session.userId as string;

  try {
    const user = await getUserInfo(userId);
    if (!user || !isStaffOrAdmin(user.role)) {
      return res.status(403).json({ message: "Không có quyền upload ảnh" });
    }

    const file = req.file;
    if (!file) return res.status(400).json({ message: "Không có file nào được gửi lên" });
    if (!file.mimetype.startsWith("image/")) return res.status(400).json({ message: "Chỉ chấp nhận file ảnh" });

    const result = await uploadBufferToObjectStorage(file);
    return res.status(201).json({ url: result.url });
  } catch (err) {
    console.error("POST /api/mobile/staff/news-feed/upload-image error:", err);
    return res.status(500).json({ message: "Lỗi khi upload ảnh" });
  }
});

export default router;
