// Tracks which chat topic (if any) is currently open on screen.
//
// WHY: khi app đang mở sẵn đúng màn hình chat của một topic, tin nhắn mới đã tới
// qua Tinode WebSocket rồi (xem context/ChatUnreadContext.tsx) — nếu vẫn cho OS
// hiện banner/tăng badge từ push notification thì sẽ bị trùng. lib/pushNotifications.ts
// đọc giá trị này trong setNotificationHandler để quyết định có ẩn banner/badge không.

let _activeTopicId: string | null = null;

export function setActiveChatTopic(topicId: string | null): void {
  _activeTopicId = topicId;
}

export function getActiveChatTopic(): string | null {
  return _activeTopicId;
}
