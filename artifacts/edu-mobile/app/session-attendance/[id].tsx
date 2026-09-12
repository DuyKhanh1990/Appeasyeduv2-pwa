import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  ActivityIndicator,
  Animated,
  Modal,
  Platform,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "@/hooks/useSafeAreaInsets";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import { apiGet, apiPost, apiPatch } from "@/lib/api";
import {
  HomeworkRichEditor,
  HomeworkRichEditorHandle,
} from "@/components/HomeworkRichEditor";
import { HtmlText } from "@/components/HtmlText";

type AttendanceStatus = "pending" | "present" | "absent" | "makeup_wait" | "makeup_done" | "paused";

/** Strip HTML tags for display in plain TextInput fields */
function stripHtmlForInput(html: string): string {
  return html
    .replace(/<\/?(p|div|h[1-6]|li|ul|ol|blockquote)[^>]*>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Extract all image src URLs from HTML */
function extractImageUrls(html: string): string[] {
  if (!html) return [];
  return [...html.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1]);
}


interface StudentSession {
  studentSessionId: string;
  studentId: string;
  studentName: string;
  studentCode: string;
  attendanceStatus: AttendanceStatus;
  attendanceNote: string;
  sessionOrder: number;
  hasReview: boolean;
  reviewPublished: boolean;
}

const STATUS_CONFIG: Record<AttendanceStatus, { label: string; color: string; icon: string }> = {
  pending:     { label: "Chưa điểm danh", color: "#94a3b8", icon: "circle" },
  present:     { label: "Có học",         color: "#10b981", icon: "check-circle" },
  absent:      { label: "Nghỉ học",       color: "#ef4444", icon: "x-circle" },
  makeup_wait: { label: "Chờ bù",         color: "#f97316", icon: "clock" },
  makeup_done: { label: "Đã bù",          color: "#8b5cf6", icon: "check-square" },
  paused:      { label: "Bảo lưu",        color: "#64748b", icon: "pause-circle" },
};

const AVATAR_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f97316",
  "#10b981", "#0ea5e9", "#f59e0b", "#14b8a6",
];

function avatarColor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(name: string) {
  const parts = name.trim().split(" ");
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function AttendancePickerModal({ student, onClose, onSave, colors }: {
  student: StudentSession;
  onClose: () => void;
  onSave: (studentSessionId: string, status: AttendanceStatus) => void;
  colors: any;
}) {
  const insets = useSafeAreaInsets();
  const [selectedStatus, setSelectedStatus] = useState<AttendanceStatus>(student.attendanceStatus);
  const statuses: AttendanceStatus[] = ["present", "absent", "makeup_wait", "makeup_done", "paused", "pending"];

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
          <TouchableWithoutFeedback>
            <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: insets.bottom + 16 }}>
              <View style={{ alignItems: "center", paddingTop: 12, paddingBottom: 4 }}>
                <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
              </View>
              <View style={{ paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: colors.foreground }}>Điểm danh học viên</Text>
                <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 2 }}>
                  {student.studentName} · {student.studentCode}
                </Text>
              </View>
              <View style={{ paddingHorizontal: 16, paddingTop: 14, gap: 8 }}>
                {statuses.map((s) => {
                  const cfg = STATUS_CONFIG[s];
                  const isSelected = selectedStatus === s;
                  return (
                    <TouchableOpacity
                      key={s}
                      activeOpacity={0.7}
                      onPress={() => { setSelectedStatus(s); Haptics.selectionAsync(); }}
                      style={{
                        flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 12,
                        backgroundColor: isSelected ? cfg.color + "15" : colors.muted,
                        borderWidth: 1.5, borderColor: isSelected ? cfg.color + "60" : colors.border,
                      }}
                    >
                      <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: cfg.color + "18", alignItems: "center", justifyContent: "center" }}>
                        <Feather name={cfg.icon as any} size={16} color={cfg.color} />
                      </View>
                      <Text style={{ flex: 1, fontSize: 14, fontFamily: isSelected ? "Inter_600SemiBold" : "Inter_400Regular", color: isSelected ? cfg.color : colors.foreground }}>
                        {cfg.label}
                      </Text>
                      {isSelected && <Feather name="check" size={16} color={cfg.color} />}
                    </TouchableOpacity>
                  );
                })}
              </View>
              <View style={{ paddingHorizontal: 16, paddingTop: 14 }}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => { onSave(student.studentSessionId, selectedStatus); onClose(); }}
                  style={{ backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 14, alignItems: "center" }}
                >
                  <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" }}>Lưu điểm danh</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

