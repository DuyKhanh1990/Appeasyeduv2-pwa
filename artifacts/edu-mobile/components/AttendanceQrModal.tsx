import { Feather } from "@expo/vector-icons";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import QRCode from "react-native-qrcode-svg";

import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { apiGet } from "@/lib/api";

interface AttendanceQrStudent {
  student: {
    id: string;
    code: string;
    fullName: string;
  };
  qr: {
    payload: string;
    token?: string;
    createdAt?: string;
  };
}

interface AttendanceQrResponse {
  isParent: boolean;
  students: AttendanceQrStudent[];
}

export function AttendanceQrModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const colors = useColors();
  const { user } = useAuth();
  const [data, setData] = useState<AttendanceQrResponse | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!visible) return;

    let active = true;
    setLoading(true);
    setError("");
    setData(null);
    setSelectedIndex(0);

    apiGet<AttendanceQrResponse>("/api/mobile/student/attendance-qr")
      .then((response) => {
        if (active) setData(response);
      })
      .catch(() => {
        if (active) setError("Không thể tải mã QR. Vui lòng thử lại.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [visible]);

  const selected = data?.students[selectedIndex] ?? data?.students[0];
  const isParent = user?.role === "parent" || data?.isParent;
  const qrPayload = useMemo(() => selected?.qr.payload?.trim() ?? "", [selected]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: colors.card }]}>
          <View style={styles.header}>
            <View style={styles.headerTitleWrap}>
              <View style={[styles.headerIcon, { backgroundColor: colors.primary + "16" }]}>
                <Feather name="maximize" size={18} color={colors.primary} />
              </View>
              <View>
                <Text style={[styles.title, { color: colors.foreground }]}>Mã QR điểm danh</Text>
                <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
                  Đưa mã này cho giáo viên quét
                </Text>
              </View>
            </View>
            <Pressable onPress={onClose} hitSlop={12} style={styles.closeButton}>
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.stateBox}>
              <ActivityIndicator color={colors.primary} />
              <Text style={[styles.stateText, { color: colors.mutedForeground }]}>Đang tải mã QR...</Text>
            </View>
          ) : error ? (
            <View style={styles.stateBox}>
              <Feather name="alert-circle" size={30} color={colors.destructive} />
              <Text style={[styles.stateText, { color: colors.foreground }]}>{error}</Text>
              <TouchableOpacity
                activeOpacity={0.82}
                onPress={() => setData(null)}
                style={[styles.retryButton, { backgroundColor: colors.primary }]}
              >
                <Text style={styles.retryText}>Đóng và thử lại</Text>
              </TouchableOpacity>
            </View>
          ) : !selected || !qrPayload ? (
            <View style={styles.stateBox}>
              <Feather name="inbox" size={30} color={colors.mutedForeground} />
              <Text style={[styles.stateText, { color: colors.mutedForeground }]}>
                Chưa có mã QR điểm danh.
              </Text>
            </View>
          ) : (
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.content}
            >
              {isParent && (data?.students.length ?? 0) > 1 ? (
                <View style={styles.studentPicker}>
                  <Text style={[styles.pickerLabel, { color: colors.mutedForeground }]}>
                    Chọn học viên
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.studentPills}>
                    {data?.students.map((item, index) => {
                      const active = index === selectedIndex;
                      return (
                        <TouchableOpacity
                          key={item.student.id}
                          activeOpacity={0.82}
                          onPress={() => setSelectedIndex(index)}
                          style={[
                            styles.studentPill,
                            {
                              backgroundColor: active ? colors.primary : colors.background,
                              borderColor: active ? colors.primary : colors.border,
                            },
                          ]}
                        >
                          <Text
                            numberOfLines={1}
                            style={[styles.studentPillText, { color: active ? "#fff" : colors.foreground }]}
                          >
                            {item.student.fullName}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              ) : null}

              <View style={[styles.qrFrame, { borderColor: colors.primary + "25" }]}>
                <QRCode value={qrPayload} size={230} color="#111827" backgroundColor="#ffffff" />
              </View>

              <View style={styles.studentIdentity}>
                <Text style={[styles.studentName, { color: colors.foreground }]}>
                  {selected.student.fullName}
                </Text>
                <View style={[styles.codePill, { backgroundColor: colors.primary + "12" }]}>
                  <Text style={[styles.codeText, { color: colors.primary }]}>{selected.student.code}</Text>
                </View>
              </View>

              <View style={[styles.infoBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <Feather name="shield" size={16} color={colors.success} />
                <Text style={[styles.infoText, { color: colors.mutedForeground }]}>
                  Mã QR cố định theo tài khoản và chỉ dùng để điểm danh tại trung tâm.
                </Text>
              </View>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.58)",
    justifyContent: "center",
    padding: 20,
  },
  sheet: {
    width: "100%",
    maxWidth: 430,
    alignSelf: "center",
    maxHeight: "92%",
    borderRadius: 26,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 14,
  },
  headerTitleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  subtitle: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 3,
  },
  closeButton: {
    padding: 4,
  },
  content: {
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  studentPicker: {
    width: "100%",
    marginBottom: 16,
  },
  pickerLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 8,
  },
  studentPills: {
    gap: 8,
  },
  studentPill: {
    maxWidth: 190,
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 14,
    borderWidth: 1,
  },
  studentPillText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  qrFrame: {
    backgroundColor: "#fff",
    padding: 18,
    borderRadius: 24,
    borderWidth: 1,
    shadowColor: "#0f172a",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  studentIdentity: {
    alignItems: "center",
    marginTop: 16,
    gap: 8,
  },
  studentName: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  codePill: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  codeText: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  infoBox: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginTop: 18,
  },
  infoText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
    fontFamily: "Inter_400Regular",
  },
  stateBox: {
    minHeight: 300,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 26,
  },
  stateText: {
    textAlign: "center",
    fontSize: 14,
    lineHeight: 20,
    fontFamily: "Inter_500Medium",
  },
  retryButton: {
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginTop: 4,
  },
  retryText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
});