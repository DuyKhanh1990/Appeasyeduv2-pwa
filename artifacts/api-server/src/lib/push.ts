import webpush from "web-push";
import { db, pushSubscriptionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidSubject = process.env.VAPID_SUBJECT;

const configured = Boolean(vapidPublicKey && vapidPrivateKey && vapidSubject);
if (configured) {
  webpush.setVapidDetails(vapidSubject as string, vapidPublicKey as string, vapidPrivateKey as string);
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  notificationId?: string;
};

export function isPushConfigured() {
  return configured;
}

export function getPublicVapidKey() {
  return configured ? vapidPublicKey : null;
}

export async function sendPushToUser(userId: string, payload: PushPayload) {
  if (!configured) return { sent: 0, removed: 0, configured: false };

  const subscriptions = await db
    .select()
    .from(pushSubscriptionsTable)
    .where(eq(pushSubscriptionsTable.userId, userId));

  let sent = 0;
  let removed = 0;
  await Promise.all(subscriptions.map(async (subscription) => {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        JSON.stringify({
          title: payload.title,
          body: payload.body,
          tag: payload.tag ?? payload.notificationId ?? "easyedu-notification",
          data: { url: payload.url ?? "./notifications", notificationId: payload.notificationId },
        }),
      );
      sent += 1;
    } catch (error: any) {
      if (error?.statusCode === 404 || error?.statusCode === 410) {
        await db.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.id, subscription.id));
        removed += 1;
      } else {
        console.error("Web Push delivery failed:", error?.message ?? error);
      }
    }
  }));

  return { sent, removed, configured: true };
}