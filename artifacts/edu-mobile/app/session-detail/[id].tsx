import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "@/hooks/useSafeAreaInsets";

import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { apiGet, apiPost } from "@/lib/api";
import { FileList } from "@/components/FileViewer";
import { HtmlText } from "@/components/HtmlText";
import { PostHtmlContent } from "@/components/PostHtmlContent";
import { AssignContentSheet } from "@/components/AssignContentSheet";

// ─── Shared types ─────────────────────────────────────────────────────────────

interface Attachment {
  name: string;
  url: string;
}

interface ContentItem {
  id: string;
  type: string;
  title: string;
  description?: string | null;
  resourceUrl?: string | null;
  attachments?: Attachment[];
  availableAt?: string | null;
  maxAttempts?: number | null;
}

interface ReviewCriteriaItem {
  subCriteriaName: string;
  comment: string;
}

interface ReviewCriteria {
  criteriaName: string;
  rating?: number;
  items: ReviewCriteriaItem[];
}

interface ReviewTeacherBlock {
  teacherName: string;
  criteria: ReviewCriteria[];
}

interface StudentInfo {
  id?: string;
  name: string;
  code: string;
}

interface OnlineRule {
  earlyEntryMinutes: number;
  lateEntryMinutes: number;
  earlyEndMinutes: number;
}

interface StudentSession {
  classSessionId: string;
  studentSessionId?: string | null;
  sessionDate: string;
  sessionIndex?: number | null;
  weekday?: number;
  className: string;
  classCode?: string;
  startTime: string;
  endTime: string;
  learningFormat?: string;
  onlineLink?: string | null;
  locationId?: string | null;
  locationName?: string | null;
  teacherNames: string[];
  sessionStatus?: string;
  attendanceStatus: string | null;
  attendanceNote?: string | null;
  enrolledCount?: number;
  reviewPublished: boolean;
  reviewData: ReviewTeacherBlock[];
  generalContents: ContentItem[];
  personalContents: ContentItem[];
  student?: StudentInfo | null;
  isParent?: boolean;
  isTestSession?: boolean;
  testSessionId?: string | null;
  onlineClickedAt?: string | null;
  onlineEndedAt?: string | null;
  onlineRule?: OnlineRule | null;
}

interface StaffSessionDetail {
  classSessionId: string;
  classId: string;
  sessionDate: string;
  weekday: string;
  className: string;
  classCode: string;
  startTime: string;
  endTime: string;
  learningFormat: string;
  sessionStatus: string;
  sessionIndex: number;
  totalSessions: number;
  locationName?: string;
  teachers: { id: string; fullName: string; teacherCode?: string }[];
  evaluationCriteriaIds: string[];
  generalContents: ContentItem[];
  enrolledCount: number;
  attendancePendingCount: number;
  reviewedCount: number;
}

const ATTENDANCE_MAP: Record<string, { bg: string; text: string; label: string }> = {
  pending:               { bg: "#f3f4f6", text: "#6b7280", label: "Chưa điểm danh" },
  present:               { bg: "#dcfce7", text: "#166534", label: "Có học" },
  absent:                { bg: "#fee2e2", text: "#991b1b", label: "Nghỉ học" },
  absent_makeup:         { bg: "#fff7ed", text: "#c2410c", label: "Nghỉ chờ bù" },
  absent_pending_makeup: { bg: "#fff7ed", text: "#c2410c", label: "Nghỉ chờ bù" },
  makeup_wait:           { bg: "#fff7ed", text: "#c2410c", label: "Nghỉ chờ bù" },
  makeup:                { bg: "#dbeafe", text: "#1d4ed8", label: "Đã học bù" },
  makeup_done:           { bg: "#dbeafe", text: "#1d4ed8", label: "Đã học bù" },
  reserved:              { bg: "#fef9c3", text: "#854d0e", label: "Bảo lưu" },
  late:                  { bg: "#fef3c7", text: "#92400e", label: "Đi trễ" },
  cancelled:             { bg: "#f3f4f6", text: "#9ca3af", label: "Đã huỷ" },
};

function goBackFromSessionDetail() {
  if (router.canGoBack()) {
    router.back();
  } else {
    // Direct web URLs have no in-app history entry.
    router.replace("/schedule" as any);
  }
}

// ─── Shared components ────────────────────────────────────────────────────────

