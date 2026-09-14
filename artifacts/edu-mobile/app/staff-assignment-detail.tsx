import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useSafeAreaInsets } from "@/hooks/useSafeAreaInsets";

import { useColors } from "@/hooks/useColors";
import { apiPost } from "@/lib/api";
import { getCurrentAssignment, updateCurrentAssignment, AssignmentRow } from "@/lib/assignmentStore";
import { FileList, FileItem } from "@/components/FileViewer";
import { HomeworkRichEditor, HomeworkRichEditorHandle } from "@/components/HomeworkRichEditor";

/** Normalise submission attachments coming from the API.
 *  Old data may be plain URL strings or objects where name === url.
 *  In either case we cannot recover the original filename, so we show
 *  a generic label and preserve the URL for opening. */
function normaliseAttachments(raw: unknown[]): FileItem[] {
  return raw.map((a) => {
    if (typeof a === "string") {
      return { name: "File đính kèm", url: a };
    }
    const item = a as FileItem;
    const nameIsUrl =
      (item.name || "").startsWith("http") ||
      (item.name || "").startsWith("/api/");
    return { ...item, name: nameIsUrl ? "File đính kèm" : item.name };
  });
}
import { HtmlText } from "@/components/HtmlText";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("vi-VN", {
    weekday: "long",
    day: "numeric",
    month: "numeric",
    year: "numeric",
  });
}


// ─── Section Block ─────────────────────────────────────────────────────────────