function NoteModal({ student, onClose, onSave, colors }: {
  student: StudentSession;
  onClose: () => void;
  onSave: (studentSessionId: string, note: string) => void;
  colors: any;
}) {
  const insets = useSafeAreaInsets();
  const [note, setNote] = useState(student.attendanceNote);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
          <TouchableWithoutFeedback>
            <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: insets.bottom + 16 }}>
              <View style={{ alignItems: "center", paddingTop: 12, paddingBottom: 4 }}>
                <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
              </View>
              <View style={{ paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: avatarColor(student.studentId), alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold", color: "#fff" }}>{getInitials(student.studentName)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: colors.foreground }}>Ghi chú</Text>
                  <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>{student.studentName} · {student.studentCode}</Text>
                </View>
              </View>
              <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
                <TextInput
                  value={note}
                  onChangeText={setNote}
                  placeholder="Nhập ghi chú cho học viên này..."
                  placeholderTextColor={colors.mutedForeground}
                  multiline
                  numberOfLines={4}
                  autoFocus
                  style={{
                    backgroundColor: colors.muted, borderRadius: 12, padding: 14,
                    fontSize: 14, fontFamily: "Inter_400Regular", color: colors.foreground,
                    minHeight: 110, textAlignVertical: "top",
                    borderWidth: 1, borderColor: colors.border,
                  }}
                />
              </View>
              <View style={{ paddingHorizontal: 16, paddingTop: 14 }}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => { onSave(student.studentSessionId, note); onClose(); }}
                  style={{ backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 14, alignItems: "center" }}
                >
                  <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" }}>Lưu ghi chú</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

function BulkAttendanceModal({ count, onClose, onSave, colors }: {
  count: number;
  onClose: () => void;
  onSave: (status: AttendanceStatus) => void;
  colors: any;
}) {
  const insets = useSafeAreaInsets();
  const statuses: AttendanceStatus[] = ["present", "absent", "makeup_wait", "makeup_done", "paused", "pending"];
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
          <TouchableWithoutFeedback>
            <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: insets.bottom + 16 }}>
              <View style={{ alignItems: "center", paddingTop: 12, paddingBottom: 4 }}>
                <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
              </View>
              <View style={{ paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: colors.foreground }}>Điểm danh {count} học viên</Text>
                <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 2 }}>Chọn trạng thái áp dụng cho tất cả</Text>
              </View>
              <View style={{ paddingHorizontal: 16, paddingTop: 14, gap: 8 }}>
                {statuses.map((s) => {
                  const cfg = STATUS_CONFIG[s];
                  return (
                    <TouchableOpacity
                      key={s}
                      activeOpacity={0.7}
                      onPress={() => { onSave(s); onClose(); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); }}
                      style={{
                        flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 12,
                        backgroundColor: cfg.color + "12", borderWidth: 1, borderColor: cfg.color + "40",
                      }}
                    >
                      <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: cfg.color + "20", alignItems: "center", justifyContent: "center" }}>
                        <Feather name={cfg.icon as any} size={16} color={cfg.color} />
                      </View>
                      <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: cfg.color }}>{cfg.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

interface EvaluationSubCriteria { id: string; name: string }
interface EvaluationCriteria { id: string; name: string; subCriteria: EvaluationSubCriteria[] }
interface SessionTeacher { id: string; fullName: string }

function StarRating({ value, onChange, color }: { value: number; onChange: (v: number) => void; color: string }) {
  return (
    <View style={{ flexDirection: "row", gap: 4 }}>
      {[1, 2, 3, 4, 5].map((star) => (
        <TouchableOpacity key={star} onPress={() => { onChange(star); Haptics.selectionAsync(); }} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}>
          <Feather name={star <= value ? "star" : "star"} size={22} color={star <= value ? color : "#d1d5db"} />
        </TouchableOpacity>
      ))}
    </View>
  );
}

