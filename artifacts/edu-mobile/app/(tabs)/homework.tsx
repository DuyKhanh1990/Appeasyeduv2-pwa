import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { popAssignmentsDeeplink } from "@/lib/deeplinkStore";
import React, { useCallback, useEffect, useRef, useState } from "react";
import * as DocumentPicker from "expo-document-picker";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "@/hooks/useSafeAreaInsets";

import { useColors } from "@/hooks/useColors";
import { apiGet, apiPost, apiUpload, clearSession } from "@/lib/api";
import { HtmlText } from "@/components/HtmlText";
import { FileList, FileItem } from "@/components/FileViewer";
import {
  HomeworkRichEditor,
  HomeworkRichEditorHandle,
} from "@/components/HomeworkRichEditor";

/** Returns true if an HTML string has no visible text or images. */
function isHtmlEmpty(html: string): boolean {
  if (!html) return true;
  const hasImg = /<img/i.test(html);
  const text = html.replace(/<[^>]*>/g, "").trim();
  return !text && !hasImg;
}

/** Normalise submissionAttachments: handles legacy string[] and { name, url }[] from DB. */
function normaliseSubmissionFiles(raw: unknown[]): FileItem[] {
  return raw.map((a) => {
    if (typeof a === "string") return { name: "File đính kèm", url: a };
    const item = a as FileItem;
    const nameIsUrl = (item.name || "").startsWith("http") || (item.name || "").startsWith("/api/");
    return { ...item, name: nameIsUrl ? "File đính kèm" : (item.name || "File đính kèm") };
  });
}
import ExamIntroModal, { ExamMeta } from "@/components/ExamIntroModal";
import ExamTakingScreen, { ExamData, ExamSection, ExamSubmitPayload } from "@/components/ExamTakingScreen";

interface Attachment {
  name: string;
  url: string;
}

interface AssignmentRow {
  itemType: "BTVN" | "Bài kiểm tra";
  classSessionId?: string;
  classId?: string;
  className?: string;
  classCode?: string;
  sessionDate?: string;
  weekday?: number;
  sessionIndex?: number;
  startTime?: string;
  endTime?: string;
  homeworkId?: string;
  title: string;
  description?: string;
  attachments?: Attachment[];
  isPersonalized?: boolean;
  submissionStatus?: "pending" | "submitted" | "graded" | string;
  submissionContent?: string | null;
  submissionAttachments?: string[];
  studentSessionContentId?: string | null;
  score?: string | null;
  comment?: string | null;
  examId?: string | null;
  dueDate?: string | null;
  maxAttempts?: number | null;
  attemptsUsed?: number | null;
  submittedAt?: string | null;
  student?: { id: string; name: string; code: string };
  isParent?: boolean;
}

interface AssignmentResponse {
  month: string;
  rows: AssignmentRow[];
  total?: number;
  page?: number;
  pageSize?: number;
  totalPages?: number;
}

interface AttemptCountResponse {
  count: number;
  maxAttempts: number | null;
}

interface WebExamMeta {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: string;
  timeLimitMinutes: number | null;
  maxAttempts: number | null;
  passingScore: string | null;
  showResult: boolean;
  openAt: string | null;
  closeAt: string | null;
}

const STATUS_CONFIG: Record<string, { bg: string; text: string; label: string; dot: string }> = {
  pending:   { bg: "#fff7ed", text: "#c2410c", label: "Chưa nộp",  dot: "#f97316" },
  submitted: { bg: "#eff6ff", text: "#1d4ed8", label: "Đã nộp",   dot: "#3b82f6" },
  graded:    { bg: "#f0fdf4", text: "#166534", label: "Đã chấm",  dot: "#22c55e" },
};

const MONTH_NAMES = ["Tháng 1","Tháng 2","Tháng 3","Tháng 4","Tháng 5","Tháng 6","Tháng 7","Tháng 8","Tháng 9","Tháng 10","Tháng 11","Tháng 12"];

function getFileName(nameOrUrl: unknown): string {
  if (!nameOrUrl) return "File";
  const str = typeof nameOrUrl === "string" ? nameOrUrl : (nameOrUrl as any)?.name || (nameOrUrl as any)?.url || String(nameOrUrl);
  const clean = str.split("?")[0];
  const parts = clean.split("/");
  const last = parts[parts.length - 1];
  try { return decodeURIComponent(last) || str; } catch { return last || str; }
}