function Section({
  label,
  icon,
  accent,
  children,
  colors,
}: {
  label: string;
  icon: string;
  accent: string;
  children: React.ReactNode;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={[sec.wrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={sec.header}>
        <View style={[sec.iconWrap, { backgroundColor: accent + "18" }]}>
          <Feather name={icon as any} size={14} color={accent} />
        </View>
        <Text style={[sec.label, { color: colors.foreground }]}>{label}</Text>
      </View>
      <View style={sec.body}>{children}</View>
    </View>
  );
}

const sec = StyleSheet.create({
  wrap: {
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "transparent",
  },
  iconWrap: {
    width: 26,
    height: 26,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  body: {
    padding: 14,
    paddingTop: 12,
  },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function StaffAssignmentDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = insets.top;

  const [row, setRow] = useState<AssignmentRow | null>(null);
  const [score, setScore] = useState("");
  const [initialComment, setInitialComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const editorRef = useRef<HomeworkRichEditorHandle>(null);

  useEffect(() => {
    const data = getCurrentAssignment();
    if (data) {
      setRow(data);
      setScore(data.score ?? "");
      setInitialComment(data.comment ?? "");
    }
  }, []);

  if (!row) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const isSubmitted = row.submissionStatus === "submitted";
  const isBTVN = row.itemType === "BTVN";
  const isExam = row.itemType === "Bài kiểm tra";
  const typeColor = isBTVN ? "#2563eb" : "#9333ea";
  const hasHomeworkFiles = (row.homeworkAttachments?.length ?? 0) > 0;
  const hasSubmissionFiles = (row.submissionAttachments?.length ?? 0) > 0;
  const submissionFiles = normaliseAttachments((row.submissionAttachments ?? []) as unknown[]);

  const handleSave = async () => {
    setSaving(true);
    const commentHtml = editorRef.current?.getContent() ?? "";
    try {
      await apiPost("/api/mobile/staff/assignments/grade", {
        studentSessionContentId: row.studentSessionContentId,
        score: score.trim() || null,
        gradingComment: commentHtml.trim() || null,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSaved(true);
      const patch = { score: score.trim() || null, comment: commentHtml.trim() || null };
      setRow((prev) => prev ? { ...prev, ...patch } : prev);
      updateCurrentAssignment(patch);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      Alert.alert("Lỗi", "Không thể lưu điểm. Vui lòng thử lại.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View
        style={{
          backgroundColor: colors.gradientStart,
          paddingTop: (Platform.OS === "web" ? topPad : insets.top) + 12,
          paddingBottom: 20,
          paddingHorizontal: 16,
        }}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Feather name="arrow-left" size={22} color="#1e1b4b" />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.headerTitle} numberOfLines={1}>{row.studentName}</Text>
            <Text style={styles.headerSub} numberOfLines={1}>
              {row.className} • {row.weekday} {formatDate(row.sessionDate)}
            </Text>
          </View>
          <View style={[styles.typePill, { backgroundColor: typeColor + "30" }]}>
            <Text style={[styles.typePillText, { color: "#fff" }]}>{row.itemType}</Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Feather name="clock" size={12} color="rgba(255,255,255,0.7)" />
            <Text style={styles.statText}>{row.startTime} – {row.endTime}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Feather name="layers" size={12} color="rgba(255,255,255,0.7)" />
            <Text style={styles.statText}>Buổi {row.sessionIndex}</Text>
          </View>
          {(row.score !== null && row.score !== undefined && row.score !== "") && (
            <>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Feather name="award" size={12} color="rgba(255,255,255,0.7)" />
                <Text style={styles.statText}>Điểm: {row.score}</Text>
              </View>
            </>
          )}
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 14, paddingBottom: 16 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Section label="Đề bài" icon="edit-3" accent="#2563eb" colors={colors}>
          <Text style={[styles.homeworkTitle, { color: colors.foreground }]}>{row.homeworkTitle}</Text>
          {row.homeworkDescription ? (
            <HtmlText html={row.homeworkDescription} style={{ fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 21, color: colors.mutedForeground }} />
          ) : null}
          {hasHomeworkFiles && (
            <View style={{ marginTop: row.homeworkDescription ? 10 : 0 }}>
              <FileList files={row.homeworkAttachments!} />
            </View>
          )}
          {!row.homeworkDescription && !hasHomeworkFiles && (
            <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>Không có mô tả hoặc file đính kèm</Text>
          )}
        </Section>

        {isSubmitted ? (
          <Section label="Bài nộp của học viên" icon="upload" accent="#16a34a" colors={colors}>
            {row.submissionContent ? (
              <HtmlText html={row.submissionContent} style={{ fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 21, color: colors.foreground }} />
            ) : null}
            {!isExam && hasSubmissionFiles ? (
              <View style={{ marginTop: row.submissionContent ? 10 : 0 }}>
                <FileList files={submissionFiles} />
              </View>
            ) : null}
            {isExam && (
              <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>
                Bài kiểm tra được chấm qua hệ thống thi riêng
              </Text>
            )}
            {!row.submissionContent && !hasSubmissionFiles && !isExam && (
              <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>
                Học viên không để lại nội dung
              </Text>
            )}
          </Section>
        ) : (
          <View style={[styles.notSubmittedBanner, { backgroundColor: "#fff7ed", borderColor: "#fed7aa" }]}>
            <Feather name="clock" size={16} color="#c2410c" />
            <Text style={styles.notSubmittedText}>Học viên chưa nộp bài</Text>
          </View>
        )}

        <Section label="Chấm điểm" icon="star" accent="#f59e0b" colors={colors}>
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Điểm số</Text>
            <TextInput
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
              value={score}
              onChangeText={setScore}
              placeholder="VD: 8.5"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="decimal-pad"
              returnKeyType="next"
            />
          </View>
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Nhận xét</Text>
            <View style={[styles.editorWrapper, { borderColor: colors.border }]}>
              <HomeworkRichEditor
                ref={editorRef}
                initialHtml={initialComment}
                expandable
              />
            </View>
          </View>
        </Section>
      </ScrollView>

      {/* Nút Lưu điểm cố định dưới cùng */}
      <View style={[styles.savebar, { paddingBottom: insets.bottom + 8, backgroundColor: colors.background, borderTopColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: saved ? "#16a34a" : "#f59e0b", opacity: saving ? 0.7 : 1 }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Feather name={saved ? "check" : "save"} size={16} color="#fff" />
              <Text style={styles.saveBtnText}>{saved ? "Đã lưu!" : "Lưu điểm"}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
  headerSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.75)",
    marginTop: 2,
  },
  typePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    marginLeft: 8,
  },
  typePillText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  statItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  statText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.85)",
  },
  statDivider: {
    width: 1,
    height: 12,
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  homeworkTitle: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    lineHeight: 22,
    marginBottom: 4,
  },
  descText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 21,
  },
  attachLabel: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  emptyHint: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    fontStyle: "italic",
  },
  notSubmittedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  notSubmittedText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#c2410c",
  },
  fieldGroup: {
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  inputMulti: {
    minHeight: 100,
    paddingTop: 10,
  },
  editorWrapper: {
    borderWidth: 1,
    borderRadius: 10,
    // Không dùng overflow:"hidden" — trên Android nó chặn WebView (tentap-editor)
    // báo chiều cao động lên RN, khiến editor không giãn theo nội dung.
    // Border-radius vẫn hiển thị đúng mà không cần clip.
    overflow: Platform.OS === "ios" ? "hidden" : "visible",
  },
  savebar: {
    paddingHorizontal: 14,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 4,
  },
  saveBtnText: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
});
