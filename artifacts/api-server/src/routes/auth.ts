import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

router.post("/auth/login", async (req, res) => {
  const { username, password } = req.body as { username?: string; password?: string };
  if (!username || !password) {
    return res.status(400).json({ message: "Thiếu tài khoản hoặc mật khẩu" });
  }

  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.username, username)).limit(1);
    if (!user) {
      return res.status(401).json({ message: "Sai tài khoản hoặc mật khẩu" });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ message: "Sai tài khoản hoặc mật khẩu" });
    }

    req.session.userId = user.id;
    req.session.role = user.role;

    return res.json({ id: user.id, username: user.username, name: user.name, role: user.role });
  } catch (err) {
    return res.status(500).json({ message: "Lỗi server" });
  }
});

router.get("/auth/me", async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Chưa đăng nhập" });
  }

  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.session.userId)).limit(1);
    if (!user) {
      return res.status(401).json({ message: "Chưa đăng nhập" });
    }
    return res.json({ id: user.id, username: user.username, name: user.name, role: user.role });
  } catch {
    return res.status(500).json({ message: "Lỗi server" });
  }
});

router.post("/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ message: "Đã logout" });
  });
});

export default router;