function ContentModal({ item, onClose, colors }: {
  item: ContentItem;
  onClose: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {/* Header — safe-area aware */}
        <View style={{
          paddingTop: insets.top + 8,
          paddingBottom: 14,
          paddingHorizontal: 16,
          flexDirection: "row",
          alignItems: "flex-start",
          gap: 12,
          backgroundColor: colors.card,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.muted, alignItems: "center", justifyContent: "center", marginTop: 2 }}
          >
            <Feather name="arrow-left" size={20} color={colors.foreground} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            {item.type ? (
              <Text style={{ fontSize: 10, fontFamily: "Inter_700Bold", color: colors.primary, marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>{item.type}</Text>
            ) : null}
            <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: colors.foreground, lineHeight: 22 }}>{item.title}</Text>
          </View>
        </View>

        {/* Scrollable body — flex:1 đảm bảo scroll đúng trên cả Android lẫn iOS */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
          showsVerticalScrollIndicator={true}
        >
          {item.description ? (
            <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: item.attachments?.length ? 8 : 20 }}>
              <PostHtmlContent html={item.description} textColor={colors.foreground} />
            </View>
          ) : (
            <View style={{ padding: 20, paddingBottom: item.attachments?.length ? 8 : 20, alignItems: "center" }}>
              <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>Không có mô tả chi tiết</Text>
            </View>
          )}
          {item.attachments && item.attachments.length > 0 && (
            <View style={{ paddingHorizontal: 20, paddingBottom: 24, gap: 8 }}>
              <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 2 }}>
                File đính kèm
              </Text>
              <FileList files={item.attachments} />
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

function ReviewModal({ visible, reviewData, onClose, colors }: {
  visible: boolean;
  reviewData: ReviewTeacherBlock[];
  onClose: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  const insets = useSafeAreaInsets();
  const hasContent = Array.isArray(reviewData) && reviewData.some((block) =>
    Array.isArray(block.criteria) && block.criteria.some((c) =>
      Array.isArray(c.items) && c.items.some((i) => i.comment && i.comment.trim() !== "")
    )
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {/* Header — full-width, safe area aware */}
        <View style={{
          paddingTop: insets.top + 8,
          paddingBottom: 14,
          paddingHorizontal: 16,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          backgroundColor: colors.card,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" }}>
            <Feather name="arrow-left" size={20} color={colors.foreground} />
          </TouchableOpacity>
          <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: "#f59e0b20", alignItems: "center", justifyContent: "center" }}>
            <Feather name="eye" size={15} color="#f59e0b" />
          </View>
          <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: colors.foreground, flex: 1 }}>
            Nhận xét từ giáo viên
          </Text>
        </View>

        {/* Scrollable content */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
          showsVerticalScrollIndicator={false}
        >
          {!hasContent ? (
            <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center", paddingVertical: 40 }}>
              Chưa có nội dung nhận xét
            </Text>
          ) : (reviewData || []).map((block, blockIdx) => {
            const hasBlockContent = Array.isArray(block.criteria) && block.criteria.some(
              (c) => Array.isArray(c.items) && c.items.some((i) => i.comment && i.comment.trim() !== "")
            );
            if (!hasBlockContent) return null;
            return (
              <View key={blockIdx} style={{ backgroundColor: "#fffbeb", borderRadius: 12, padding: 12, marginBottom: 12, borderLeftWidth: 3, borderLeftColor: "#f59e0b" }}>
                {block.teacherName ? (
                  <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#f59e0b", marginBottom: 8 }}>{block.teacherName}</Text>
                ) : null}
                {(block.criteria || []).map((criteria, ci) => {
                  const filteredItems = (criteria.items || []).filter((i) => i.comment && i.comment.trim() !== "");
                  const hasRating = criteria.rating != null && criteria.rating > 0;
                  if (filteredItems.length === 0 && !hasRating) return null;
                  return (
                    <View key={ci} style={{ marginBottom: ci < (block.criteria.length - 1) ? 10 : 0 }}>
                      {criteria.criteriaName ? (
                        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                          <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#92400e", textTransform: "uppercase", letterSpacing: 0.5 }}>
                            {criteria.criteriaName}
                          </Text>
                          {hasRating ? (
                            <View style={{ flexDirection: "row", gap: 2 }}>
                              {[1,2,3,4,5].map((s) => (
                                <Text key={s} style={{ fontSize: 13, color: s <= (criteria.rating ?? 0) ? "#f59e0b" : "#d1d5db" }}>★</Text>
                              ))}
                            </View>
                          ) : null}
                        </View>
                      ) : null}
                      {filteredItems.map((item, ii) => (
                        <View key={ii} style={{ backgroundColor: "#fff", borderRadius: 8, padding: 10, marginBottom: ii < filteredItems.length - 1 ? 6 : 0 }}>
                          {item.subCriteriaName ? (
                            <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#b45309", marginBottom: 4 }}>
                              {item.subCriteriaName}
                            </Text>
                          ) : null}
                          <HtmlText html={item.comment} style={{ fontSize: 13, color: "#374151", lineHeight: 19 }} compactImages />
                        </View>
                      ))}
                    </View>
                  );
                })}
              </View>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

function StudentTeachersSheet({ names, visible, onClose, colors, insets }: {
  names: string[];
  visible: boolean;
  onClose: () => void;
  colors: ReturnType<typeof useColors>;
  insets: { bottom: number; top: number };
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" }}>
          <TouchableWithoutFeedback>
            <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "67%", minHeight: 200, paddingBottom: insets.bottom + 16 }}>
              <View style={{ alignItems: "center", paddingTop: 12, paddingBottom: 8 }}>
                <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Feather name="user" size={15} color={colors.primary} />
                  <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: colors.foreground }}>Giáo viên</Text>
                  <View style={{ backgroundColor: colors.primary + "15", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 }}>
                    <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.primary }}>{names.length}</Text>
                  </View>
                </View>
                <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" }}>
                    <Feather name="x" size={16} color={colors.mutedForeground} />
                  </View>
                </TouchableOpacity>
              </View>
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, gap: 8 }}>
                {names.map((name, idx) => (
                  <View key={idx} style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.card, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.border }}>
                    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary + "18", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Feather name="user" size={16} color={colors.primary} />
                    </View>
                    <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.foreground, flex: 1 }}>{name}</Text>
                    <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>#{idx + 1}</Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

