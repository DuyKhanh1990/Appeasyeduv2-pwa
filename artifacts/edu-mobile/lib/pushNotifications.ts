import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { getActiveChatTopic } from "@/lib/activeChatTopic";
import { apiGet } from "@/lib/api";
import { getProjectId as getExpoProjectId } from "@/lib/pushProject";

if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const data = (notification.request.content.data ?? {}) as Record<string, any>;

      // Tin nhắn chat của đúng kênh đang mở sẵn trên màn hình: tin nhắn đã tới qua
      // Tinode WebSocket rồi, ẩn banner/badge để tránh hiện thông báo trùng.
      if (data.type === "chat" && data.referenceId && data.referenceId === getActiveChatTopic()) {
        return {
          shouldShowBanner: false,
          shouldShowList: false,
          shouldPlaySound: false,
          shouldSetBadge: false,
        };
      }

      return {
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true, // OS tự tăng badge icon khi có push mới
      };
    },
  });
}

export interface PushRegistrationResult {
  token: string | null;
  error: string | null;
}

export function getProjectId(): string | undefined {
  return getExpoProjectId();
}

export async function registerWebServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (
    Platform.OS !== "web" ||
    typeof navigator === "undefined" ||
    !("serviceWorker" in navigator)
  ) {
    return null;
  }

  return navigator.serviceWorker.register("./sw-v4.js", {
    scope: "./",
    updateViaCache: "none",
  });
}

export async function registerForPushNotificationsAsync(): Promise<PushRegistrationResult> {
  if (Platform.OS === "web") {
    return registerForWebPush();
  }

  if (!Device.isDevice) {
    return { token: null, error: "Cần chạy trên thiết bị thật hoặc máy ảo, không hỗ trợ trên Expo Go web/simulator giả lập cơ bản." };
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#2563eb",
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    return { token: null, error: "Bạn chưa cấp quyền nhận thông báo. Vào Cài đặt máy để bật quyền cho app." };
  }

  const projectId = getProjectId();

  try {
    const tokenResponse = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    return { token: tokenResponse.data, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!projectId) {
      return {
        token: null,
        error:
          "Chưa có EAS projectId trong app.json (extra.eas.projectId). Cần chạy `eas init` để liên kết dự án với tài khoản Expo trước khi lấy được Push Token.",
      };
    }
    return { token: null, error: `Không lấy được Push Token: ${message}` };
  }
}

type WebPushConfig = {
  enabled: boolean;
  publicKey: string | null;
};

function base64UrlToUint8Array(value: string): Uint8Array {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = globalThis.atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

async function registerForWebPush(): Promise<PushRegistrationResult> {
  if (
    typeof window === "undefined" ||
    !("Notification" in window) ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window)
  ) {
    return { token: null, error: "Trình duyệt này chưa hỗ trợ Web Push." };
  }

  if (Notification.permission === "denied") {
    return { token: null, error: "Bạn đã chặn thông báo. Hãy bật lại quyền thông báo cho EasyEdu trong cài đặt trình duyệt." };
  }

  try {
    const serviceWorker = await registerWebServiceWorker();
    if (!serviceWorker) {
      return { token: null, error: "Không đăng ký được Service Worker cho Web Push." };
    }

    const config = await apiGet<WebPushConfig>("/api/mobile/push/config");
    if (!config.enabled || !config.publicKey) {
      return { token: null, error: "Trung tâm chưa bật thông báo Web Push." };
    }

    if (Notification.permission === "default") {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        return { token: null, error: "Bạn chưa cấp quyền nhận thông báo trên trình duyệt." };
      }
    }

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToUint8Array(config.publicKey) as BufferSource,
      });
    }

    return {
      token: JSON.stringify(subscription.toJSON()),
      error: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { token: null, error: `Không đăng ký được Web Push: ${message}` };
  }
}

export function addNotificationReceivedListener(
  callback: (notification: Notifications.Notification) => void
) {
  return Notifications.addNotificationReceivedListener(callback);
}

export function addNotificationResponseReceivedListener(
  callback: (response: Notifications.NotificationResponse) => void
) {
  return Notifications.addNotificationResponseReceivedListener(callback);
}

export async function scheduleTestLocalNotification(title: string, body: string) {
  await Notifications.scheduleNotificationAsync({
    content: { title, body, data: { source: "test-push-screen" } },
    trigger: null,
  });
}

export async function scheduleDelayedTestLocalNotification(
  title: string,
  body: string,
  delaySeconds: number
) {
  await Notifications.scheduleNotificationAsync({
    content: { title, body, data: { source: "test-push-screen-delayed" } },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: delaySeconds,
      repeats: false,
    },
  });
}
