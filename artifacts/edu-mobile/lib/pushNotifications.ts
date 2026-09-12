import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { Platform } from "react-native";

import { getActiveChatTopic } from "@/lib/activeChatTopic";

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

export interface PushRegistrationResult {
  token: string | null;
  error: string | null;
}

export function getProjectId(): string | undefined {
  return (
    Constants?.expoConfig?.extra?.eas?.projectId ??
    (Constants as any)?.easConfig?.projectId
  );
}

export async function registerForPushNotificationsAsync(): Promise<PushRegistrationResult> {
  if (Platform.OS === "web") {
    return { token: null, error: "Push notification không hỗ trợ trên bản web, chỉ chạy trên app Android/iOS thật." };
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
