import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "@/hooks/useSafeAreaInsets";

import { sendPushTokenToBackend } from "@/lib/api";
import {
  registerForPushNotificationsAsync,
  scheduleDelayedTestLocalNotification,
  scheduleTestLocalNotification,
} from "@/lib/pushNotifications";
import { useColors } from "@/hooks/useColors";

export default function PushTestScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sentToBackend, setSentToBackend] = useState(false);
  const [backendError, setBackendError] = useState<string | null>(null);

  const requestToken = async () => {
    setLoading(true);
    setError(null);
    setSentToBackend(false);
    const result = await registerForPushNotificationsAsync();
    setToken(result.token);
    setError(result.error);
    setLoading(false);
  };

  useEffect(() => {
    requestToken();
  }, []);

  const handleCopy = async () => {
    if (!token) return;
    await Clipboard.setStringAsync(token);
    if (Platform.OS === "web") {
      window.alert("Đã copy Push Token");
    } else {
      Alert.alert("Đã sao chép", "Push Token đã được copy vào clipboard.");
    }
  };

  const handleSendToBackend = async () => {
    if (!token) return;
    setBackendError(null);
    const result = await sendPushTokenToBackend(token);
    if (result.ok) {
      setSentToBackend(true);
    } else {
      setBackendError(result.error || "Gửi thất bại");
    }
  };

  const handleLocalTest = async () => {
    await scheduleTestLocalNotification(
      "Thông báo thử nghiệm",
      "Đây là thông báo local test, không qua server."
    );
  };

  const handleDelayedLocalTest = async () => {
    await scheduleDelayedTestLocalNotification(
      "Thông báo hẹn giờ",
      "Thông báo này nổ sau 5 giây. Hãy thoát app hoặc khóa máy để kiểm tra.",
      5
    );
    Alert.alert(
      "Đã hẹn giờ",
      "Thông báo sẽ nổ sau 5 giây. Bạn hãy thoát app hoặc khóa màn hình ngay bây giờ để kiểm tra."
    );
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: 60, paddingHorizontal: 20 }}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="chevron-left" size={26} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>Test Push Notification</Text>
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>EXPO PUSH TOKEN</Text>

        {loading ? (
          <View style={styles.centerRow}>
            <ActivityIndicator color={colors.primary} />
            <Text style={[styles.hint, { color: colors.mutedForeground, marginLeft: 8 }]}>Đang lấy token...</Text>
          </View>
        ) : token ? (
          <>
            <Text selectable style={[styles.tokenText, { color: colors.foreground, borderColor: colors.border }]}>
              {token}
            </Text>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: colors.primary }]}
              onPress={handleCopy}
              activeOpacity={0.85}
            >
              <Feather name="copy" size={16} color="#fff" />
              <Text style={styles.actionBtnText}>Copy Token</Text>
            </TouchableOpacity>
          </>
        ) : (
          <Text style={[styles.hint, { color: colors.destructive }]}>
            {error || "Không lấy được token."}
          </Text>
        )}

        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, marginTop: 10 }]}
          onPress={requestToken}
          activeOpacity={0.85}
        >
          <Feather name="refresh-cw" size={16} color={colors.foreground} />
          <Text style={[styles.actionBtnText, { color: colors.foreground }]}>Lấy lại Token</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>GỬI TOKEN VỀ BACKEND</Text>
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>
          App sẽ gọi POST /api/mobile/push-token tới backend thật (do team web xây dựng). Vì backend đó chưa có endpoint này, bấm nút dưới sẽ báo lỗi — đây là kết quả bình thường ở giai đoạn hiện tại, không phải lỗi app. Xem tài liệu API tại docs/push-notification-api.md.
        </Text>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: colors.primary, opacity: token ? 1 : 0.5, marginTop: 10 }]}
          onPress={handleSendToBackend}
          disabled={!token}
          activeOpacity={0.85}
        >
          <Feather name="upload-cloud" size={16} color="#fff" />
          <Text style={styles.actionBtnText}>{sentToBackend ? "Đã gửi thành công" : "Gửi Token lên Backend"}</Text>
        </TouchableOpacity>
        {backendError && (
          <Text style={[styles.hint, { color: colors.destructive, marginTop: 8 }]}>
            Lỗi: {backendError}
          </Text>
        )}
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>TEST NOTIFICATION LOCAL</Text>
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>
          Không cần server, hoạt động ngay cả trên Expo Go. Dùng để kiểm tra app hiển thị thông báo đúng cách.
        </Text>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: colors.warning, marginTop: 10 }]}
          onPress={handleLocalTest}
          activeOpacity={0.85}
        >
          <Feather name="bell" size={16} color="#fff" />
          <Text style={styles.actionBtnText}>Gửi thông báo thử (local)</Text>
        </TouchableOpacity>

        <Text style={[styles.hint, { color: colors.mutedForeground, marginTop: 14 }]}>
          Muốn kiểm tra khi app đang chạy nền hoặc đã tắt: bấm nút dưới rồi thoát app/khóa máy trong vòng 5 giây.
        </Text>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: colors.primary, marginTop: 10 }]}
          onPress={handleDelayedLocalTest}
          activeOpacity={0.85}
        >
          <Feather name="clock" size={16} color="#fff" />
          <Text style={styles.actionBtnText}>Gửi thông báo hẹn giờ (5 giây)</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>LƯU Ý</Text>
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>
          • Push Token thật (remote) chỉ lấy được khi chạy Development/Production Build, không lấy được trên bản preview web hoặc Expo Go (từ SDK 53 trở lên).{"\n\n"}
          • Notification local hoạt động được ở mọi nơi trừ bản web.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", marginBottom: 20 },
  backBtn: { padding: 4, marginRight: 8 },
  title: { fontSize: 20, fontFamily: "Inter_700Bold" },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 16 },
  sectionLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5, marginBottom: 10 },
  hint: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  tokenText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  centerRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8 },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
  },
  actionBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
