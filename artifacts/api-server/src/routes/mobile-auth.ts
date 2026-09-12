import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable, parentProfilesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { signToken, requireAuth } from "../middlewares/requireAuth";

const router = Router();

function buildUserTypeResponse(user: typeof usersTable.$inferSelect, parentProfile?: typeof parentProfilesTable.$inferSelect | null) {
  const baseUser = { id: user.id, username: user.username, name: user.name };

  if (user.role === "student") {
    return {
      user: baseUser,
      userType: "student" as const,
      studentId: user.id,
    };
  }

  if (user.role === "parent") {
    return {
      user: baseUser,
      userType: "parent" as const,
      profile: {
        id: parentProfile?.id ?? user.id,
        code: parentProfile?.code ?? user.username,
        fullName: parentProfile ? (parentProfile.relationship ? `${parentProfile.relationship} của` : "") : (user.name ?? user.username),
        type: "Phụ huynh",
      },
    };
  }

  if (user.role === "teacher" || user.role === "staff" || user.role === "admin") {
    return {
      user: baseUser,
      userType: "staff" as const,
      staffId: user.id,
      staffName: user.name ?? user.username,
      staffCode: user.username.toUpperCase(),
    };
  }

  return {
    user: baseUser,
    userType: null,
  };
}

router.post("/mobile/auth/login", async (req, res) => {
  const { username, password } = req.body as { username?: string; password?: string };

  if (!username || !password) {
    return res.status(400).json({ message: "Thiếu tài khoản hoặc mật khẩu" });
  }

  try {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.username, username))
      .limit(1);

    if (!user) {
      return res.status(401).json({ message: "Sai tên đăng nhập hoặc mật khẩu" });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ message: "Sai tên đăng nhập hoặc mật khẩu" });
    }

    req.session.userId = user.id;
    req.session.role = user.role;

    const token = signToken({ id: user.id, username: user.username });

    let parentProfile: typeof parentProfilesTable.$inferSelect | null = null;
    if (user.role === "parent") {
      const [pp] = await db.select().from(parentProfilesTable).where(eq(parentProfilesTable.userId, user.id)).limit(1);
      parentProfile = pp ?? null;
    }

    return res.json({ token, ...buildUserTypeResponse(user, parentProfile) });
  } catch (err) {
    return res.status(500).json({ message: "Lỗi server" });
  }
});

router.get("/mobile/auth/me", requireAuth, async (req, res) => {
  try {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.session.userId as string))
      .limit(1);

    if (!user) {
      return res.status(401).json({ message: "Chưa đăng nhập" });
    }

    let parentProfile: typeof parentProfilesTable.$inferSelect | null = null;
    if (user.role === "parent") {
      const [pp] = await db.select().from(parentProfilesTable).where(eq(parentProfilesTable.userId, user.id)).limit(1);
      parentProfile = pp ?? null;
    }

    return res.json(buildUserTypeResponse(user, parentProfile));
  } catch {
    return res.status(500).json({ message: "Lỗi server" });
  }
});

export default router;
