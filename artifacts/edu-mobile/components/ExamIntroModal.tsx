import { Feather } from "@expo/vector-icons";
import React from "react";
import { useSafeAreaInsets } from "@/hooks/useSafeAreaInsets";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useColors } from "@/hooks/useColors";

export interface ExamMeta {
  examId: string;
  title: string;
  description?: string | null;
  timeLimitMinutes?: number | null;
  maxAttempts?: number | null;
  attemptCount: number;
  questionCount?: number | null;
}

interface ExamIntroModalProps {
  visible: boolean;
  meta: ExamMeta | null;
  loading?: boolean;
  onClose: () => void;
  onStart: () => void | Promise<void>;
}

function InfoCard({
  icon,
  iconColor,
  value,
  label,
  colors,
}: {
  icon: string;
  iconColor: string;
  value: string;
  label: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={[styles.infoCard, { backgroundColor: "#fdf2f8", borderColor: "#f9a8d4" }]}>
      <Feather name={icon as any} size={18} color={iconColor} />
      <Text style={[styles.infoValue, { color: "#be185d" }]}>{value}</Text>
      <Text style={[styles.infoLabel, { color: "#be185d" }]}>{label}</Text>
    </View>
  );
}

export default function ExamIntroModal({
  visible,
  meta,
  loading,
  onClose,
  onStart,
}: ExamIntroModalProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const remaining = meta
    ? meta.maxAttempts !== null && meta.maxAttempts !== undefined
      ? Math.max(0, meta.maxAttempts - meta.attemptCount)
      : null
    : null;

  const isLocked =
    meta?.maxAttempts !== null &&
    meta?.maxAttempts !== undefined &&
    meta.attemptCount >= meta.maxAttempts;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <View style={[styles.sheet, { backgroundColor: colors.background }]}>
              {/* Header */}
              <View style={styles.headerRow}>
                <Text
                  style={[styles.headerTitle, { color: colors.foreground }]}
                  numberOfLines={1}
                >
                  {meta?.title ?? ""}
                </Text>
                <TouchableOpacity
                  onPress={onClose}
                  style={[styles.closeBtn, { backgroundColor: colors.muted }]}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Feather name="x" size={18} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>

              <ScrollView
                contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}
                showsVerticalScrollIndicator={false}
              >
                {loading ? (
                  <View style={styles.loadingCenter}>
                    <ActivityIndicator size="large" color="#be185d" />
                    <Text style={{ color: colors.mutedForeground, marginTop: 12, fontSize: 13 }}>
                      Đang tải thông tin...
                    </Text>
                  </View>
                ) : (
                  <>
                    {/* Exam icon */}
                    <View style={styles.iconWrap}>
                      <View
                        style={[styles.iconCircle, { backgroundColor: "#ec4899" }]}
                      >
                        <Feather name="book-open" size={36} color="#fff" />
                      </View>
                    </View>

                    <Text style={[styles.examTitle, { color: colors.foreground }]}>
                      {meta?.title}
                    </Text>

                    {meta?.description ? (
                      <Text style={[styles.examDesc, { color: colors.mutedForeground }]}>
                        {meta.description}
                      </Text>
                    ) : null}

                    {/* Info grid */}
                    <View style={styles.infoGrid}>
                      <InfoCard
                        icon="clock"
                        iconColor="#be185d"
                        value={meta?.timeLimitMinutes ? `${meta.timeLimitMinutes} phút` : "—"}
                        label="Thời gian"
                        colors={colors}
                      />
                      <InfoCard
                        icon="book"
                        iconColor="#be185d"
                        value={meta?.questionCount ? String(meta.questionCount) : "—"}
                        label="Số câu hỏi"
                        colors={colors}
                      />
                      <InfoCard
                        icon="refresh-cw"
                        iconColor="#be185d"
                        value={`${meta?.attemptCount ?? 0} lần`}
                        label="Đã làm"
                        colors={colors}
                      />
                      <InfoCard
                        icon="check-circle"
                        iconColor={isLocked ? "#ef4444" : "#16a34a"}
                        value={
                          remaining === null
                            ? "∞"
                            : isLocked
                            ? "0 lần"
                            : `${remaining} lần`
                        }
                        label="Còn lại"
                        colors={colors}
                      />
                    </View>

                    {isLocked && (
                      <View style={styles.lockedBanner}>
                        <Feather name="lock" size={14} color="#991b1b" />
                        <Text style={styles.lockedText}>
                          Bạn đã dùng hết {meta?.maxAttempts} lượt làm bài
                        </Text>
                      </View>
                    )}
                  </>
                )}
              </ScrollView>

              {/* Footer */}
              <View style={[styles.footer, { borderTopColor: colors.border }]}>
                <TouchableOpacity
                  style={[
                    styles.startBtn,
                    { opacity: loading || isLocked ? 0.5 : 1 },
                  ]}
                  onPress={onStart}
                  disabled={loading || isLocked}
                  activeOpacity={0.85}
                >
                  <View
                    style={[styles.startGradient, { backgroundColor: isLocked ? "#9ca3af" : "#ec4899" }]}
                  >
                    <Feather name="book-open" size={16} color="#fff" />
                    <Text style={styles.startText}>
                      {isLocked ? "Hết lượt làm bài" : "Bắt đầu làm bài"}
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "90%",
    overflow: "hidden",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 0,
  },
  headerTitle: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 12,
  },
  body: {
    paddingHorizontal: 24,
    paddingBottom: 24,
    alignItems: "center",
  },
  loadingCenter: {
    alignItems: "center",
    paddingVertical: 60,
  },
  iconWrap: {
    marginTop: 16,
    marginBottom: 20,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  examTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    marginBottom: 8,
  },
  examDesc: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginBottom: 16,
    lineHeight: 20,
  },
  infoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    width: "100%",
    justifyContent: "center",
    marginTop: 8,
  },
  infoCard: {
    width: "44%",
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    alignItems: "center",
    gap: 6,
  },
  infoValue: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
  },
  infoLabel: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  lockedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fee2e2",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: 20,
    width: "100%",
  },
  lockedText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "#991b1b",
    flex: 1,
  },
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
  },
  startBtn: {
    borderRadius: 14,
    overflow: "hidden",
  },
  startGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
  },
  startText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
});
