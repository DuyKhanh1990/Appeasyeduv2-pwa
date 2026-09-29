// Shared deeplink navigation logic.
//
// Dùng chung cho cả 2 nơi:
//   1. app/_layout.tsx   → khi user bấm vào Push Notification từ hệ thống
//   2. app/notifications.tsx → khi user bấm vào item trong danh sách in-app
//
// Không để logic này ở 2 chỗ riêng biệt — mọi thay đổi mapping chỉ cần sửa ở đây.

import { router } from "expo-router";

import {
  setCalendarDeeplink,
  setAssignmentsDeeplink,
  setChatDeeplink,
  setGradesDeeplink,
  setTasksDeeplink,
} from "@/lib/deeplinkStore";

export interface DeepLink {
  screen: string;
  params?: Record<string, string>;
}

export const DEEPLINK_ROUTES: Record<string, string> = {
  Calendar:       "/(tabs)/schedule",
  Assignments:    "/(tabs)/homework",
  Invoices:       "/invoices",
  ScoreSheet:     "/(tabs)/grades",
  Chat:           "/(tabs)/chat",
  StaffCalendar:  "/(tabs)/schedule",
  StaffGradeBook: "/staff-grade-books",
  StaffSalary:    "/staff-salary-summary",
  StaffTasks:     "/(tabs)/tasks",
};

export function navigateDeeplink(deeplink: DeepLink | null | undefined) {
  if (!deeplink?.screen) return;
  const path = DEEPLINK_ROUTES[deeplink.screen];
  if (!path) return;
  const params = deeplink.params ?? {};

  if (deeplink.screen === "Calendar" || deeplink.screen === "StaffCalendar") {
    // classSessionId is sufficient to load the existing detail screen directly.
    // Keep the calendar fallback below for older payloads without sessionId.
    if (params.sessionId) {
      router.navigate({
        pathname: "/session-detail/[id]" as any,
        params: {
          id: params.sessionId,
          sessionDate: params.date ?? "",
          ...(deeplink.screen === "Calendar" ? { isStudent: "1" } : {}),
        },
      });
      return;
    }
    setCalendarDeeplink({
      date: params.date,
      sessionId: params.sessionId,
      classId: params.classId,
    });
  } else if (deeplink.screen === "Assignments") {
    setAssignmentsDeeplink({ date: params.date, classId: params.classId });
  } else if (deeplink.screen === "Chat") {
    if (!params.topicId) return;
    setChatDeeplink({ topicId: params.topicId, referenceType: params.referenceType });
  } else if (deeplink.screen === "ScoreSheet") {
    setGradesDeeplink({ classId: params.classId });
  } else if (deeplink.screen === "Invoices") {
    // Stack screen — params pass through router directly; no store needed.
    router.navigate({ pathname: "/invoices" as any, params: { invoiceId: params.invoiceId ?? "" } });
    return;
  } else if (deeplink.screen === "StaffGradeBook") {
    // Stack screen — params pass through router directly; no store needed.
    router.navigate({ pathname: "/staff-grade-books" as any, params: { classId: params.classId ?? "" } });
    return;
  } else if (deeplink.screen === "StaffTasks") {
    setTasksDeeplink({ taskId: params.taskId });
  }

  router.navigate(path as any);
}

/** Parse data từ push notification payload.
 *
 * Backend có thể gửi 2 dạng:
 *   - Dạng mới: { screen, params }  — dùng trực tiếp
 *   - Dạng cũ:  { type, referenceType, referenceId } — ánh xạ sang screen
 */
export function deeplinkFromPushData(data: Record<string, any>): DeepLink | null {
  // Dạng mới — backend đã map sẵn
  if (data.screen && typeof data.screen === "string") {
    return { screen: data.screen, params: data.params ?? {} };
  }

  // Dạng cũ — ánh xạ theo type
  const type: string = data.type ?? "";
  switch (type) {
    case "attendance":
      return {
        screen: "Calendar",
        params: {
          date: data.date ?? "",
          classId: data.referenceId ?? "",
          sessionId: data.sessionId ?? "",
        },
      };
    case "schedule":
    case "class":
    case "review":
      return {
        screen: "Calendar",
        params: {
          date: data.date ?? "",
          sessionId: data.sessionId ?? "",
        },
      };
    case "content":
      // "Giao nội dung" → lịch buổi học được giao, không phải BTVN
      return {
        screen: "Calendar",
        params: {
          date: data.date ?? "",
          sessionId: data.sessionId ?? "",
          classId: data.referenceId ?? "",
        },
      };
    case "assignment":
    case "homework":
      return { screen: "Assignments", params: { date: data.date ?? "", classId: data.referenceId ?? "" } };
    case "finance":
    case "invoice":
      return { screen: "Invoices", params: { invoiceId: data.referenceId ?? "" } };
    case "exam":
      return { screen: "ScoreSheet" };
    case "task":
      return { screen: "StaffTasks", params: { taskId: data.referenceId ?? "" } };
    case "chat":
      // referenceId là topicId (grpXXX) — dùng để mở/subscribe đúng kênh qua Tinode.
      // referenceType không phân biệt được nhóm tạo tay và DM (đều "group_chat");
      // màn hình chat tự tra thêm thông tin kênh sau khi mở nếu cần hiển thị khác nhau.
      if (!data.referenceId) return null;
      return { screen: "Chat", params: { topicId: data.referenceId, referenceType: data.referenceType ?? "" } };
    default:
      return null;
  }
}