const WEEKDAYS_VI_HW = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
function hwGetDateKey(dateStr: string): string {
  return dateStr ? dateStr.slice(0, 10) : "other";
}
function hwFormatTimelineDate(dateKey: string): string {
  if (!dateKey || dateKey === "other") return "Chưa xác định";
  const d = new Date(dateKey + "T00:00:00");
  if (isNaN(d.getTime())) return dateKey;
  const wd = WEEKDAYS_VI_HW[d.getDay()];
  return `${wd}, ${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

type FilterKey = "all" | "BTVN" | "exam" | "pending" | "submitted";
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all",       label: "Tất cả" },
  { key: "BTVN",     label: "BTVN" },
  { key: "exam",     label: "Kiểm tra" },
  { key: "pending",  label: "Chưa nộp" },
  { key: "submitted",label: "Đã nộp" },
];

function StatusBadge({ status }: { status?: string }) {
  const cfg = STATUS_CONFIG[status || "pending"] || STATUS_CONFIG.pending;
  return (
    <View style={{ backgroundColor: cfg.bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 }}>
      <Text style={{ color: cfg.text, fontSize: 11, fontFamily: "Inter_600SemiBold" }}>{cfg.label}</Text>
    </View>
  );
}

function SubmitModal({
  visible,
  assignment,
  onClose,
  onSubmitted,
  colors,
}: {
  visible: boolean;
  assignment: AssignmentRow | null;
  onClose: () => void;
  onSubmitted: (homeworkId: string, content: string, attachments: { name: string; url: string }[]) => void;
  colors: ReturnType<typeof useColors>;
}) {
  const { height: screenH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const panelH = Math.round((screenH - insets.top - insets.bottom) * 0.35);
  const editorRef = useRef<HomeworkRichEditorHandle>(null);
  const [pickedFiles, setPickedFiles] = useState<{ name: string; uri: string; mimeType?: string; file?: File }[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (visible) {
      setPickedFiles([]);
    }
  }, [visible, assignment]);

  const handleSubmit = async () => {
    if (!assignment?.homeworkId) return;
    const html = editorRef.current?.getContent() ?? "";
    if (isHtmlEmpty(html) && pickedFiles.length === 0) {
      Alert.alert("Chú ý", "Vui lòng nhập nội dung bài làm hoặc đính kèm tệp");
      return;
    }
    setSubmitting(true);
    try {
      const attachments: { name: string; url: string }[] = [];

      if (pickedFiles.length > 0) {
        const uploaded = await apiUpload(
          pickedFiles.map(f => ({ uri: f.uri, name: f.name, mimeType: f.mimeType, file: f.file }))
        );
        uploaded.forEach(u => attachments.push({ name: u.name, url: u.url }));
      }

      await apiPost("/api/mobile/student/assignments/submit", {
        homeworkId: assignment.homeworkId,
        submissionContent: html,
        submissionAttachments: attachments,
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSubmitted(assignment.homeworkId, html, attachments);
      onClose();
    } catch {
      Alert.alert("Lỗi", "Không thể nộp bài. Vui lòng thử lại.");
    } finally {
      setSubmitting(false);
    }
  };

  /** Pick non-image files (Word, Excel, PDF, MP3, …) to attach separately. */
  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
      if (!result.canceled && result.assets.length > 0) {
        const docs = result.assets.map(a => ({
          name: a.name,
          uri: a.uri,
          mimeType: a.mimeType ?? undefined,
          file: (a as unknown as { file?: File }).file ?? undefined,
        }));
        setPickedFiles(prev => [...prev, ...docs]);
      }
    } catch {
      Alert.alert("Lỗi", "Không thể mở tệp.");
    }
  };

  const removeFile = (idx: number) => {
    setPickedFiles(prev => prev.filter((_, i) => i !== idx));
    Haptics.selectionAsync();
  };

  if (!assignment) return null;
  const isEdit = assignment.submissionStatus === "submitted" || assignment.submissionStatus === "graded";
  const hasTeacherContent = !!(assignment.description || (assignment.attachments && assignment.attachments.length > 0));

  return (
    <Modal visible={visible} transparent={false} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
              <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>

                {/* ── Header ── */}
                <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: colors.foreground }}>
                      {isEdit ? "Nộp lại bài" : "Nộp bài"}
                    </Text>
                    <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 1 }} numberOfLines={1}>
                      {assignment.title}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" }}>
                    <Feather name="x" size={18} color={colors.mutedForeground} />
                  </TouchableOpacity>
                </View>

                {/* ── Top panel: Teacher content ── */}
                <View style={{ height: panelH, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                  <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6, flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Feather name="book-open" size={13} color={colors.primary} />
                    <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: colors.primary, textTransform: "uppercase", letterSpacing: 0.7 }}>
                      Nội dung giáo viên
                    </Text>
                  </View>
                  <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
                    showsVerticalScrollIndicator={true}
                    nestedScrollEnabled
                  >
                    {hasTeacherContent ? (
                      <>
                        {assignment.description ? (
                          <HtmlText
                            html={assignment.description}
                            style={{ fontSize: 14, color: colors.foreground, lineHeight: 22 } as any}
                          />
                        ) : (
                          <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: colors.mutedForeground, fontStyle: "italic" }}>
                            (Không có mô tả)
                          </Text>
                        )}
                        {assignment.attachments && assignment.attachments.length > 0 && (
                          <View style={{ marginTop: 12 }}>
                            <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, marginBottom: 8 }}>Tệp đính kèm:</Text>
                            <FileList files={assignment.attachments} />
                          </View>
                        )}
                      </>
                    ) : (
                      <View style={{ alignItems: "center", paddingTop: 24, gap: 8 }}>
                        <Feather name="file-text" size={32} color={colors.mutedForeground} />
                        <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>Không có nội dung bài tập</Text>
                      </View>
                    )}
                  </ScrollView>
                </View>

                {/* ── Bottom panel: Student input ── */}
                <View style={{ flex: 1, minHeight: 0 }}>
                  {/* Section label */}
                  <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6, flexDirection: "row", alignItems: "center", gap: 6, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                    <Feather name="edit-3" size={13} color="#7c3aed" />
                    <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: "#7c3aed", textTransform: "uppercase", letterSpacing: 0.7 }}>
                      Bài làm của bạn
                    </Text>
                  </View>

                  {/* Rich-text editor: text + inline images via camera / gallery */}
                  <HomeworkRichEditor
                    key={assignment.homeworkId ?? "new"}
                    ref={editorRef}
                    initialHtml={assignment.submissionContent ?? ""}
                  />

                  {/* File attachment row for docs (Word, PDF, Excel, …) */}
                  <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: colors.card }}>
                    <TouchableOpacity
                      onPress={pickFile}
                      style={{ flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", backgroundColor: colors.muted, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 }}
                    >
                      <Feather name="paperclip" size={13} color={colors.mutedForeground} />
                      <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground }}>Đính kèm file</Text>
                    </TouchableOpacity>
                    {pickedFiles.length > 0 && (
                      <View style={{ marginTop: 8, flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                        {pickedFiles.map((f, i) => (
                          <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#eff6ff", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, maxWidth: 200 }}>
                            <Feather name="file" size={12} color={colors.primary} />
                            <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: colors.primary, flexShrink: 1 }} numberOfLines={1}>{f.name}</Text>
                            <TouchableOpacity onPress={() => removeFile(i)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                              <Feather name="x" size={11} color={colors.primary} />
                            </TouchableOpacity>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                </View>

                                {/* ── Submit button ── */}
                <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: insets.bottom > 0 ? insets.bottom : 16, borderTopWidth: 1, borderTopColor: colors.border }}>
                  <TouchableOpacity
                    style={{ borderRadius: 14, overflow: "hidden", opacity: submitting ? 0.75 : 1 }}
                    onPress={handleSubmit}
                    disabled={submitting}
                    activeOpacity={0.85}
                  >
                    <View
                      style={{ backgroundColor: colors.gradientStart, paddingVertical: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 }}
                    >
                      {submitting ? (
                        <ActivityIndicator color="#1e1b4b" size="small" />
                      ) : (
                        <>
                          <Feather name="send" size={15} color="#1e1b4b" />
                          <Text style={{ color: "#1e1b4b", fontSize: 15, fontFamily: "Inter_700Bold" }}>
                            {isEdit ? "Nộp lại bài" : "Nộp bài"}
                          </Text>
                        </>
                      )}
                    </View>
                  </TouchableOpacity>
                </View>

              </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function AssignmentCard({
  item,
  colors,
  onSubmit,
  onStartExam,
  onViewExamResult,
}: {
  item: AssignmentRow;
  colors: ReturnType<typeof useColors>;
  onSubmit: (item: AssignmentRow) => void;
  onStartExam: (item: AssignmentRow) => void;
  onViewExamResult: (item: AssignmentRow) => void;
}) {
  const insets = useSafeAreaInsets();
  const [commentPopupVisible, setCommentPopupVisible] = useState(false);
  const [submissionPopupVisible, setSubmissionPopupVisible] = useState(false);
  const [resultPopupVisible, setResultPopupVisible] = useState(false);

  const cfg = STATUS_CONFIG[item.submissionStatus || "pending"] || STATUS_CONFIG.pending;
  const isExam = item.itemType === "Bài kiểm tra";

  const dateStr = item.sessionDate
    ? new Date(item.sessionDate).toLocaleDateString("vi-VN", { weekday: "short", day: "numeric", month: "numeric" })
    : "";

  const isExamSubmitted = isExam && (item.submissionStatus === "submitted" || item.submissionStatus === "graded");
  const isExamPending = isExam && item.submissionStatus === "pending" && !!item.examId;

  return (
    <View style={[styles.card, {
      backgroundColor: colors.card,
      borderRadius: colors.radius + 4,
      borderLeftWidth: 4,
      borderLeftColor: cfg.dot,
    }]}>
      {/* Comment popup modal — full screen */}
      <Modal
        visible={commentPopupVisible}
        animationType="slide"
        onRequestClose={() => setCommentPopupVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingTop: insets.top + 14, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.card }}>
            <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: "#fef3c7", alignItems: "center", justifyContent: "center" }}>
              <Feather name="message-square" size={16} color="#d97706" />
            </View>
            <Text style={{ flex: 1, fontSize: 16, fontFamily: "Inter_700Bold", color: colors.foreground }}>Nhận xét của giáo viên</Text>
            <TouchableOpacity onPress={() => setCommentPopupVisible(false)} style={{ padding: 4 }}>
              <Feather name="x" size={20} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 16 }} showsVerticalScrollIndicator={false}>
            <View style={{ backgroundColor: "#fffbeb", borderRadius: 12, padding: 16, borderLeftWidth: 3, borderLeftColor: "#f59e0b" }}>
              <HtmlText html={item.comment ?? ""} style={{ color: "#78350f" } as any} />
            </View>
          </ScrollView>
          <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: insets.bottom + 12, borderTopWidth: 1, borderTopColor: colors.border }}>
            <TouchableOpacity
              onPress={() => setCommentPopupVisible(false)}
              style={{ backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 13, alignItems: "center" }}
            >
              <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" }}>Đóng</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Exam result popup modal */}
      <Modal
        visible={resultPopupVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setResultPopupVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setResultPopupVisible(false)}>
          <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", alignItems: "center", padding: 24 }}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={{ backgroundColor: colors.card, borderRadius: 20, width: "100%", maxWidth: 360, maxHeight: "80%", overflow: "hidden", shadowColor: "#000", shadowOpacity: 0.22, shadowRadius: 20, elevation: 10 }}>
                {/* Header — fixed */}
                <View
                  style={{ backgroundColor: "#1d4ed8", paddingHorizontal: 20, paddingVertical: 16, flexDirection: "row", alignItems: "center", gap: 10 }}
                >
                  <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" }}>
                    <Feather name="award" size={17} color="#fff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" }}>Kết quả bài kiểm tra</Text>
                    <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.75)", marginTop: 1 }} numberOfLines={1}>{item.title}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setResultPopupVisible(false)} style={{ padding: 4 }}>
                    <Feather name="x" size={18} color="rgba(255,255,255,0.8)" />
                  </TouchableOpacity>
                </View>

                {/* Scrollable body */}
                <ScrollView showsVerticalScrollIndicator={false} bounces={false}>

                {/* Score block */}
                <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: item.comment ? 12 : 20 }}>
                  {item.score != null ? (
                    <View style={{ alignItems: "center", marginBottom: 4 }}>
                      <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: "#f0fdf4", borderWidth: 3, borderColor: "#22c55e", alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
                        <Text style={{ fontSize: 30, fontFamily: "Inter_700Bold", color: "#16a34a", lineHeight: 34 }}>{item.score}</Text>
                        <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: "#16a34a", marginTop: 1 }}>điểm</Text>
                      </View>
                      <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
                        {item.submittedAt ? `Nộp lúc ${new Date(item.submittedAt).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "numeric" })}` : "Đã nộp"}
                      </Text>
                    </View>
                  ) : (
                    <View style={{ alignItems: "center", paddingVertical: 12 }}>
                      <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: "#fef9c3", alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
                        <Feather name="clock" size={28} color="#ca8a04" />
                      </View>
                      <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#92400e" }}>Chờ giáo viên chấm điểm</Text>
                    </View>
                  )}
                </View>

                {/* Comment block */}
                {item.comment ? (
                  <View style={{ marginHorizontal: 20, marginBottom: 20, backgroundColor: "#fffbeb", borderRadius: 12, padding: 14, borderLeftWidth: 3, borderLeftColor: "#f59e0b" }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
                      <Feather name="message-square" size={13} color="#d97706" />
                      <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: "#d97706", textTransform: "uppercase", letterSpacing: 0.5 }}>Nhận xét của giáo viên</Text>
                    </View>
                    <HtmlText html={item.comment ?? ""} style={{ color: "#78350f" } as any} />
                  </View>
                ) : null}

                </ScrollView>

                {/* Close button — fixed */}
                <View style={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border }}>
                  <TouchableOpacity
                    onPress={() => setResultPopupVisible(false)}
                    style={{ backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 12, alignItems: "center" }}
                  >
                    <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" }}>Đóng</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Submission full-screen modal */}
      <Modal
        visible={submissionPopupVisible}
        animationType="slide"
        onRequestClose={() => setSubmissionPopupVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          {/* Header */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingTop: insets.top + 14, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.card }}>
            <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: "#eff6ff", alignItems: "center", justifyContent: "center" }}>
              <Feather name="file-text" size={16} color={colors.primary} />
            </View>
            <Text style={{ flex: 1, fontSize: 16, fontFamily: "Inter_700Bold", color: colors.foreground }}>Bài đã nộp</Text>
            <TouchableOpacity onPress={() => setSubmissionPopupVisible(false)} style={{ padding: 4 }}>
              <Feather name="x" size={20} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          {/* Scrollable body */}
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }} showsVerticalScrollIndicator={false}>
            {/* Nội dung bài tập (đề bài) */}
            {(item.description || (item.attachments && item.attachments.length > 0)) && (
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>Nội dung bài tập</Text>
                <View style={{ backgroundColor: colors.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border }}>
                  {item.title ? <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold", color: colors.foreground, marginBottom: item.description ? 8 : 0 }}>{item.title}</Text> : null}
                  {item.description ? (
                    <HtmlText html={item.description} style={{ color: colors.foreground }} />
                  ) : null}
                  {item.attachments && item.attachments.length > 0 && (
                    <View style={{ marginTop: 10 }}>
                      <FileList files={item.attachments} />
                    </View>
                  )}
                </View>
              </View>
            )}

            {/* Bài nộp của học viên */}
            <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>Bài nộp của học viên</Text>
            {item.submissionContent ? (
              <View style={{ backgroundColor: "#eff6ff", borderRadius: 12, padding: 14, borderLeftWidth: 3, borderLeftColor: colors.primary, marginBottom: 12, borderWidth: 1, borderColor: "#bfdbfe" }}>
                <HtmlText html={item.submissionContent} style={{ color: "#1e3a5f" }} />
              </View>
            ) : null}

            {/* File đính kèm bài nộp */}
            {item.submissionAttachments && item.submissionAttachments.length > 0 ? (
              <View style={{ marginTop: item.submissionContent ? 0 : 0 }}>
                <FileList files={normaliseSubmissionFiles(item.submissionAttachments as unknown[])} />
              </View>
            ) : !item.submissionContent ? (
              <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>Học viên không để lại nội dung.</Text>
            ) : null}
          </ScrollView>

          {/* Fixed action buttons */}
          <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingVertical: 12, paddingBottom: insets.bottom + 12, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card }}>
            <TouchableOpacity
              onPress={() => { setSubmissionPopupVisible(false); onSubmit(item); }}
              style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.muted }}
            >
              <Feather name="send" size={13} color={colors.primary} />
              <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.primary }}>Nộp lại</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setSubmissionPopupVisible(false)}
              style={{ flex: 1, paddingVertical: 12, backgroundColor: colors.primary, borderRadius: 12, alignItems: "center" }}
            >
              <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#fff" }}>Đóng</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <View>
        <View style={{ position: "relative" }}>
          {/* Large score — absolutely positioned top-right so it doesn't shrink the content area */}
          {item.score != null && (
            <View style={{ position: "absolute", right: 0, top: 0, alignItems: "center", justifyContent: "center", minWidth: 52, backgroundColor: "#f0fdf4", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 }}>
              <Text style={{ fontSize: 26, fontFamily: "Inter_700Bold", color: "#16a34a", lineHeight: 30 }}>{item.score}</Text>
              <Text style={{ fontSize: 10, fontFamily: "Inter_500Medium", color: "#16a34a", marginTop: 1 }}>điểm</Text>
            </View>
          )}

          <View style={{ paddingRight: item.score != null ? 72 : 0 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
              <View style={{
                backgroundColor: isExam ? "#f3e8ff" : "#eff6ff",
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 8,
              }}>
                <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: isExam ? "#7c3aed" : "#1d4ed8" }}>
                  {item.itemType}
                </Text>
              </View>
              {item.className && (
                <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: colors.mutedForeground }}>
                  {item.className}
                </Text>
              )}
              {(dateStr || item.startTime) ? (
                <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
                  {dateStr ? `· ${dateStr}` : ""}{item.startTime ? `${dateStr ? " " : ""}${item.startTime}–${item.endTime}` : ""}
                </Text>
              ) : null}
            </View>

            <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.foreground, lineHeight: 20, marginBottom: item.student ? 4 : 10 }}>
              {item.title}
            </Text>

            {item.student && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 8 }}>
                <Feather name="user" size={11} color="#16a34a" />
                <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: "#16a34a" }}>
                  {item.student.name}
                </Text>
              </View>
            )}
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <StatusBadge status={item.submissionStatus} />
            {!isExam && (item.submissionStatus === "submitted" || item.submissionStatus === "graded") && (
              <TouchableOpacity
                onPress={(e) => { e.stopPropagation(); Haptics.selectionAsync(); setSubmissionPopupVisible(true); }}
                activeOpacity={0.7}
                style={{ backgroundColor: "#eff6ff", paddingHorizontal: 9, paddingVertical: 5, borderRadius: 10, flexDirection: "row", alignItems: "center", gap: 4 }}
              >
                <Feather name="file-text" size={12} color={colors.primary} />
                <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: colors.primary }}>Xem bài nộp</Text>
              </TouchableOpacity>
            )}
            {item.comment ? (
              <TouchableOpacity
                onPress={(e) => { e.stopPropagation(); Haptics.selectionAsync(); setCommentPopupVisible(true); }}
                activeOpacity={0.7}
                style={{ backgroundColor: "#fef3c7", paddingHorizontal: 9, paddingVertical: 5, borderRadius: 10, flexDirection: "row", alignItems: "center", gap: 4 }}
              >
                <Feather name="eye" size={13} color="#d97706" />
                <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#d97706" }}>Nhận xét</Text>
              </TouchableOpacity>
            ) : null}
            {item.isPersonalized && (
              <View style={{ backgroundColor: "#faf5ff", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: "#7c3aed" }}>Cá nhân hoá</Text>
              </View>
            )}
            {isExam && item.submittedAt && (
              <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
                Nộp: {new Date(item.submittedAt).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </Text>
            )}
          </View>

          {/* Extra meta row: dueDate / attempts */}
          {(() => {
            const showDue = !isExam && !!item.dueDate;
            const attemptsUsed = item.attemptsUsed ?? 0;
            const showAttempts = isExam && (item.maxAttempts != null || attemptsUsed > 0);
            if (!showDue && !showAttempts) return null;
            return (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                {showDue && (() => {
                  const due = new Date(item.dueDate!);
                  const now = new Date();
                  const isOverdue = item.submissionStatus === "pending" && due < now;
                  return (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: isOverdue ? "#fff1f2" : "#f0fdf4", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
                      <Feather name="clock" size={11} color={isOverdue ? "#e11d48" : "#16a34a"} />
                      <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: isOverdue ? "#e11d48" : "#15803d" }}>
                        Hạn nộp: {due.toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </Text>
                    </View>
                  );
                })()}
                {showAttempts && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#f5f3ff", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
                    <Feather name="refresh-cw" size={11} color="#7c3aed" />
                    <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: "#6d28d9" }}>
                      {item.maxAttempts != null
                        ? `${attemptsUsed}/${item.maxAttempts} lần thi`
                        : `Đã thi ${attemptsUsed} lần`}
                    </Text>
                  </View>
                )}
              </View>
            );
          })()}
        </View>
      </View>

      {/* Action buttons */}
      {!item.isParent && (
        <View style={{ marginTop: 12, flexDirection: "row", gap: 8 }}>
          {/* BTVN: chưa nộp → 1 nút Nộp bài */}
          {!isExam && item.submissionStatus === "pending" && (
            <TouchableOpacity
              style={[styles.actionBtn, { flex: 1, backgroundColor: colors.primary, borderRadius: colors.radius }]}
              onPress={() => onSubmit(item)}
              activeOpacity={0.8}
            >
              <Feather name="send" size={13} color="#fff" />
              <Text style={[styles.actionBtnText, { color: "#fff" }]}>Nộp bài</Text>
            </TouchableOpacity>
          )}


          {/* Bài kiểm tra: nút làm bài (chưa nộp) */}
          {isExam && !!item.examId && !isExamSubmitted && (
            <TouchableOpacity
              style={[styles.actionBtn, {
                flex: 1,
                backgroundColor: "#be185d",
                borderRadius: colors.radius,
              }]}
              onPress={() => { Haptics.selectionAsync(); onStartExam(item); }}
              activeOpacity={0.8}
            >
              <Feather name="book-open" size={13} color="#fff" />
              <Text style={[styles.actionBtnText, { color: "#fff" }]}>Làm bài kiểm tra</Text>
            </TouchableOpacity>
          )}

          {/* Bài kiểm tra đã nộp: pill row */}
          {isExam && isExamSubmitted && (
            <>
              {!!item.examId && (
                <TouchableOpacity
                  onPress={() => { Haptics.selectionAsync(); onStartExam(item); }}
                  activeOpacity={0.8}
                  style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#fdf2f8", borderWidth: 1, borderColor: "#f9a8d4", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 }}
                >
                  <Feather name="book-open" size={12} color="#be185d" />
                  <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#be185d" }}>Làm lại</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={() => { Haptics.selectionAsync(); setResultPopupVisible(true); }}
                activeOpacity={0.8}
                style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.primary, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 }}
              >
                <Feather name="eye" size={12} color="#fff" />
                <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#fff" }}>Xem kết quả</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}
    </View>
  );
}

export default function HomeworkScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const topPad = insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : 0;

  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const [rows, setRows] = useState<AssignmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const currentPageRef = useRef(1);
  const loadingMoreRef = useRef(false);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [submitItem, setSubmitItem] = useState<AssignmentRow | null>(null);

  // ── Exam state ──────────────────────────────────────────────────────────────
  const [examIntroVisible, setExamIntroVisible] = useState(false);
  const [examIntroLoading, setExamIntroLoading] = useState(false);
  const [examMeta, setExamMeta] = useState<ExamMeta | null>(null);
  const [selectedExamItem, setSelectedExamItem] = useState<AssignmentRow | null>(null);
  const [examTakingVisible, setExamTakingVisible] = useState(false);
  const [examData, setExamData] = useState<ExamData | null>(null);

  const { date: deepLinkDate, classId: deepLinkClassId } = useLocalSearchParams<{ date?: string; classId?: string }>();
  const [activeHighlightDate, setActiveHighlightDate] = useState<string | null>(null);
  const [activeHighlightClassId, setActiveHighlightClassId] = useState<string | null>(null);
  const hwScrollRef = useRef<ScrollView>(null);
  const isAutoScrollingRef = useRef(false);

  const monthKey = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}`;

  const fetchAssignments = useCallback(async (silent = false, page = 1) => {
    if (page === 1) {
      if (!silent) setLoading(true);
      setFetchError(null);
      setHasMore(false);
      currentPageRef.current = 1;
    } else {
      setLoadingMore(true);
    }
    try {
      const data = await apiGet<AssignmentResponse>(
        `/api/mobile/student/assignments?month=${monthKey}&page=${page}&pageSize=50`
      );
      const newRows = data.rows || [];
      if (page === 1) {
        setRows(newRows);
      } else {
        setRows(prev => [...prev, ...newRows]);
      }
      currentPageRef.current = page;
      const tp = data.totalPages ?? 1;
      setHasMore(page < tp);
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      if (status === 401 || status === 403) {
        clearSession();
        router.replace("/login");
        return;
      }
      if (page === 1) {
        setRows([]);
        if (status) {
          setFetchError(`Không thể tải bài tập (lỗi ${status}). Kéo xuống để thử lại.`);
        } else {
          setFetchError("Không thể kết nối đến máy chủ. Kiểm tra mạng và thử lại.");
        }
      }
    } finally {
      if (page === 1) {
        setLoading(false);
      } else {
        setLoadingMore(false);
        loadingMoreRef.current = false;
      }
    }
  }, [monthKey]);

  const loadMore = useCallback(() => {
    if (loadingMoreRef.current || !hasMore || loading) return;
    loadingMoreRef.current = true;
    fetchAssignments(true, currentPageRef.current + 1);
  }, [hasMore, loading, fetchAssignments]);

  useEffect(() => { fetchAssignments(); }, [monthKey]);

  useEffect(() => {
    if (!deepLinkDate) return;
    const d = new Date(deepLinkDate + "T00:00:00");
    if (!isNaN(d.getTime())) {
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
    }
    setActiveHighlightDate(deepLinkDate.slice(0, 10));
  }, [deepLinkDate]);

  useEffect(() => {
    if (deepLinkClassId) setActiveHighlightClassId(deepLinkClassId);
  }, [deepLinkClassId]);

  useFocusEffect(
    useCallback(() => {
      const dl = popAssignmentsDeeplink();
      if (dl?.date) {
        const d = new Date(dl.date + "T00:00:00");
        if (!isNaN(d.getTime())) {
          setViewYear(d.getFullYear());
          setViewMonth(d.getMonth());
        }
        setActiveHighlightDate(dl.date.slice(0, 10));
      }
      if (dl?.classId) setActiveHighlightClassId(dl.classId);
      fetchAssignments(true);
      return () => {
        setActiveHighlightDate(null);
        setActiveHighlightClassId(null);
      };
    }, [fetchAssignments])
  );

  const handleGroupHighlightLayout = useCallback((y: number) => {
    isAutoScrollingRef.current = true;
    setTimeout(() => {
      hwScrollRef.current?.scrollTo({ y: Math.max(0, y - 60), animated: true });
      setTimeout(() => { isAutoScrollingRef.current = false; }, 800);
    }, 350);
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAssignments(true);
    setRefreshing(false);
  };

  const goMonth = (delta: number) => {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    setViewMonth(m);
    setViewYear(y);
    Haptics.selectionAsync();
  };

  const handleSubmitted = (homeworkId: string, content: string, attachments: { name: string; url: string }[]) => {
    setRows(prev => prev.map(r =>
      r.homeworkId === homeworkId
        ? { ...r, submissionStatus: "submitted", submissionContent: content, submissionAttachments: attachments as any }
        : r
    ));
  };

  // ── Exam handlers ────────────────────────────────────────────────────────────
  const handleViewExamResult = useCallback((item: AssignmentRow) => {
    Haptics.selectionAsync();
    Alert.alert(
      "Kết quả bài kiểm tra",
      item.score != null
        ? `Điểm: ${item.score}${item.comment ? `\n\nNhận xét: ${item.comment}` : ""}`
        : "Bài đã nộp, chờ giáo viên chấm điểm."
    );
  }, []);

  const handleStartExam = useCallback(async (item: AssignmentRow) => {
    if (!item.examId) return;
    setSelectedExamItem(item);
    setExamIntroLoading(true);
    setExamIntroVisible(true);
    try {
      const [examDetail, attemptData] = await Promise.all([
        apiGet<WebExamMeta>(`/api/exams/${item.examId}`),
        apiGet<AttemptCountResponse>(
          `/api/mobile/student/exam/${item.examId}/attempt-count${item.classId ? `?classId=${item.classId}` : ""}`
        ),
      ]);
      setExamMeta({
        examId: item.examId,
        title: examDetail.name,
        description: examDetail.description ?? null,
        timeLimitMinutes: examDetail.timeLimitMinutes ?? null,
        maxAttempts: examDetail.maxAttempts ?? null,
        attemptCount: attemptData.count,
        questionCount: null,
      });
      // Store minimal exam info; sections are loaded later in handleBeginExam
      setExamData({
        id: examDetail.id,
        name: examDetail.name,
        timeLimitMinutes: examDetail.timeLimitMinutes ?? null,
        sections: [],
      });
    } catch {
      Alert.alert("Lỗi", "Không thể tải thông tin bài kiểm tra. Vui lòng thử lại.");
      setExamIntroVisible(false);
    } finally {
      setExamIntroLoading(false);
    }
  }, []);

  const handleBeginExam = useCallback(async () => {
    if (!examData?.id) return;
    setExamIntroLoading(true);
    try {
      // GET /api/exams/:examId/preview → array of sections with full questions
      const sections = await apiGet<ExamSection[]>(`/api/exams/${examData.id}/preview`);
      if (!sections || sections.length === 0) {
        Alert.alert("Thông báo", "Bài kiểm tra chưa có nội dung câu hỏi.");
        return;
      }
      const totalQ = sections.reduce((sum, s) => sum + s.questions.length, 0);
      setExamMeta((prev) => prev ? { ...prev, questionCount: totalQ } : prev);
      setExamData((prev) => prev ? { ...prev, sections } : prev);
      setExamIntroVisible(false);
      setTimeout(() => setExamTakingVisible(true), 320);
    } catch {
      Alert.alert("Lỗi", "Không thể tải câu hỏi bài kiểm tra. Vui lòng thử lại.");
    } finally {
      setExamIntroLoading(false);
    }
  }, [examData]);

  const handleExamSubmit = useCallback(async (payload: ExamSubmitPayload) => {
    if (!selectedExamItem?.examId) {
      Alert.alert("Lỗi", "Không tìm thấy thông tin bài kiểm tra.");
      return;
    }
    if (!selectedExamItem.classId) {
      Alert.alert("Lỗi", "Không tìm thấy lớp học. Vui lòng thoát và thử lại.");
      return;
    }
    const now = new Date().toISOString();
    const { data } = await apiPost<{ id: string }>("/api/exam-submissions", {
      examId: selectedExamItem.examId,
      classId: selectedExamItem.classId,
      answers: payload.answers,
      score: payload.score,
      partScores: payload.partScores,
      timeTakenSeconds: payload.timeTakenSeconds,
      submittedAt: now,
    });
    setRows(prev => prev.map(r =>
      r.examId === selectedExamItem.examId && r.classId === selectedExamItem.classId
        ? { ...r, submissionStatus: "submitted", submittedAt: now }
        : r
    ));
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [selectedExamItem]);

  // Deeplink cũ hoặc payload backend không đồng nhất có thể gửi classId không
  // khớp với các dòng assignment. Khi đó giữ đúng tháng/ngày nhưng bỏ riêng
  // bộ lọc lớp, thay vì báo rỗng dù API đã trả bài tập.
  const hasHighlightedClass = !!activeHighlightClassId
    && rows.some(r => r.classId === activeHighlightClassId);
  const filtered = rows.filter(r => {
    if (hasHighlightedClass && r.classId !== activeHighlightClassId) return false;
    if (filter === "BTVN") return r.itemType === "BTVN";
    if (filter === "exam") return r.itemType === "Bài kiểm tra";
    if (filter === "pending") return r.submissionStatus === "pending";
    if (filter === "submitted") return r.submissionStatus === "submitted" || r.submissionStatus === "graded";
    return true;
  });

  const totalBTVN = rows.filter(r => r.itemType === "BTVN").length;
  const doneBTVN = rows.filter(r => r.itemType === "BTVN" && (r.submissionStatus === "submitted" || r.submissionStatus === "graded")).length;
  const progress = totalBTVN > 0 ? doneBTVN / totalBTVN : 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.gradientStart }]}
      >
        <View style={styles.monthNav}>
          <TouchableOpacity onPress={() => goMonth(-1)} style={styles.navBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="chevron-left" size={22} color="#1e1b4b" />
          </TouchableOpacity>
          <Text style={styles.monthTitle}>{MONTH_NAMES[viewMonth]}, {viewYear}</Text>
          <TouchableOpacity onPress={() => goMonth(1)} style={styles.navBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="chevron-right" size={22} color="#1e1b4b" />
          </TouchableOpacity>
        </View>

        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ color: "rgba(30,27,75,0.75)", fontSize: 13, fontFamily: "Inter_500Medium" }}>
              {doneBTVN}/{totalBTVN} BTVN đã nộp
            </Text>
            <Text style={{ color: "rgba(30,27,75,0.6)", fontSize: 13, fontFamily: "Inter_400Regular" }}>
              {rows.filter(r => r.itemType === "Bài kiểm tra").length} bài kiểm tra
            </Text>
          </View>
          <View style={{ height: 6, backgroundColor: "rgba(30,27,75,0.15)", borderRadius: 3, overflow: "hidden" }}>
            <View style={{ height: "100%", width: `${progress * 100}%`, backgroundColor: "#1e1b4b", borderRadius: 3 }} />
          </View>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.filterScroll, { borderBottomColor: colors.border }]} contentContainerStyle={styles.filterContent}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f.key}
            onPress={() => { setFilter(f.key); Haptics.selectionAsync(); }}
            style={[styles.filterBtn, {
              backgroundColor: filter === f.key ? colors.primary : colors.card,
              borderColor: filter === f.key ? colors.primary : colors.border,
              borderRadius: 20,
            }]}
          >
            <Text style={[styles.filterText, { color: filter === f.key ? "#fff" : colors.mutedForeground }]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        ref={hwScrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 + bottomPad, gap: 12 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} progressBackgroundColor={colors.card} />}
        onScroll={(e) => {
          if (activeHighlightDate && !isAutoScrollingRef.current) setActiveHighlightDate(null);
          const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
          if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 200) {
            loadMore();
          }
        }}
        scrollEventThrottle={200}
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 13, marginTop: 10 }}>Đang tải bài tập...</Text>
          </View>
        ) : fetchError ? (
          <View style={styles.center}>
            <Feather name="wifi-off" size={48} color={colors.destructive} />
            <Text style={{ color: colors.destructive, fontFamily: "Inter_600SemiBold", fontSize: 15, marginTop: 12, textAlign: "center" }}>
              Lỗi tải dữ liệu
            </Text>
            <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 13, marginTop: 6, textAlign: "center", paddingHorizontal: 20, lineHeight: 20 }}>
              {fetchError}
            </Text>
            <TouchableOpacity
              onPress={() => fetchAssignments()}
              style={{ marginTop: 16, backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20 }}
            >
              <Text style={{ color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14 }}>Thử lại</Text>
            </TouchableOpacity>
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.center}>
            <Feather name="book-open" size={48} color={colors.mutedForeground} />
            <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_500Medium", fontSize: 15, marginTop: 10 }}>Không có bài tập</Text>
            <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 13, marginTop: 4 }}>Tháng này chưa có bài tập nào</Text>
          </View>
        ) : (
          (() => {
            const groups: { dateKey: string; items: typeof filtered }[] = [];
            const seen = new Map<string, typeof filtered>();
            for (const item of filtered) {
              const key = hwGetDateKey(item.sessionDate || "");
              if (!seen.has(key)) { seen.set(key, []); groups.push({ dateKey: key, items: seen.get(key)! }); }
              seen.get(key)!.push(item);
            }
            return groups.map(({ dateKey, items: groupItems }) => {
              const isHighlightedGroup = !!activeHighlightDate && dateKey === activeHighlightDate;
              return (
              <View
                key={dateKey}
                onLayout={isHighlightedGroup ? (e) => handleGroupHighlightLayout(e.nativeEvent.layout.y) : undefined}
                style={isHighlightedGroup ? {
                  borderWidth: 1.5,
                  borderColor: colors.primary,
                  borderRadius: 12,
                  padding: 10,
                  backgroundColor: colors.primary + "08",
                } : undefined}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10, marginTop: 4 }}>
                  <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: isHighlightedGroup ? colors.primary : "#7c3aed" }}>
                    {hwFormatTimelineDate(dateKey)}
                  </Text>
                  <View style={{ backgroundColor: isHighlightedGroup ? colors.primary + "20" : "#7c3aed18", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 }}>
                    <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: isHighlightedGroup ? colors.primary : "#7c3aed" }}>
                      {groupItems.length} bài
                    </Text>
                  </View>
                </View>
                {groupItems.map((item, i) => (
                  <AssignmentCard
                    key={`${item.itemType}-${item.homeworkId || item.examId || item.classSessionId}-${i}`}
                    item={item}
                    colors={colors}
                    onSubmit={(it) => { setSubmitItem(it); Haptics.selectionAsync(); }}
                    onStartExam={handleStartExam}
                    onViewExamResult={handleViewExamResult}
                  />
                ))}
              </View>
              );
            });
          })()
        )}
        {loadingMore && (
          <View style={{ paddingVertical: 20, alignItems: "center" }}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 6, fontFamily: "Inter_400Regular" }}>
              Đang tải thêm...
            </Text>
          </View>
        )}
        {!loading && !loadingMore && !hasMore && rows.length > 0 && (
          <Text style={{ textAlign: "center", color: colors.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular", paddingVertical: 12 }}>
            Đã hiển thị tất cả {rows.length} bài
          </Text>
        )}
      </ScrollView>

      <SubmitModal
        visible={submitItem !== null}
        assignment={submitItem}
        onClose={() => setSubmitItem(null)}
        onSubmitted={handleSubmitted}
        colors={colors}
      />

      {/* ── Exam Intro Modal ── */}
      <ExamIntroModal
        visible={examIntroVisible}
        meta={examMeta}
        loading={examIntroLoading}
        onClose={() => { setExamIntroVisible(false); }}
        onStart={handleBeginExam}
      />

      {/* ── Exam Taking Screen ── */}
      <ExamTakingScreen
        visible={examTakingVisible}
        exam={examData}
        onClose={() => { setExamTakingVisible(false); }}
        onSubmit={handleExamSubmit}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 14,
  },
  monthNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  navBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    backgroundColor: "rgba(30,27,75,0.1)",
  },
  monthTitle: {
    color: "#1e1b4b",
    fontSize: 17,
    fontFamily: "Inter_700Bold",
  },
  filterScroll: {
    maxHeight: 52,
    borderBottomWidth: 1,
  },
  filterContent: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    flexDirection: "row",
  },
  filterBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1,
  },
  filterText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  center: {
    alignItems: "center",
    paddingVertical: 60,
  },
  card: {
    padding: 14,
    marginBottom: 10,
    // boxShadow (not legacy shadow*/elevation) so Android's Fabric renderer clips the
    // shadow to borderRadius instead of drawing a detached box past the left accent border.
    boxShadow: "0px 3px 10px rgba(0,0,0,0.07)",
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
  },
  actionBtnText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
});
