# API Push Notification — Tài liệu cho Backend

App mobile (EduCenter) đã sẵn sàng gửi Expo Push Token lên backend và mong đợi
backend cung cấp 1 endpoint để lưu token, sau đó tự gọi Expo Push API để gửi
thông báo xuống đúng thiết bị. Tài liệu này mô tả đầy đủ những gì backend cần
implement.

## 1. Endpoint lưu Push Token

App gọi endpoint này ngay sau khi user đăng nhập thành công và lấy được push
token của thiết bị.

```
POST /api/mobile/push-token
```

**Headers**: giống các API mobile khác hiện có — `Authorization: Bearer <token>`
hoặc cookie session (tuỳ theo cơ chế auth mà backend đang dùng cho
`/api/mobile/*`).

**Request body:**
```json
{
  "pushToken": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]",
  "platform": "android"
}
```
- `pushToken` (string, bắt buộc): Expo Push Token của thiết bị.
- `platform` (string, bắt buộc): `"android"` hoặc `"ios"`.

**Backend cần làm:**
1. Xác định user hiện tại từ token/session (giống các API mobile khác).
2. Lưu `pushToken` vào bảng, ví dụ `push_tokens`:
   | Cột | Kiểu | Ghi chú |
   |---|---|---|
   | id | uuid/serial | |
   | user_id | uuid/int | FK tới bảng user |
   | push_token | text | unique |
   | platform | text | `android` \| `ios` |
   | updated_at | timestamp | |
3. Nếu `pushToken` đã tồn tại (của user khác hoặc user này đăng nhập lại từ
   máy khác) → upsert theo `push_token` (một thiết bị có thể đổi chủ user khi
   đăng xuất/đăng nhập tài khoản khác).
4. Một user có thể có **nhiều** push token (dùng nhiều thiết bị) — không giới
   hạn 1 token/user.

**Response mong đợi:** `200 OK`, body tuỳ ý (app không đọc nội dung, chỉ cần
status thành công).

## 2. Gửi Push Notification xuống thiết bị

Khi backend cần gửi thông báo (ví dụ: có bài tập mới, lịch học thay đổi,
thông báo từ trung tâm...), gọi thẳng **Expo Push API** — không cần app
mobile hỗ trợ gì thêm, chỉ cần backend có các push token đã lưu ở bước 1.

```
POST https://exp.host/--/api/v2/push/send
Content-Type: application/json
```

**Body (có thể gửi nhiều token cùng lúc, tối đa 100 token/request):**
```json
[
  {
    "to": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]",
    "title": "Lịch học đổi giờ",
    "body": "Buổi học ngày mai chuyển sang 18h00",
    "data": { "type": "schedule_change", "sessionId": "123" },
    "sound": "default",
    "priority": "high",
    "channelId": "default"
  }
]
```

- `channelId: "default"` — app đã tạo sẵn kênh thông báo tên `default` trên
  Android, backend nên gửi đúng giá trị này để noti hiển thị đúng
  âm thanh/độ ưu tiên đã cấu hình.
- `data` — tuỳ chỉnh, app có thể dùng để điều hướng khi user bấm vào noti
  (hiện tại app chưa xử lý deep-link theo `data`, có thể bổ sung sau nếu cần).
- Không cần API key — Expo Push API không yêu cầu xác thực để gửi, chỉ cần
  push token hợp lệ.
- Tài liệu đầy đủ: https://docs.expo.dev/push-notifications/sending-notifications/

**Gợi ý luồng xử lý ở backend:**
1. Khi có sự kiện cần thông báo (bài tập mới, lịch thay đổi, tin nhắn từ
   trung tâm...) → truy vấn `push_tokens` theo `user_id` liên quan.
2. Gộp danh sách token, gọi Expo Push API (chia batch tối đa 100 token/lần).
3. Expo trả về danh sách "ticket" — nên lưu lại để tra cứu lỗi (ví dụ token
   không còn hợp lệ, cần xoá khỏi bảng `push_tokens`).
4. (Khuyến nghị) Định kỳ gọi Expo Push Receipt API để kiểm tra token nào bị
   `DeviceNotRegistered` và xoá khỏi database.

## 3. Điểm cần lưu ý về multi-tenant (nhiều trung tâm)

App mobile lưu `centerUrl` riêng cho từng trung tâm (mỗi trung tâm có domain
backend khác nhau). Vì vậy:
- Endpoint `/api/mobile/push-token` cần tồn tại trên **từng backend của từng
  trung tâm** mà app kết nối tới (không phải 1 backend chung).
- Việc gửi push chỉ cần thực hiện độc lập ở backend của trung tâm đó, không
  cần biết tới các trung tâm khác.

## 4. Trạng thái phía app (đã hoàn thành, không cần chờ)

- App đã lấy được Expo Push Token thật trên thiết bị, đã test xác nhận noti
  hiển thị đúng khi app đang mở, chạy nền, và khi đã tắt hẳn.
- Hàm `sendPushTokenToBackend()` trong `lib/api.ts` đã gọi sẵn
  `POST /api/mobile/push-token` — khi backend có endpoint này, app **không
  cần sửa gì thêm**, chỉ cần trỏ đúng `centerUrl` và test lại.
- Màn hình `app/push-test.tsx` dùng để debug thủ công (xem token, test gửi
  lên backend, test local notification) — có thể giữ lại hoặc gỡ bỏ khi lên
  production tuỳ ý.