function ReviewModal({ student, sessionId, onClose, onSave, colors, cachedReviewData }: {
  student: StudentSession;
  sessionId: string;
  onClose: () => void;
  onSave: (studentSessionId: string, reviewData: Record<string, unknown>, publish: boolean) => void;
  cachedReviewData?: { reviewData: Record<string, unknown>; published: boolean } | null;
  colors: any;
}) {
  const { height: screenH } = useWindowDimensions();
  const bodyMaxH = screenH * 0.9 - 318;
  const { user } = useAuth();
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [teachers, setTeachers] = useState<SessionTeacher[]>([]);
  const [criteria, setCriteria] = useState<EvaluationCriteria[]>([]);
  const [activeTeacherIdx, setActiveTeacherIdx] = useState(0);
  const [publish, setPublish] = useState(true);
  const [scores, setScores] = useState<Record<string, Record<string, number>>>({});
  // Stores raw HTML per teacherId -> fieldKey
  const [subHtml, setSubHtml] = useState<Record<string, Record<string, string>>>({});
  // Which criterion is expanded inline for editing
  const [expandedField, setExpandedField] = useState<{ fieldKey: string; label: string } | null>(null);
  const criterionEditorRef = useRef<HomeworkRichEditorHandle>(null);

  useEffect(() => {
    Promise.all([
      apiGet<{ teachers: SessionTeacher[]; evaluationCriteriaIds: string[] }>(`/api/mobile/staff/calendar/session/${sessionId}`),
      apiGet<EvaluationCriteria[]>("/api/evaluation-criteria"),
    ])
      .then(async ([detail, allCriteria]) => {
        const detailTeachers = detail.teachers ?? [];
        const criteriaIds: string[] = detail.evaluationCriteriaIds ?? [];
        const filtered = allCriteria.filter((c) => criteriaIds.includes(c.id));
        setTeachers(detailTeachers);
        setCriteria(filtered);

        const fallbackId = user?.id ?? "__noauth__";
        const tIds: string[] = detailTeachers.length > 0 ? detailTeachers.map((t) => t.id) : [fallbackId];
        const initScores: Record<string, Record<string, number>> = {};
        const initHtml: Record<string, Record<string, string>> = {};
        for (const tid of tIds) { initScores[tid] = {}; initHtml[tid] = {}; }

        const applyReviewData = (rawData: Record<string, any>, publishedVal: boolean) => {
          for (const tid of tIds) {
            const saved: any = rawData[tid] ?? {};
            const newScores: Record<string, number> = {};
            const newHtml: Record<string, string> = {};
            if (Array.isArray(saved.items)) {
              for (const item of saved.items) {
                const commentKey = item.subCriteriaId || item.criteriaId;
                if (!commentKey) continue;
                // Store raw HTML — used as initialHtml by the inline HomeworkRichEditor
                if (item.comment !== undefined) newHtml[commentKey] = String(item.comment);
              }
              if (saved.criteriaRatings && typeof saved.criteriaRatings === "object") {
                for (const [cId, score] of Object.entries(saved.criteriaRatings)) {
                  newScores[cId] = Number(score);
                }
              } else {
                for (const item of saved.items) {
                  if (item.criteriaId && item.score !== undefined && item.score !== null && !newScores[item.criteriaId]) {
                    newScores[item.criteriaId] = Number(item.score);
                  }
                }
              }
            } else if (saved.subNotes && typeof saved.subNotes === "object") {
              for (const [k, v] of Object.entries(saved.subNotes)) {
                newHtml[k] = String(v ?? "");
              }
              if (saved.scores && typeof saved.scores === "object") Object.assign(newScores, saved.scores);
            }
            initScores[tid] = newScores;
            initHtml[tid] = newHtml;
          }
          setPublish(publishedVal);
        };

        if (cachedReviewData) {
          applyReviewData(cachedReviewData.reviewData as Record<string, any>, cachedReviewData.published);
        } else {
          try {
            const existing = await apiGet<{ hasReview: boolean; reviewPublished: boolean; reviewData: Record<string, unknown> }>(
              `/api/student-sessions/${student.studentSessionId}/review`
            );
            const rawData = (existing.reviewData && typeof existing.reviewData === "object" && !Array.isArray(existing.reviewData))
              ? existing.reviewData as Record<string, any>
              : {};
            applyReviewData(rawData, existing.reviewPublished ?? true);
          } catch {
          }
        }

        setScores(initScores);
        setSubHtml(initHtml);
      })
      .catch(() => {})
      .finally(() => setLoadingMeta(false));
  }, [sessionId, student.studentSessionId, student.hasReview]);

  const teacherList: SessionTeacher[] = teachers.length > 0 ? teachers : [{ id: user?.id ?? "__noauth__", fullName: user?.name ?? "Giáo viên" }];
  const activeTeacher = teacherList[activeTeacherIdx] ?? teacherList[0];
  const activeScores = scores[activeTeacher?.id] ?? {};
  const activeHtml = subHtml[activeTeacher?.id] ?? {};

  const setScore = (teacherId: string, subId: string, val: number) => {
    setScores((prev) => ({ ...prev, [teacherId]: { ...prev[teacherId], [subId]: val } }));
  };

  const saveFieldHtml = useCallback((teacherId: string, fieldKey: string, html: string) => {
    setSubHtml((prev) => ({
      ...prev,
      [teacherId]: { ...(prev[teacherId] ?? {}), [fieldKey]: html },
    }));
  }, []);

  const clearFieldHtml = useCallback((teacherId: string, fieldKey: string) => {
    setSubHtml((prev) => ({
      ...prev,
      [teacherId]: { ...(prev[teacherId] ?? {}), [fieldKey]: "" },
    }));
  }, []);

  /** Flush the inline editor's current HTML into state before switching fields/teachers. */
  const commitExpandedField = useCallback(() => {
    if (expandedField && criterionEditorRef.current) {
      const html = criterionEditorRef.current.getContent();
      setSubHtml((prev) => ({
        ...prev,
        [activeTeacher?.id ?? ""]: {
          ...(prev[activeTeacher?.id ?? ""] ?? {}),
          [expandedField.fieldKey]: html,
        },
      }));
    }
  }, [expandedField, activeTeacher?.id]);

  const buildReviewData = () => {
    const data: Record<string, unknown> = {};
    for (const t of teacherList) {
      const items: Record<string, unknown>[] = [];

      if (criteria.length === 0) {
        const generalHtml = subHtml[t.id]?.["__general__"] ?? "";
        if (generalHtml) {
          items.push({ criteriaId: "__general__", criteriaName: "Nhận xét chung", comment: generalHtml, score: 0 });
        }
      } else {
        for (const c of criteria) {
          if (c.subCriteria.length === 0) {
            items.push({
              criteriaId: c.id,
              criteriaName: c.name,
              comment: subHtml[t.id]?.[c.id] ?? "",
              score: scores[t.id]?.[c.id] ?? 0,
            });
          } else {
            for (const sc of c.subCriteria) {
              items.push({
                criteriaId: c.id,
                criteriaName: c.name,
                subCriteriaId: sc.id,
                subCriteriaName: sc.name,
                comment: subHtml[t.id]?.[sc.id] ?? "",
                score: scores[t.id]?.[c.id] ?? 0,
              });
            }
          }
        }
      }

      const criteriaRatings: Record<string, number> = {};
      for (const c of criteria) {
        const s = scores[t.id]?.[c.id] ?? 0;
        if (s > 0) criteriaRatings[c.id] = s;
      }

      data[t.id] = { teacherName: t.fullName, items, criteriaRatings };
    }
    return data;
  };

  const insets = useSafeAreaInsets();

  // Inline editable field for a single criteria/sub-criteria
  const renderFieldCard = (fieldKey: string, label: string, _isSubCriteria = false) => {
    const isExpanded = expandedField?.fieldKey === fieldKey;
    const html = activeHtml[fieldKey] ?? "";
    const hasContent = html.trim().length > 0;

    if (isExpanded) {
      return (
        <View
          key={fieldKey}
          style={{
            borderRadius: 12,
            borderWidth: 1.5,
            borderColor: "#8b5cf680",
            overflow: "hidden",
            backgroundColor: colors.muted,
          }}
        >
          {/* Inline editor — grows with content (expandable=true) */}
          <HomeworkRichEditor
            key={`${activeTeacher.id}-${fieldKey}`}
            ref={criterionEditorRef}
            initialHtml={html}
            expandable
          />
          {/* Confirm / collapse row */}
          <TouchableOpacity
            onPress={() => {
              commitExpandedField();
              setExpandedField(null);
              Haptics.selectionAsync();
            }}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              paddingVertical: 10,
              borderTopWidth: 1,
              borderTopColor: colors.border,
              backgroundColor: "#8b5cf608",
            }}
          >
            <Feather name="check" size={14} color="#8b5cf6" />
            <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#8b5cf6" }}>Xong</Text>
          </TouchableOpacity>
        </View>
      );
    }

    // Collapsed preview card — tap to expand inline
    return (
      <TouchableOpacity
        key={fieldKey}
        activeOpacity={0.75}
        onPress={() => {
          // commit any currently open field first
          commitExpandedField();
          setExpandedField({ fieldKey, label });
          Haptics.selectionAsync();
        }}
        style={{
          backgroundColor: colors.muted,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: hasContent ? "#8b5cf640" : colors.border,
          overflow: "hidden",
        }}
      >
        <View style={{ paddingHorizontal: 12, paddingTop: 10, paddingBottom: 10 }}>
          {hasContent ? (
            <HtmlText
              html={html}
              style={{ fontSize: 13, color: colors.foreground, lineHeight: 20 } as any}
              compactImages
            />
          ) : (
            <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, fontStyle: "italic" }}>
              {`Nhận xét ${label.toLowerCase()}...`}
            </Text>
          )}
        </View>
        <View style={{ paddingHorizontal: 12, paddingBottom: 8, alignItems: "flex-end" }}>
          <Feather name="edit-2" size={13} color={hasContent ? "#8b5cf6" : colors.mutedForeground} />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {/* Header */}
        <View style={{ paddingTop: insets.top + 12, paddingBottom: 12, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.card }}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.muted, alignItems: "center", justifyContent: "center", marginRight: 4 }}>
            <Feather name="arrow-left" size={18} color={colors.foreground} />
          </TouchableOpacity>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: avatarColor(student.studentId), alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold", color: "#fff" }}>{getInitials(student.studentName)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: colors.foreground }}>{student.studentName}</Text>
            <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>{student.studentCode}</Text>
          </View>
          {student.hasReview && (
            <View style={{ backgroundColor: "#8b5cf618", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 }}>
              <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: "#8b5cf6" }}>{student.reviewPublished ? "Đã đăng" : "Nháp"}</Text>
            </View>
          )}
        </View>

        {loadingMeta ? (
          <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 40 }}>
            <ActivityIndicator size="small" color="#8b5cf6" />
            <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 13, marginTop: 10 }}>Đang tải tiêu chí...</Text>
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            {/* Teacher tabs */}
            {teacherList.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ borderBottomWidth: 1, borderBottomColor: colors.border, flexGrow: 0 }} contentContainerStyle={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 8, gap: 6 }}>
                {teacherList.map((t, idx) => (
                  <TouchableOpacity
                    key={t.id}
                    onPress={() => {
                      commitExpandedField();
                      setExpandedField(null);
                      setActiveTeacherIdx(idx);
                      Haptics.selectionAsync();
                    }}
                    style={{ alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: idx === activeTeacherIdx ? "#8b5cf618" : colors.muted, borderWidth: 1, borderColor: idx === activeTeacherIdx ? "#8b5cf640" : colors.border }}
                  >
                    <Text style={{ fontSize: 12, fontFamily: idx === activeTeacherIdx ? "Inter_600SemiBold" : "Inter_400Regular", color: idx === activeTeacherIdx ? "#8b5cf6" : colors.mutedForeground }}>
                      {t.fullName}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
              <View style={{ paddingHorizontal: 16, paddingTop: 14, gap: 16 }}>
                {criteria.length > 0 ? criteria.map((c) => (
                  <View key={c.id}>
                    {/* Criteria group header: bold name + star rating */}
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                      <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold", color: colors.foreground }}>{c.name}</Text>
                      <StarRating value={activeScores[c.id] ?? 0} onChange={(v) => setScore(activeTeacher.id, c.id, v)} color="#8b5cf6" />
                    </View>
                    <View style={{ gap: 14 }}>
                      {c.subCriteria.length === 0
                        ? (
                          <View style={{ gap: 6 }}>
                            <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#f97316" }}>{c.name}</Text>
                            {renderFieldCard(c.id, c.name, false)}
                          </View>
                        )
                        : c.subCriteria.map((sc) => (
                          <View key={sc.id} style={{ gap: 6 }}>
                            <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#f97316" }}>{sc.name}</Text>
                            {renderFieldCard(sc.id, sc.name, false)}
                          </View>
                        ))}
                    </View>
                  </View>
                )) : (
                  <View style={{ alignItems: "center", paddingVertical: 32, paddingHorizontal: 16, gap: 10 }}>
                    <Feather name="alert-circle" size={32} color="#f59e0b" />
                    <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.foreground, textAlign: "center" }}>
                      Lớp học chưa có tiêu chí đánh giá nào
                    </Text>
                    <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center", lineHeight: 20 }}>
                      Vui lòng thêm tiêu chí trong cài đặt lớp học.
                    </Text>
                  </View>
                )}
              </View>
            </ScrollView>

            {/* Publish switch + Save — only shown when criteria exist */}
            {criteria.length > 0 ? (
              <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: insets.bottom + 12, gap: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: colors.foreground }}>Công bố</Text>
                  <Switch value={publish} onValueChange={(v) => { setPublish(v); Haptics.selectionAsync(); }} trackColor={{ false: colors.border, true: "#8b5cf660" }} thumbColor={publish ? "#8b5cf6" : "#9ca3af"} />
                </View>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => {
                    commitExpandedField();
                    setExpandedField(null);
                    // Use a tiny timeout so state flush from commitExpandedField propagates
                    setTimeout(() => {
                      onSave(student.studentSessionId, buildReviewData(), publish);
                      onClose();
                    }, 0);
                  }}
                  style={{ backgroundColor: "#8b5cf6", borderRadius: 14, paddingVertical: 14, alignItems: "center" }}
                >
                  <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" }}>{publish ? "Đăng nhận xét" : "Lưu nháp"}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: insets.bottom + 12, borderTopWidth: 1, borderTopColor: colors.border }}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={onClose}
                  style={{ backgroundColor: colors.muted, borderRadius: 14, paddingVertical: 14, alignItems: "center" }}
                >
                  <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>Huỷ</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </View>

    </Modal>
  );
}

