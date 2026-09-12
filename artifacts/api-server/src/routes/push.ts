import { Router } from "express";
import { db, pushSubscriptionsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { getPublicVapidKey, isPushConfigured } from "../lib/push";

const router = Router();

router.get("/mobile/push/config", requireAuth, (_req, res) => {
  return res.json({
    enabled: isPushConfigured(),
    publicKey: getPublicVapidKey(),
  });
});

router.post("/mobile/push/subscription", requireAuth, async (req, res) => {
  const userId = req.session.userId as string;
  const body = req.body as {
    endpoint?: unknown;
    keys?: { p256dh?: unknown; auth?: unknown };
    expirationTime?: unknown;
  };
  const endpoint = typeof body.endpoint === "string" ? body.endpoint.trim() : "";
  const p256dh = typeof body.keys?.p256dh === "string" ? body.keys.p256dh : "";
  const auth = typeof body.keys?.auth === "string" ? body.keys.auth : "";
  const expirationTime = body.expirationTime == null ? null : Number(body.expirationTime);

  if (!endpoint || !p256dh || !auth || (expirationTime !== null && !Number.isFinite(expirationTime))) {
    return res.status(400).json({ message: "Subscription không hợp lệ" });
  }

  try {
    await db
      .insert(pushSubscriptionsTable)
      .values({ userId, endpoint, p256dh, auth, expirationTime })
      .onConflictDoUpdate({
        target: pushSubscriptionsTable.endpoint,
        set: { userId, p256dh, auth, expirationTime, updatedAt: new Date() },
      });
    return res.status(204).send();
  } catch (error: any) {
    return res.status(500).json({ message: error?.message ?? "Không thể lưu subscription" });
  }
});

router.delete("/mobile/push/subscription", requireAuth, async (req, res) => {
  const userId = req.session.userId as string;
  const endpoint = typeof req.body?.endpoint === "string" ? req.body.endpoint.trim() : "";
  if (!endpoint) return res.status(400).json({ message: "Thiếu endpoint" });

  try {
    await db.delete(pushSubscriptionsTable).where(and(
      eq(pushSubscriptionsTable.userId, userId),
      eq(pushSubscriptionsTable.endpoint, endpoint),
    ));
    return res.status(204).send();
  } catch (error: any) {
    return res.status(500).json({ message: error?.message ?? "Không thể xóa subscription" });
  }
});

export default router;