// ─── Student detail view ──────────────────────────────────────────────────────

function StudentDetailView({ session: initialSession, sessionDate, insets, colors }: {
  session: StudentSession;
  sessionDate: string;
  insets: { top: number; bottom: number };
  colors: ReturnType<typeof useColors>;
}) {
  const [session, setSession] = useState<StudentSession>(initialSession);
  const [selectedContent, setSelectedContent] = useState<ContentItem | null>(null);
  const [reviewVisible, setReviewVisible] = useState(false);
  const [teachersOpen, setTeachersOpen] = useState(false);
  const [joiningOnline, setJoiningOnline] = useState(false);
  const [endingOnline, setEndingOnline] = useState(false);

  const attendanceInfo = ATTENDANCE_MAP[session.attendanceStatus || ""] || ATTENDANCE_MAP.pending;
  const allContents = [...(session.generalContents || []), ...(session.personalContents || [])];
  const hasReview = session.reviewPublished && Array.isArray(session.reviewData) && session.reviewData.length > 0;
  const isCancelledSession = session.sessionStatus === "cancelled";

  const dateStr = sessionDate
    ? sessionDate.split("-").reverse().join("/")
    : (session.sessionDate ? session.sessionDate.split("T")[0].split("-").reverse().join("/") : "");
  const weekdayLabel = session.weekday != null
    ? ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"][session.weekday % 7]
    : null;
  const primaryTeacher = session.teacherNames?.[0] || "";
  const teacherInitials = primaryTeacher
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase() || "GV";

  // The approved session-detail palette is intentionally aqua-forward while
  // retaining the app theme for text, cards, and interactive controls.
  const aqua = "#167c80";
  const aquaDark = "#153d49";
  const aquaSoft = "#e7dcff";
  const pageTint = "#f7f4ff";
  const warmYellow = "#f7d98d";
  const warmCard = "#fffaf0";
  const warmBorder = "#f0dfad";

  // isOnline: learningFormat OR presence of a link
  const isOnline = session.learningFormat === "online" || !!session.onlineLink;

  // Compute open/close windows from onlineRule
  const _sessionDatePart = session.sessionDate
    ? session.sessionDate.split("T")[0]
    : (sessionDate ?? "");
  const _startDT = _sessionDatePart && session.startTime
    ? new Date(`${_sessionDatePart}T${session.startTime}:00`)
    : null;
  const _endDT = _sessionDatePart && session.endTime
    ? new Date(`${_sessionDatePart}T${session.endTime}:00`)
    : null;

  const _rule = session.onlineRule;
  const _joinOpenDT = _startDT
    ? new Date(_startDT.getTime() - (_rule?.earlyEntryMinutes ?? 0) * 60000)
    : null;
  const _joinCloseDT = _startDT
    ? new Date(_startDT.getTime() + (_rule?.lateEntryMinutes ?? 0) * 60000)
    : null;
  const _endOpenDT = _endDT
    ? new Date(_endDT.getTime() - (_rule?.earlyEndMinutes ?? 0) * 60000)
    : null;

  const now = new Date();
  const canJoinOnline = _rule
    ? (_joinOpenDT ? now >= _joinOpenDT : true) && (_joinCloseDT ? now <= _joinCloseDT : true)
    : (_startDT ? now >= _startDT : true); // fallback: enabled from start time
  const canEndOnline = _endOpenDT ? now >= _endOpenDT : false;

  // Format the join-open time for hint text
  const joinOpenTimeLabel = _joinOpenDT
    ? `${String(_joinOpenDT.getHours()).padStart(2, "0")}:${String(_joinOpenDT.getMinutes()).padStart(2, "0")}`
    : session.startTime;

  const handleJoinOnline = async () => {
    if (!session.onlineLink || !canJoinOnline) return;
    setJoiningOnline(true);
    try {
      const result = await apiPost<{ onlineClickedAt: string }>(
        `/api/mobile/student/session/${session.classSessionId}/online-click`,
        {}
      );
      setSession((prev) => ({ ...prev, onlineClickedAt: result.data?.onlineClickedAt || prev.onlineClickedAt }));
    } catch {
      // Non-blocking — still open the link even if tracking fails
    } finally {
      setJoiningOnline(false);
    }
    Linking.openURL(session.onlineLink);
  };

  const handleEndOnline = async () => {
    if (!session.onlineLink || !canEndOnline) return;
    setEndingOnline(true);
    try {
      const result = await apiPost<{ onlineEndedAt: string }>(
        `/api/mobile/student/session/${session.classSessionId}/online-end`,
        {}
      );
      setSession((prev) => ({ ...prev, onlineEndedAt: result.data?.onlineEndedAt || prev.onlineEndedAt }));
    } catch {
      // Non-blocking
    } finally {
      setEndingOnline(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: pageTint }}>
      <View
        style={{
          backgroundColor: aquaSoft,
          paddingTop: insets.top + (Platform.OS === "web" ? 16 : 8),
          paddingBottom: 20,
          paddingHorizontal: 16,
          overflow: "hidden",
          position: "relative",
        }}
      >
        {/* Soft decorative circles from the approved Modern Cards hero. */}
        <View style={{ position: "absolute", width: 160, height: 160, borderRadius: 80, right: -38, top: -58, backgroundColor: warmYellow, opacity: 0.45 }} />
        <View style={{ position: "absolute", width: 112, height: 112, borderRadius: 56, left: 102, bottom: -58, backgroundColor: "#cdbbfa", opacity: 0.6 }} />
        <View style={{ position: "relative" }}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 16 }}>
            <TouchableOpacity
              onPress={() => { router.back(); Haptics.selectionAsync(); }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: "#ffffffbf", alignItems: "center", justifyContent: "center", shadowColor: aqua, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 5, elevation: 1 }}
            >
              <Feather name="arrow-left" size={20} color={aqua} />
            </TouchableOpacity>
          </View>

          <View style={{ gap: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: "#488287", marginBottom: 4, textTransform: "uppercase", letterSpacing: 1.6 }}>
                  {session.sessionIndex != null ? `Buổi học ${session.sessionIndex}` : "Buổi học"}
                </Text>
                <Text style={{ fontSize: 25, lineHeight: 31, fontFamily: "Inter_700Bold", color: aquaDark }} numberOfLines={2}>
                  {session.classCode || session.className}
                </Text>
              </View>
              {isCancelledSession ? (
                <View style={{ backgroundColor: "#fee2e2", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 }}>
                  <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#991b1b" }}>Đã huỷ</Text>
                </View>
              ) : session.attendanceStatus ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: session.attendanceStatus === "present" ? "#198a72" : attendanceInfo.bg, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 20, shadowColor: session.attendanceStatus === "present" ? "#198a72" : "transparent", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.18, shadowRadius: 6, elevation: session.attendanceStatus === "present" ? 2 : 0 }}>
                  {session.attendanceStatus === "present" ? <Feather name="check" size={13} color="#fff" /> : null}
                  <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: session.attendanceStatus === "present" ? "#fff" : attendanceInfo.text }}>{attendanceInfo.label}</Text>
                </View>
              ) : null}
            </View>

            {session.isTestSession || (!isCancelledSession && session.learningFormat) ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                {session.isTestSession ? (
                  <View style={{ backgroundColor: "#fef3c7", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: "#fde68a" }}>
                    <Text style={{ fontSize: 10, fontFamily: "Inter_600SemiBold", color: "#92400e" }}>Kiểm tra</Text>
                  </View>
                ) : null}
                {!isCancelledSession && session.learningFormat ? (
                  <View style={{ backgroundColor: "#ffffffa6", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 }}>
                    <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#4c7078" }}>
                      {isOnline ? "Online" : (session.learningFormat === "hybrid" ? "Hybrid" : "Offline")}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            <View style={{ flexDirection: "row", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Feather name="clock" size={15} color={aqua} />
                <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#416070" }}>
                  {session.startTime} – {session.endTime}
                </Text>
              </View>
              {session.locationName ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, minWidth: 0, flexShrink: 1 }}>
                  <Feather name="map-pin" size={15} color={aqua} />
                  <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: "#416070", flexShrink: 1 }} numberOfLines={1}>{session.locationName}</Text>
                </View>
              ) : null}
            </View>

            {(dateStr || weekdayLabel) ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                {dateStr ? <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: "#5b7d83" }}>{dateStr}</Text> : null}
                {dateStr && weekdayLabel ? <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: "#7fa9a8" }} /> : null}
                {weekdayLabel ? <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: "#5b7d83" }}>{weekdayLabel}</Text> : null}
              </View>
            ) : null}

            {session.isParent && session.student ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <Feather name="user" size={13} color="#f97316" />
                <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#f97316" }}>
                  {session.student.name}
                  {session.student.code ? (
                    <Text style={{ fontFamily: "Inter_400Regular", opacity: 0.8 }}>{" · "}{session.student.code}</Text>
                  ) : null}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 40 }}
      >
        {/* Online link button — only for online sessions with a link */}
        {isOnline && session.onlineLink && !isCancelledSession ? (
          <View style={{ gap: 6 }}>
            {/* Join button */}
            <TouchableOpacity
              activeOpacity={canJoinOnline ? 0.82 : 1}
              onPress={canJoinOnline ? handleJoinOnline : undefined}
              disabled={joiningOnline || !canJoinOnline}
              style={{
                backgroundColor: canJoinOnline ? "#1d4ed8" : "#9ca3af",
                borderRadius: 14,
                paddingVertical: 14,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                shadowColor: canJoinOnline ? "#1d4ed8" : "transparent",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.25,
                shadowRadius: 10,
                elevation: canJoinOnline ? 4 : 0,
              }}
            >
              {joiningOnline ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Feather name="video" size={17} color="#fff" />
              )}
              <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold", color: "#fff" }}>
                {session.onlineClickedAt ? "Vào học lại" : "Vào học online"}
              </Text>
            </TouchableOpacity>
            {!canJoinOnline && (
              <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center" }}>
                Nút sẽ mở lúc {joinOpenTimeLabel}
              </Text>
            )}
            {/* End button — shown once the end window opens and student has joined */}
            {canEndOnline && session.onlineClickedAt && !session.onlineEndedAt ? (
              <TouchableOpacity
                activeOpacity={0.82}
                onPress={handleEndOnline}
                disabled={endingOnline}
                style={{
                  backgroundColor: "#dc2626",
                  borderRadius: 14,
                  paddingVertical: 12,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                {endingOnline ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Feather name="log-out" size={16} color="#fff" />
                )}
                <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold", color: "#fff" }}>Kết thúc buổi học</Text>
              </TouchableOpacity>
            ) : null}
            {session.onlineEndedAt ? (
              <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center" }}>
                Đã kết thúc lúc {session.onlineEndedAt ? new Date(session.onlineEndedAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) : ""}
              </Text>
            ) : null}
          </View>
        ) : null}


        {/* Teachers */}
        {session.teacherNames && session.teacherNames.length > 0 && (
          <TouchableOpacity
            activeOpacity={0.75}
            onPress={() => { setTeachersOpen(true); Haptics.selectionAsync(); }}
            style={{ backgroundColor: "#fff", borderRadius: 16, borderWidth: 1, borderColor: "#dceceb", shadowColor: "#195b63", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.07, shadowRadius: 9, elevation: 2, overflow: "hidden" }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 14 }}>
              <View style={{ width: 32, height: 32, borderRadius: 11, backgroundColor: "#e4f5f2", alignItems: "center", justifyContent: "center" }}>
                <Feather name="user" size={15} color={aqua} />
              </View>
              <Text style={{ fontSize: 12, fontFamily: "Inter_700Bold", color: "#294e59", textTransform: "uppercase", letterSpacing: 1.1, flex: 1 }}>Giáo viên</Text>
              <View style={{ backgroundColor: "#e4f5f2", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 }}>
                <Text style={{ fontSize: 10, fontFamily: "Inter_700Bold", color: aqua }}>{session.teacherNames.length}</Text>
              </View>
              <Feather name="chevron-right" size={17} color="#719499" />
            </View>
            <View style={{ paddingHorizontal: 14, paddingBottom: 13, flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: warmYellow, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontSize: 12, fontFamily: "Inter_700Bold", color: "#765b1e" }}>{teacherInitials}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: "#244651", lineHeight: 19 }} numberOfLines={1}>
                  {primaryTeacher}
                </Text>
                {session.teacherNames.length > 1 ? (
                  <Text style={{ fontSize: 10, fontFamily: "Inter_500Medium", color: "#88a1a5" }} numberOfLines={1}>
                    +{session.teacherNames.length - 1} giáo viên khác
                  </Text>
                ) : (
                  <Text style={{ fontSize: 10, fontFamily: "Inter_500Medium", color: "#88a1a5" }}>Giáo viên chính</Text>
                )}
              </View>
            </View>
          </TouchableOpacity>
        )}

        {/* Session content */}
        {allContents.length > 0 && (
          <View style={{ backgroundColor: "#fff", borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: "#dceceb", shadowColor: "#195b63", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.06, shadowRadius: 9, elevation: 2 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderBottomWidth: 1, borderBottomColor: "#eef6f4" }}>
              <View style={{ width: 32, height: 32, borderRadius: 11, backgroundColor: "#e4f5f2", alignItems: "center", justifyContent: "center" }}>
                <Feather name="book-open" size={16} color={aqua} />
              </View>
              <Text style={{ fontSize: 12, fontFamily: "Inter_700Bold", color: "#294e59", textTransform: "uppercase", letterSpacing: 1.1, flex: 1 }}>Nội dung buổi học</Text>
              <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: "#8aa3a6" }}>{allContents.length} mục</Text>
            </View>
            <View style={{ padding: 13, gap: 9 }}>
              {allContents.map((item, idx) => (
                <TouchableOpacity
                  key={item.id}
                  activeOpacity={0.75}
                  onPress={() => { setSelectedContent(item); Haptics.selectionAsync(); }}
                  style={{ minHeight: 68, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#fbfefd", borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: "#dceceb" }}
                >
                  <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: "#d9f1ee", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: aqua }}>{String(idx + 1).padStart(2, "0")}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    {item.type ? (
                      <Text style={{ fontSize: 10, fontFamily: "Inter_700Bold", color: "#7a9a9f", textTransform: "uppercase", letterSpacing: 1.1, marginBottom: 3 }}>{item.type}</Text>
                    ) : null}
                    <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: "#183b47", lineHeight: 18 }} numberOfLines={2}>{item.title}</Text>
                  </View>
                  {item.attachments && item.attachments.length > 0 && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#e6f4ff", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5 }}>
                      <Feather name="paperclip" size={11} color="#2a6d9c" />
                      <Text style={{ fontSize: 10, fontFamily: "Inter_700Bold", color: "#2a6d9c" }}>{item.attachments.length}</Text>
                    </View>
                  )}
                  <Feather name="chevron-right" size={17} color="#7a9a9f" />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Teacher comment card */}
        {!session.isTestSession ? (
          <TouchableOpacity
            activeOpacity={hasReview ? 0.75 : 1}
            onPress={() => { if (hasReview) { setReviewVisible(true); Haptics.selectionAsync(); } }}
            style={{
              backgroundColor: hasReview ? warmCard : "#fff",
              borderRadius: 16,
              borderWidth: 1,
              borderColor: hasReview ? warmBorder : "#dceceb",
              shadowColor: hasReview ? "#9a701f" : "#195b63",
              shadowOffset: { width: 0, height: 3 },
              shadowOpacity: 0.06,
              shadowRadius: 9,
              elevation: 2,
              overflow: "hidden",
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderBottomWidth: 1, borderBottomColor: hasReview ? warmBorder : "#eef6f4" }}>
              <View style={{ width: 32, height: 32, borderRadius: 11, backgroundColor: hasReview ? "#ffedc0" : "#e4f5f2", alignItems: "center", justifyContent: "center" }}>
                <Feather name="message-circle" size={16} color={hasReview ? "#ad7a17" : aqua} />
              </View>
              <Text style={{ fontSize: 12, fontFamily: "Inter_700Bold", color: hasReview ? "#665127" : "#294e59", textTransform: "uppercase", letterSpacing: 1, flex: 1 }}>
                Nhận xét từ giáo viên
              </Text>
              <Feather name="chevron-right" size={17} color={hasReview ? "#ad7a17" : "#719499"} />
            </View>
            <View style={{ padding: 14 }}>
              {hasReview ? (
                <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: "#8b7139", lineHeight: 18 }}>
                  Giáo viên đã có nhận xét cho buổi học này. Nhấn để xem chi tiết.
                </Text>
              ) : (
                <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, lineHeight: 18 }}>
                  Chưa có nhận xét từ giáo viên cho buổi học này.
                </Text>
              )}
            </View>
          </TouchableOpacity>
        ) : null}
      </ScrollView>

      {selectedContent && (
        <ContentModal item={selectedContent} onClose={() => setSelectedContent(null)} colors={colors} />
      )}

      <ReviewModal
        visible={reviewVisible}
        reviewData={session.reviewData || []}
        onClose={() => setReviewVisible(false)}
        colors={colors}
      />

      <StudentTeachersSheet
        names={session.teacherNames || []}
        visible={teachersOpen}
        onClose={() => setTeachersOpen(false)}
        colors={colors}
        insets={insets}
      />
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function SessionDetailScreen() {
  const { id, sessionDate, isStudent, isTestSession: isTestParam } = useLocalSearchParams<{ id: string; sessionDate?: string; isStudent?: string; isTestSession?: string }>();
  const { user, isLoading: authLoading } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();

  // Keep the query-param route contract, but infer the view for direct URLs
  // where the PWA may omit query params during navigation or refresh.
  const isStudentView = isStudent === "1"
    || (isStudent == null && (user?.role === "student" || user?.role === "parent"));
  const isTestSessionParam = isTestParam === "1";

  // Student state
  const [studentSession, setStudentSession] = useState<StudentSession | null>(null);
  const [studentLoading, setStudentLoading] = useState(true);
  const [studentError, setStudentError] = useState(false);

  // Staff state
  const [detail, setDetail] = useState<StaffSessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedContent, setSelectedContent] = useState<ContentItem | null>(null);
  const [teachersOpen, setTeachersOpen] = useState(false);
  const [assignContentOpen, setAssignContentOpen] = useState(false);

  useEffect(() => {
    if (!id || authLoading) return;
    if (isStudentView) {
      setStudentLoading(true);
      setStudentError(false);
      // TEST sessions use /test-session/:id endpoint; regular sessions use /session/:id
      const endpoint = isTestSessionParam
        ? `/api/mobile/student/test-session/${id}`
        : `/api/mobile/student/session/${id}`;
      apiGet<StudentSession>(endpoint)
        .then(setStudentSession)
        .catch(() => {
          // If test-session endpoint fails (not yet implemented), fall back to session endpoint
          if (isTestSessionParam) {
            apiGet<StudentSession>(`/api/mobile/student/session/${id}`)
              .then(setStudentSession)
              .catch(() => setStudentError(true))
              .finally(() => setStudentLoading(false));
          } else {
            setStudentError(true);
            setStudentLoading(false);
          }
        })
        .finally(() => {
          if (!isTestSessionParam) setStudentLoading(false);
        });
    } else {
      setLoading(true);
      setError(false);
      apiGet<StaffSessionDetail>(`/api/mobile/staff/calendar/session/${id}`)
        .then(setDetail)
        .catch(() => setError(true))
        .finally(() => setLoading(false));
    }
  }, [id, isStudentView, isTestSessionParam, authLoading]);

  // ── Student view ──────────────────────────────────────────────────────────

  if (isStudentView) {
    if (studentLoading) {
      return (
        <View style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", gap: 14 }}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 13 }}>Đang tải chi tiết...</Text>
        </View>
      );
    }
    if (studentError || !studentSession) {
      return (
        <View style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 }}>
          <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: "#fee2e2", alignItems: "center", justifyContent: "center" }}>
            <Feather name="alert-circle" size={26} color="#ef4444" />
          </View>
          <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.foreground, textAlign: "center" }}>Không tải được thông tin</Text>
          <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center" }}>Vui lòng thử lại sau</Text>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ marginTop: 8, backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20 }}
          >
            <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" }}>Quay lại</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <StudentDetailView
        session={studentSession}
        sessionDate={sessionDate || ""}
        insets={insets}
        colors={colors}
      />
    );
  }

  // ── Staff view ────────────────────────────────────────────────────────────

  const isCancelled = detail?.sessionStatus === "cancelled";
  const accentColor = isCancelled ? "#ef4444" : colors.primary;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={{ backgroundColor: colors.gradientStart + "28", paddingTop: insets.top + (Platform.OS === "web" ? 16 : 8), paddingBottom: 20, paddingHorizontal: 16 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 14 }}>
          <TouchableOpacity
            onPress={() => { router.back(); Haptics.selectionAsync(); }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primary + "18", alignItems: "center", justifyContent: "center" }}
          >
            <Feather name="arrow-left" size={20} color={colors.primary} />
          </TouchableOpacity>
        </View>

        {!loading && detail && (
          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <Text style={{ fontSize: 22, fontFamily: "Inter_700Bold", color: colors.foreground }}>
                {detail.classCode || detail.className}
              </Text>
              <View style={{ backgroundColor: colors.primary + "18", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1, borderColor: colors.primary + "30" }}>
                <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: colors.primary }}>
                  {detail.learningFormat === "online" ? "Online" : "Offline"}
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Feather name="clock" size={14} color={colors.mutedForeground} />
                <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>
                  {detail.startTime} – {detail.endTime}
                </Text>
              </View>
              {detail.locationName ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Feather name="map-pin" size={14} color={colors.mutedForeground} />
                  <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: colors.foreground }}>{detail.locationName}</Text>
                </View>
              ) : null}
            </View>

            <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
              Buổi {detail.sessionIndex}{detail.totalSessions ? ` / ${detail.totalSessions}` : ""}
              {detail.weekday ? ` · ${detail.weekday}` : ""}
              {detail.sessionDate ? ` · ${detail.sessionDate.split("T")[0].split("-").reverse().join("/")}` : ""}
            </Text>
          </View>
        )}

        {loading && (
          <Text style={{ fontSize: 17, fontFamily: "Inter_700Bold", color: colors.foreground }}>Chi tiết buổi học</Text>
        )}
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 14 }}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 13 }}>Đang tải chi tiết...</Text>
        </View>
      ) : error || !detail ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 }}>
          <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: "#fee2e2", alignItems: "center", justifyContent: "center" }}>
            <Feather name="alert-circle" size={26} color="#ef4444" />
          </View>
          <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.foreground, textAlign: "center" }}>Không tải được thông tin</Text>
          <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center" }}>Vui lòng thử lại sau</Text>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ marginTop: 8, backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20 }}
          >
            <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" }}>Quay lại</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 40 }}
        >
          <View style={{ flexDirection: "row", gap: 10 }}>
            <StatCard value={detail.enrolledCount ?? 0} label="Học viên" icon="users" color={colors.primary} colors={colors} />
            <StatCard
              value={detail.attendancePendingCount ?? 0}
              label="Chưa điểm danh"
              icon="alert-circle"
              color={detail.attendancePendingCount > 0 ? "#f97316" : colors.primary}
              highlight={detail.attendancePendingCount > 0}
              colors={colors}
            />
            <StatCard value={detail.reviewedCount ?? 0} label="Đã nhận xét" icon="message-square" color={colors.primary} colors={colors} />
          </View>

          {detail.teachers && detail.teachers.length > 0 && (
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={() => { setTeachersOpen(true); Haptics.selectionAsync(); }}
              style={{ backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2, overflow: "hidden" }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, padding: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <Feather name="user" size={15} color={colors.primary} />
                <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: colors.foreground, textTransform: "uppercase", letterSpacing: 0.7, flex: 1 }}>Giáo viên</Text>
                <View style={{ backgroundColor: colors.primary + "15", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 }}>
                  <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.primary }}>{detail.teachers.length}</Text>
                </View>
              </View>
              <View style={{ paddingHorizontal: 14, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.foreground, lineHeight: 19 }} numberOfLines={1}>
                    {detail.teachers.map(t => t.fullName).join(", ")}
                  </Text>
                </View>
                <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
              </View>
            </TouchableOpacity>
          )}

          {detail.generalContents && detail.generalContents.length > 0 && (
            <SectionCard title="Nội dung buổi học" icon="book-open" colors={colors}>
              <View style={{ gap: 8 }}>
                {detail.generalContents.map((item, idx) => (
                  <TouchableOpacity
                    key={item.id}
                    activeOpacity={0.75}
                    onPress={() => { setSelectedContent(item); Haptics.selectionAsync(); }}
                    style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.muted, borderRadius: 12, padding: 12 }}
                  >
                    <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: accentColor + "20", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Text style={{ fontSize: 12, fontFamily: "Inter_700Bold", color: accentColor }}>{idx + 1}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      {item.type ? (
                        <Text style={{ fontSize: 10, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 2 }}>{item.type}</Text>
                      ) : null}
                      <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: colors.foreground, lineHeight: 19 }}>{item.title}</Text>
                    </View>
                    {item.attachments && item.attachments.length > 0 && (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: accentColor + "15", borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 }}>
                        <Feather name="paperclip" size={10} color={accentColor} />
                        <Text style={{ fontSize: 10, fontFamily: "Inter_600SemiBold", color: accentColor }}>{item.attachments.length}</Text>
                      </View>
                    )}
                    {(item.description || (item.attachments && item.attachments.length > 0)) && (
                      <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </SectionCard>
          )}

          <View style={{ flexDirection: "row", gap: 10 }}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => { Haptics.selectionAsync(); router.push(`/session-attendance/${detail.classSessionId}`); }}
              style={{ flex: 1, backgroundColor: colors.card, borderRadius: 14, paddingVertical: 14, flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderColor: colors.border, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 }}
            >
              <Feather name="check-circle" size={20} color="#10b981" />
              <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.foreground, textAlign: "center" }}>Điểm danh & Nhận xét</Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => { Haptics.selectionAsync(); setAssignContentOpen(true); }}
              style={{ flex: 1, backgroundColor: colors.card, borderRadius: 14, paddingVertical: 14, flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderColor: colors.border, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 }}
            >
              <Feather name="send" size={20} color="#8b5cf6" />
              <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.foreground, textAlign: "center" }}>Giao Nội dung</Text>
            </TouchableOpacity>
          </View>

          {detail.attendancePendingCount > 0 && (
            <View style={{ backgroundColor: "#fff7ed", borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: "#fed7aa", flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Feather name="bell" size={16} color="#f97316" />
              <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: "#c2410c", flex: 1 }}>
                Còn <Text style={{ fontFamily: "Inter_700Bold" }}>{detail.attendancePendingCount}</Text> học viên chưa điểm danh
              </Text>
            </View>
          )}
        </ScrollView>
      )}

      {selectedContent && (
        <ContentModal item={selectedContent} onClose={() => setSelectedContent(null)} colors={colors} />
      )}

      {detail && (
        <TeachersBottomSheet
          teachers={detail.teachers}
          visible={teachersOpen}
          onClose={() => setTeachersOpen(false)}
          accentColor={accentColor}
          colors={colors}
          insets={insets}
        />
      )}

      {detail && (
        <AssignContentSheet
          visible={assignContentOpen}
          onClose={() => setAssignContentOpen(false)}
          classSessionId={detail.classSessionId}
          onSaved={() => {
            setAssignContentOpen(false);
            setLoading(true);
            setError(false);
            apiGet<StaffSessionDetail>(`/api/mobile/staff/calendar/session/${id}`)
              .then(setDetail)
              .catch(() => setError(true))
              .finally(() => setLoading(false));
          }}
        />
      )}
    </View>
  );
}