export default function SessionAttendanceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [students, setStudents] = useState<StudentSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attendanceTarget, setAttendanceTarget] = useState<StudentSession | null>(null);
  const [reviewTarget, setReviewTarget] = useState<StudentSession | null>(null);
  const [reviewCache, setReviewCache] = useState<Record<string, { reviewData: Record<string, unknown>; published: boolean }>>({});
  const [noteTarget, setNoteTarget] = useState<StudentSession | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [showBulkAll, setShowBulkAll] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastAnim = useRef(new Animated.Value(0)).current;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((err: any) => {
    const msg =
      err?.status === 403
        ? (err.serverMessage ?? "Vượt quá thời gian điểm danh cho phép.")
        : "Vượt quá thời gian điểm danh cho phép.";
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastMsg(msg);
    toastAnim.setValue(0);
    Animated.timing(toastAnim, { toValue: 1, duration: 250, useNativeDriver: true }).start();
    toastTimer.current = setTimeout(() => {
      Animated.timing(toastAnim, { toValue: 0, duration: 250, useNativeDriver: true }).start(() =>
        setToastMsg(null)
      );
    }, 4000);
  }, [toastAnim]);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(false);
    apiGet<StudentSession[]>(`/api/mobile/staff/calendar/session/${id}/students`)
      .then((res) => setStudents(Array.isArray(res) ? res : []))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [id]);

  const toggleSelect = useCallback((studentSessionId: string) => {
    Haptics.selectionAsync();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(studentSessionId)) next.delete(studentSessionId);
      else next.add(studentSessionId);
      return next;
    });
  }, []);

  const clearSelection = () => setSelected(new Set());

  const handleSaveAttendance = useCallback(async (studentSessionId: string, status: AttendanceStatus) => {
    setSaving(studentSessionId);
    // Capture previous state for rollback inside the updater (runs synchronously)
    let prevStudent: StudentSession | undefined;
    setStudents((prev) => {
      prevStudent = prev.find((s) => s.studentSessionId === studentSessionId);
      return prev.map((s) => s.studentSessionId === studentSessionId ? { ...s, attendanceStatus: status } : s);
    });
    try {
      await apiPost(`/api/mobile/staff/calendar/session/${id}/attendance`, {
        studentSessionId,
        attendanceStatus: status,
        // attendanceNote intentionally omitted — backend preserves existing note
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      // Roll back optimistic update
      if (prevStudent) {
        const snapshot = prevStudent;
        setStudents((curr) =>
          curr.map((s) => s.studentSessionId === studentSessionId
            ? { ...s, attendanceStatus: snapshot.attendanceStatus, attendanceNote: snapshot.attendanceNote }
            : s)
        );
      }
      showToast(err);
    } finally {
      setSaving(null);
    }
  }, [id, showToast]);

  const handleBulkAttendance = useCallback(async (status: AttendanceStatus) => {
    const ids = Array.from(selected);
    const toMark = students.filter((s) => ids.includes(s.studentSessionId));
    // Snapshot for rollback
    const prevStatuses = new Map(toMark.map((s) => [s.studentSessionId, s.attendanceStatus]));
    setStudents((prev) =>
      prev.map((s) => ids.includes(s.studentSessionId) ? { ...s, attendanceStatus: status } : s)
    );
    clearSelection();
    try {
      await apiPost(`/api/mobile/staff/calendar/session/${id}/attendance/bulk`, {
        students: toMark.map((s) => ({
          studentSessionId: s.studentSessionId,
          attendanceStatus: status,
          // attendanceNote intentionally omitted — backend preserves existing notes
        })),
      });
    } catch (err: any) {
      // Roll back optimistic update
      setStudents((curr) =>
        curr.map((s) => prevStatuses.has(s.studentSessionId)
          ? { ...s, attendanceStatus: prevStatuses.get(s.studentSessionId)! }
          : s)
      );
      showToast(err);
    }
  }, [selected, students, id, showToast]);

  const handleMarkAllAs = useCallback(async (status: AttendanceStatus) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const toMark = students.filter((s) => s.attendanceStatus === "pending");
    if (toMark.length === 0) return;
    const revertIds = new Set(toMark.map((s) => s.studentSessionId));
    setStudents((prev) =>
      prev.map((s) => s.attendanceStatus === "pending" ? { ...s, attendanceStatus: status } : s)
    );
    try {
      await apiPost(`/api/mobile/staff/calendar/session/${id}/attendance/bulk`, {
        students: toMark.map((s) => ({
          studentSessionId: s.studentSessionId,
          attendanceStatus: status,
          // attendanceNote intentionally omitted — backend preserves existing notes
        })),
      });
    } catch (err: any) {
      // Roll back optimistic update
      setStudents((curr) =>
        curr.map((s) => revertIds.has(s.studentSessionId) ? { ...s, attendanceStatus: "pending" as AttendanceStatus } : s)
      );
      showToast(err);
    }
  }, [students, id, showToast]);

  const handleMarkAllPresent = useCallback(() => handleMarkAllAs("present"), [handleMarkAllAs]);

  const handleSaveNote = useCallback(async (studentSessionId: string, note: string) => {
    // Optimistic update — capture prev state inside updater (runs synchronously)
    let prevNote: string | undefined;
    setStudents((prev) => {
      const student = prev.find((s) => s.studentSessionId === studentSessionId);
      if (student) prevNote = student.attendanceNote;
      return prev.map((s) => s.studentSessionId === studentSessionId ? { ...s, attendanceNote: note } : s);
    });
    try {
      // Dedicated note endpoint — no attendance time-window check, only updates attendanceNote
      await apiPatch(`/api/mobile/staff/calendar/session/${id}/attendance/note`, {
        studentSessionId,
        attendanceNote: note,
      });
    } catch (err: any) {
      // Roll back optimistic update
      setStudents((prev) =>
        prev.map((s) => s.studentSessionId === studentSessionId ? { ...s, attendanceNote: prevNote ?? "" } : s)
      );
      showToast(err);
    }
  }, [showToast]);

  const handleSaveReview = useCallback(async (studentSessionId: string, reviewData: Record<string, unknown>, publish: boolean) => {
    setStudents((prev) =>
      prev.map((s) => s.studentSessionId === studentSessionId ? { ...s, hasReview: true, reviewPublished: publish } : s)
    );
    setReviewCache((prev) => ({ ...prev, [studentSessionId]: { reviewData, published: publish } }));
    try {
      await apiPost("/api/student-sessions/review", {
        studentSessionIds: [studentSessionId],
        reviewData,
        published: publish,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, []);

  const pendingCount = students.filter((s) => s.attendanceStatus === "pending").length;
  const presentCount = students.filter((s) => s.attendanceStatus === "present").length;
  const reviewCount = students.filter((s) => s.hasReview).length;
  const selCount = selected.size;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Attendance error toast */}
      {toastMsg && (
        <Animated.View
          style={{
            position: "absolute", bottom: insets.bottom + 16, left: 16, right: 16, zIndex: 999,
            opacity: toastAnim,
            transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
          }}
        >
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => {
              if (toastTimer.current) clearTimeout(toastTimer.current);
              Animated.timing(toastAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setToastMsg(null));
            }}
            style={{
              backgroundColor: "#ef4444",
              borderRadius: 14,
              paddingHorizontal: 16,
              paddingVertical: 14,
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              shadowColor: "#ef4444",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 8,
              elevation: 6,
            }}
          >
            <Feather name="alert-circle" size={18} color="#fff" />
            <Text style={{ flex: 1, fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#fff", lineHeight: 18 }}>
              {toastMsg}
            </Text>
            <Feather name="x" size={16} color="#fff" />
          </TouchableOpacity>
        </Animated.View>
      )}
      {/* Header — compact, same standard as other screens */}
      <View
        style={{
          backgroundColor: colors.gradientStart + "28",
          paddingTop: insets.top + (Platform.OS === "web" ? 16 : 8),
          paddingBottom: 16,
          paddingHorizontal: 16,
        }}
      >
        {/* Back button — own row, same as session detail */}
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
          <TouchableOpacity
            onPress={() => { router.back(); Haptics.selectionAsync(); }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primary + "18", alignItems: "center", justifyContent: "center" }}
          >
            <Feather name="arrow-left" size={20} color={colors.primary} />
          </TouchableOpacity>
        </View>

        {/* Title + count + action */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 17, fontFamily: "Inter_700Bold", color: colors.foreground }}>
              Điểm danh & Nhận xét
            </Text>
            {!loading && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2, flexWrap: "wrap" }}>
                <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
                  {presentCount}/{students.length} học viên có học
                </Text>
                {reviewCount > 0 && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#8b5cf615", paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 }}>
                    <Feather name="message-circle" size={11} color="#8b5cf6" />
                    <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#8b5cf6" }}>
                      Đã nhận xét ({reviewCount}/{students.length})
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>

          {!loading && selCount === 0 && (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => { Haptics.selectionAsync(); setShowBulkAll(true); }}
              style={{ backgroundColor: "#10b98118", borderRadius: 18, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: "#10b98140" }}
            >
              <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#10b981" }}>Điểm danh tất cả</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Body */}
      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 14 }}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 13 }}>Đang tải danh sách...</Text>
        </View>
      ) : error ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 }}>
          <Feather name="alert-circle" size={32} color="#ef4444" />
          <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.foreground, textAlign: "center" }}>Không tải được danh sách</Text>
          <TouchableOpacity onPress={() => router.back()} style={{ backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20 }}>
            <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" }}>Quay lại</Text>
          </TouchableOpacity>
        </View>
      ) : students.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 }}>
          <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" }}>
            <Feather name="users" size={24} color={colors.mutedForeground} />
          </View>
          <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>Chưa có học viên</Text>
          <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center" }}>Lớp này chưa có học viên nào được đăng ký</Text>
        </View>
      ) : (
        <>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ padding: 14, gap: 10, paddingBottom: insets.bottom + (selCount > 0 ? 100 : 40) }}
          >
            {students.map((student) => {
              const cfg = STATUS_CONFIG[student.attendanceStatus] ?? STATUS_CONFIG.pending;
              const color = avatarColor(student.studentId);
              const isSavingThis = saving === student.studentSessionId;
              const isSelected = selected.has(student.studentSessionId);

              return (
                <View
                  key={student.studentSessionId}
                  style={{
                    backgroundColor: colors.card,
                    borderRadius: 16,
                    borderWidth: 1.5,
                    borderColor: isSelected ? colors.primary + "80" : colors.border,
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.05,
                    shadowRadius: 6,
                    elevation: 2,
                    overflow: "hidden",
                    opacity: isSavingThis ? 0.75 : 1,
                  }}
                >
                  {/* Top: avatar + info + checkbox */}
                  <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 14, paddingBottom: 10 }}>
                    {/* Avatar */}
                    <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: color, alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" }}>{getInitials(student.studentName)}</Text>
                    </View>

                    {/* Info */}
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.foreground }} numberOfLines={1}>
                        {student.studentName}
                      </Text>
                      <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 1 }}>
                        {student.studentCode}
                      </Text>

                      {/* Status + review badges */}
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 6, flexWrap: "wrap" }}>
                        <View style={{
                          flexDirection: "row", alignItems: "center", gap: 4,
                          backgroundColor: cfg.color + "15", paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8,
                        }}>
                          <Feather name={cfg.icon as any} size={11} color={cfg.color} />
                          <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: cfg.color }}>{cfg.label}</Text>
                        </View>
                        {student.hasReview && (
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#8b5cf615", paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 }}>
                            <Feather name="message-circle" size={11} color="#8b5cf6" />
                            <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#8b5cf6" }}>
                              {student.reviewPublished ? "Đã nhận xét" : "Nháp"}
                            </Text>
                          </View>
                        )}
                      </View>

                      {/* Ghi chú — visible outside, below badges */}
                      {student.attendanceNote ? (
                        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 5, marginTop: 6, backgroundColor: colors.muted, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 }}>
                          <Feather name="edit-3" size={11} color={colors.mutedForeground} style={{ marginTop: 1 }} />
                          <Text style={{ flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, fontStyle: "italic", lineHeight: 17 }}>
                            {student.attendanceNote}
                          </Text>
                        </View>
                      ) : null}
                    </View>

                    {/* Checkbox top-right */}
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => toggleSelect(student.studentSessionId)}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      style={{
                        width: 26, height: 26, borderRadius: 8, flexShrink: 0,
                        borderWidth: 1.5,
                        borderColor: isSelected ? colors.primary : colors.border,
                        backgroundColor: isSelected ? colors.primary + "18" : colors.muted,
                        alignItems: "center", justifyContent: "center",
                      }}
                    >
                      {isSelected && <Feather name="check" size={14} color={colors.primary} />}
                    </TouchableOpacity>

                    {isSavingThis && (
                      <ActivityIndicator size="small" color={colors.primary} style={{ position: "absolute", right: 46, top: 14 }} />
                    )}
                  </View>

                  {/* Divider */}
                  <View style={{ height: 1, backgroundColor: colors.border, marginHorizontal: 14 }} />

                  {/* Action row */}
                  <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 10 }}>
                    {/* Điểm danh — no box, icon+text only */}
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => { Haptics.selectionAsync(); setAttendanceTarget(student); }}
                      style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 8 }}
                    >
                      <Feather
                        name={student.attendanceStatus !== "pending" ? "check-circle" : "circle"}
                        size={15}
                        color={student.attendanceStatus !== "pending" ? "#8b5cf6" : colors.mutedForeground}
                      />
                      <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: student.attendanceStatus !== "pending" ? "#8b5cf6" : colors.mutedForeground }}>
                        Điểm danh
                      </Text>
                    </TouchableOpacity>

                    {/* Divider */}
                    <View style={{ width: 1, height: 18, backgroundColor: colors.border }} />

                    {/* Ghi chú — no box, icon only */}
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => { Haptics.selectionAsync(); setNoteTarget(student); }}
                      style={{ width: 40, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 8, marginHorizontal: 4 }}
                    >
                      <Feather name="edit-3" size={15} color={student.attendanceNote ? "#f59e0b" : colors.mutedForeground} />
                    </TouchableOpacity>

                    {/* Divider */}
                    <View style={{ width: 1, height: 18, backgroundColor: colors.border }} />

                    {/* Nhận xét — no box, icon+text only */}
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => { Haptics.selectionAsync(); setReviewTarget(student); }}
                      style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 8 }}
                    >
                      <Feather
                        name="message-circle"
                        size={15}
                        color={student.hasReview ? "#8b5cf6" : colors.mutedForeground}
                      />
                      <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: student.hasReview ? "#8b5cf6" : colors.mutedForeground }}>
                        Nhận xét
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </ScrollView>

          {/* Bulk action bar — shows when items selected */}
          {selCount > 0 && (
            <View style={{
              position: "absolute", bottom: 0, left: 0, right: 0,
              backgroundColor: colors.card,
              borderTopWidth: 1, borderTopColor: colors.border,
              paddingHorizontal: 16,
              paddingTop: 12,
              paddingBottom: insets.bottom + 12,
              flexDirection: "row", alignItems: "center", gap: 10,
              shadowColor: "#000", shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 8,
            }}>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={clearSelection}
                style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.muted, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border }}
              >
                <Feather name="x" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
              <Text style={{ flex: 1, fontSize: 13, fontFamily: "Inter_500Medium", color: colors.foreground }}>
                Đã chọn {selCount} học viên
              </Text>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setBulkModalOpen(true)}
                style={{ backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 6 }}
              >
                <Feather name="check-circle" size={15} color="#fff" />
                <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#fff" }}>Điểm danh</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}

      {attendanceTarget && (
        <AttendancePickerModal
          student={attendanceTarget}
          onClose={() => setAttendanceTarget(null)}
          onSave={handleSaveAttendance}
          colors={colors}
        />
      )}

      {noteTarget && (
        <NoteModal
          student={noteTarget}
          onClose={() => setNoteTarget(null)}
          onSave={handleSaveNote}
          colors={colors}
        />
      )}

      {reviewTarget && (
        <ReviewModal
          student={reviewTarget}
          sessionId={id ?? ""}
          onClose={() => setReviewTarget(null)}
          onSave={handleSaveReview}
          colors={colors}
          cachedReviewData={reviewCache[reviewTarget.studentSessionId] ?? null}
        />
      )}

      {bulkModalOpen && (
        <BulkAttendanceModal
          count={selCount}
          onClose={() => setBulkModalOpen(false)}
          onSave={handleBulkAttendance}
          colors={colors}
        />
      )}

      {showBulkAll && (
        <BulkAttendanceModal
          count={students.length}
          onClose={() => setShowBulkAll(false)}
          onSave={(status) => {
            setShowBulkAll(false);
            handleMarkAllAs(status);
          }}
          colors={colors}
        />
      )}
    </View>
  );
}