// ─── Helper components ────────────────────────────────────────────────────────

function StatCard({ value, label, icon, color, highlight = false, colors }: {
  value: number;
  label: string;
  icon: string;
  color: string;
  highlight?: boolean;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={{
      flex: 1,
      backgroundColor: highlight ? "#fff7ed" : colors.card,
      borderRadius: 12,
      paddingVertical: 10,
      paddingHorizontal: 8,
      alignItems: "center",
      gap: 5,
      borderWidth: 1,
      borderColor: highlight ? "#fed7aa" : colors.border,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 6,
      elevation: 2,
    }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        <Feather name={icon as any} size={11} color={color} />
        <Text style={{ fontSize: 10, fontFamily: "Inter_400Regular", color: highlight ? "#c2410c" : colors.mutedForeground, lineHeight: 13 }}>{label}</Text>
      </View>
      <Text style={{ fontSize: 20, fontFamily: "Inter_700Bold", color: highlight ? color : colors.foreground }}>{value}</Text>
    </View>
  );
}

function TeachersBottomSheet({ teachers, visible, onClose, accentColor, colors, insets }: {
  teachers: { id: string; fullName: string; teacherCode?: string }[];
  visible: boolean;
  onClose: () => void;
  accentColor: string;
  colors: ReturnType<typeof useColors>;
  insets: { bottom: number; top: number };
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" }}>
          <TouchableWithoutFeedback>
            <View style={{
              backgroundColor: colors.background,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              maxHeight: "67%",
              minHeight: 200,
              paddingBottom: insets.bottom + 16,
            }}>
              <View style={{ alignItems: "center", paddingTop: 12, paddingBottom: 8 }}>
                <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Feather name="user" size={15} color={colors.primary} />
                  <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: colors.foreground }}>Giáo viên</Text>
                  <View style={{ backgroundColor: colors.primary + "15", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 }}>
                    <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.primary }}>{teachers.length}</Text>
                  </View>
                </View>
                <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" }}>
                    <Feather name="x" size={16} color={colors.mutedForeground} />
                  </View>
                </TouchableOpacity>
              </View>
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, gap: 8 }}>
                {teachers.map((t, idx) => (
                  <View
                    key={t.id}
                    style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.card, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.border }}
                  >
                    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: accentColor + "18", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Feather name="user" size={16} color={accentColor} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>{t.fullName}</Text>
                      {t.teacherCode ? (
                        <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 2 }}>{t.teacherCode.toUpperCase()}</Text>
                      ) : null}
                    </View>
                    <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>#{idx + 1}</Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

function SectionCard({ title, icon, children, colors }: {
  title: string;
  icon: string;
  children: React.ReactNode;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={{ backgroundColor: colors.card, borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: colors.border, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, padding: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <Feather name={icon as any} size={15} color={colors.primary} />
        <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: colors.foreground, textTransform: "uppercase", letterSpacing: 0.7 }}>{title}</Text>
      </View>
      <View style={{ padding: 14 }}>
        {children}
      </View>
    </View>
  );
}
