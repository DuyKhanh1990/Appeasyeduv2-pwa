import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { popCalendarDeeplink, markCalendarDeeplinkHandled, onCalendarDeeplink, offCalendarDeeplink, type CalendarDeeplink } from "@/lib/deeplinkStore";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Modal,
  PanResponder,
  Platform,
  Pressable,
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

import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { apiGet } from "@/lib/api";
import { FileList } from "@/components/FileViewer";
import { HtmlText } from "@/components/HtmlText";
import { PostHtmlContent } from "@/components/PostHtmlContent";

// ─── Student types ──────────────────────────────────────────────────────────

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
  reviewPublished?: boolean;
  reviewData?: ReviewTeacherBlock[];
  generalContents?: ContentItem[];
  personalContents?: ContentItem[];
  student?: StudentInfo | null;
  isParent?: boolean;
  isTestSession?: boolean;
  testSessionId?: string | null;
}

interface DaySchedule {
  date: string;
  sessions: StudentSession[];
}

// ─── Staff types ─────────────────────────────────────────────────────────────

interface StaffSession {
  classSessionId: string;
  sessionDate: string;
  weekday: string;
  className: string;
  classCode: string;
  startTime: string;
  endTime: string;
  learningFormat: string;
  onlineLink?: string | null;
  sessionStatus: string;
  sessionIndex: number;
  locationName?: string;
  checkInAt?: string | null;
  checkOutAt?: string | null;
  enrolledCount?: number | null;
  attendancePendingCount?: number | null;
  reviewedCount?: number | null;
  isTestSession?: boolean;
}

interface StaffMonthResponse {
  month: string;
  datesWithSessions: string[];
  sessions: StaffSession[];
}

// ─── Shared constants ─────────────────────────────────────────────────────────

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

const WEEKDAY_DISPLAY = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const ROW_HEIGHT = 46;
const MONTH_NAMES = ["Tháng 1","Tháng 2","Tháng 3","Tháng 4","Tháng 5","Tháng 6","Tháng 7","Tháng 8","Tháng 9","Tháng 10","Tháng 11","Tháng 12"];

// Soft lavender schedule palette inspired by the selected visual references.
const SCHEDULE_AQUA = "#7653d6";
const SCHEDULE_AQUA_DARK = "#30205f";
const SCHEDULE_AQUA_SOFT = "#e7dcff";
const SCHEDULE_PAGE_TINT = "#f7f4ff";
// Session dots need stronger contrast than the warm decorative accent.
const SCHEDULE_SESSION_DOT = "#f97316";

function toYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseYMD(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function getDaysInMonth(year: number, month: number): Date[] {
  const days: Date[] = [];
  const d = new Date(year, month, 1);
  while (d.getMonth() === month) {
    days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

// Extract YYYY-MM-DD from ISO date string or plain date string
function extractDateStr(sessionDate: string): string {
  if (!sessionDate) return "";
  return sessionDate.split("T")[0];
}

// ─── Student components ───────────────────────────────────────────────────────

function AttendanceBadge({ status }: { status: string }) {
  const s = ATTENDANCE_MAP[status] || ATTENDANCE_MAP.pending;
  return (
    <View style={{ backgroundColor: s.bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 }}>
      <Text style={{ color: s.text, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>{s.label}</Text>
    </View>
  );
}

function ContentDetailModal({ item, visible, onClose, color, colors }: {
  item: ContentItem | null;
  visible: boolean;
  onClose: () => void;
  color: string;
  colors: ReturnType<typeof useColors>;
}) {
  const { height: screenH } = useWindowDimensions();
  const maxCardH = screenH * 0.82;
  const HEADER_H = 72;
  const bodyMaxH = maxCardH - HEADER_H;

  if (!item) return null;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", alignItems: "center", padding: 24 }}>
          <Pressable
            style={{ backgroundColor: colors.card, borderRadius: 18, width: "100%", maxWidth: 420, maxHeight: maxCardH, shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 24, elevation: 12, overflow: "hidden" }}
          >
            <View style={{ backgroundColor: color + "18", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: color + "30", flexDirection: "row", alignItems: "flex-start", gap: 12, flexShrink: 0 }}>
              <View style={{ flex: 1 }}>
                {item.type ? (
                  <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.6 }}>{item.type}</Text>
                ) : null}
                <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: colors.foreground, lineHeight: 21 }}>{item.title}</Text>
              </View>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginTop: 2 }}>
                <Feather name="x" size={20} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: bodyMaxH }} contentContainerStyle={{ paddingBottom: 8 }} showsVerticalScrollIndicator={true}>
              {item.description ? (
                <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: item.attachments?.length ? 8 : 20 }}>
                  <PostHtmlContent html={item.description} textColor={colors.foreground} />
                </View>
              ) : (
                <View style={{ padding: 20, paddingBottom: item.attachments?.length ? 8 : 20 }}>
                  <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center" }}>Không có mô tả chi tiết</Text>
                </View>
              )}
              {item.attachments && item.attachments.length > 0 && (
                <View style={{ paddingHorizontal: 20, paddingBottom: 20, gap: 8 }}>
                  <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 2 }}>
                    File đính kèm
                  </Text>
                  <FileList files={item.attachments} />
                </View>
              )}
            </ScrollView>
          </Pressable>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

function ReviewModal({ visible, reviewData, onClose, colors }: {
  visible: boolean;
  reviewData: ReviewTeacherBlock[];
  onClose: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  const { height: screenH } = useWindowDimensions();
  // header padding+icon+title ≈ 72px; use explicit maxHeight so ScrollView renders on Android
  // (flex:1 inside a maxHeight-only parent collapses to 0 on Android)
  const bodyMaxH = screenH * 0.88 - 72;
  const hasContent = Array.isArray(reviewData) && reviewData.some((block) =>
    Array.isArray(block.criteria) && block.criteria.some((c) =>
      Array.isArray(c.items) && c.items.some((i) => i.comment && i.comment.trim() !== "")
    )
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", alignItems: "center", padding: 16 }}>
          <TouchableWithoutFeedback>
            <View style={{ backgroundColor: colors.card, borderRadius: 18, width: "100%", maxWidth: 480, maxHeight: "88%", shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 24, elevation: 12, overflow: "hidden" }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: "#f59e0b20", alignItems: "center", justifyContent: "center" }}>
                    <Feather name="eye" size={15} color="#f59e0b" />
                  </View>
                  <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: colors.foreground }}>Nhận xét</Text>
                </View>
                <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Feather name="x" size={20} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>
              <ScrollView style={{ maxHeight: bodyMaxH }} contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false}>
                {!hasContent ? (
                  <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center", paddingVertical: 20 }}>
                    Chưa có nội dung nhận xét
                  </Text>
                ) : (reviewData || []).map((block, blockIdx) => {
                  const hasBlockContent = Array.isArray(block.criteria) && block.criteria.some(
                    (c) => Array.isArray(c.items) && c.items.some((i) => i.comment && i.comment.trim() !== "")
                  );
                  if (!hasBlockContent) return null;
                  return (
                    <View key={blockIdx} style={{ backgroundColor: "#fffbeb", borderRadius: 12, padding: 12, marginBottom: 10, borderLeftWidth: 3, borderLeftColor: "#f59e0b" }}>
                      {block.teacherName ? (
                        <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#f59e0b", marginBottom: 8 }}>{block.teacherName}</Text>
                      ) : null}
                      {(block.criteria || []).map((criteria, ci) => {
                        const filteredItems = (criteria.items || []).filter((i) => i.comment && i.comment.trim() !== "");
                        const hasRating = criteria.rating != null && criteria.rating > 0;
                        if (filteredItems.length === 0 && !hasRating) return null;
                        return (
                          <View key={ci} style={{ marginBottom: ci < (block.criteria.length - 1) ? 10 : 0 }}>
                            {/* Criteria header: name + stars */}
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
                            {/* Sub-criteria items — white card each */}
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
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

function StudentSessionCard({
  session,
  colors,
  onPress,
  highlighted,
  onLayout,
}: {
  session: StudentSession;
  colors: ReturnType<typeof useColors>;
  onPress?: () => void;
  highlighted?: boolean;
  onLayout?: (y: number) => void;
}) {
  const isCancelledSession = session.sessionStatus === "cancelled";
  const effectiveAttendanceStatus = session.attendanceStatus || "pending";
  const attendanceColor = ATTENDANCE_MAP[effectiveAttendanceStatus]?.text || colors.primary;
  const borderColor = isCancelledSession ? "#d1d5db" : "#dceceb";

  return (
    <TouchableOpacity
      activeOpacity={0.82}
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress?.(); }}
      onLayout={highlighted && onLayout ? (e) => onLayout(e.nativeEvent.layout.y) : undefined}
      style={[styles.sessionCard, {
        backgroundColor: highlighted ? SCHEDULE_AQUA_SOFT + "80" : colors.card,
        borderRadius: colors.radius + 4,
        borderWidth: highlighted ? 1.5 : 1,
        borderColor: highlighted ? SCHEDULE_AQUA : borderColor,
        opacity: isCancelledSession ? 0.65 : 1,
      }]}
    >
      <View style={styles.sessionTop}>
        <View style={[styles.sessionTimeBadge, { backgroundColor: (isCancelledSession ? "#9ca3af" : SCHEDULE_AQUA) + "15" }]}>
          <Text style={[styles.sessionTimeText, { color: isCancelledSession ? "#9ca3af" : SCHEDULE_AQUA }]}>{session.startTime}</Text>
          <Text style={[styles.sessionTimeEnd, { color: (isCancelledSession ? "#9ca3af" : SCHEDULE_AQUA) + "90" }]}>{session.endTime}</Text>
        </View>

        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: colors.foreground }}>{session.classCode || session.className}</Text>
            {session.isTestSession && (
              <View style={{ backgroundColor: "#fef3c7", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                <Text style={{ fontSize: 10, fontFamily: "Inter_600SemiBold", color: "#92400e" }}>Kiểm tra</Text>
              </View>
            )}
          </View>

          {session.locationName ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
              <Feather name="map-pin" size={11} color="#6f9699" />
              <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: SCHEDULE_AQUA_DARK }}>{session.locationName}</Text>
            </View>
          ) : null}

          {session.teacherNames && session.teacherNames.length > 0 ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 }}>
              <Feather name="user" size={11} color="#6f9699" />
              <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: SCHEDULE_AQUA_DARK, flex: 1 }} numberOfLines={2}>
                {session.teacherNames.join(", ")}
              </Text>
            </View>
          ) : null}

          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 5, flexWrap: "wrap" }}>
            {session.student?.name ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Feather name="user" size={11} color={SCHEDULE_AQUA} />
                <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: SCHEDULE_AQUA }}>
                  {session.student.name}
                </Text>
              </View>
            ) : null}
            {session.enrolledCount != null ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Feather name="users" size={11} color={colors.mutedForeground} />
                <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
                  Sĩ số: {session.enrolledCount}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 }}>
            {isCancelledSession ? (
              <View style={{ backgroundColor: "#fee2e2", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 }}>
                <Text style={{ color: "#991b1b", fontSize: 12, fontFamily: "Inter_600SemiBold" }}>Đã huỷ</Text>
              </View>
            ) : session.attendanceStatus ? (
              <AttendanceBadge status={session.attendanceStatus} />
            ) : null}
            {!isCancelledSession ? (() => {
              const _isOnline = session.learningFormat === "online" || !!session.onlineLink;
              return (
                <View style={{ backgroundColor: _isOnline ? "#e6f4ff" : SCHEDULE_AQUA_SOFT, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
                  <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: _isOnline ? "#2a6d9c" : SCHEDULE_AQUA }}>
                    {_isOnline ? "Online" : (session.learningFormat === "hybrid" ? "Hybrid" : "Offline")}
                  </Text>
                </View>
              );
            })() : null}
            <Feather name="chevron-right" size={15} color={colors.mutedForeground} style={{ marginLeft: "auto" }} />
          </View>

          {(() => {
            const _isOnline = session.learningFormat === "online" || !!session.onlineLink;
            if (isCancelledSession || !_isOnline || !session.onlineLink) return null;
            const datePart = session.sessionDate ? session.sessionDate.split("T")[0] : "";
            const startDT = datePart && session.startTime
              ? new Date(`${datePart}T${session.startTime}:00`)
              : null;
            const endDT = datePart && session.endTime
              ? new Date(`${datePart}T${session.endTime}:00`)
              : null;
            const joinOpenDT = startDT ? new Date(startDT.getTime() - 15 * 60000) : null;
            const now = new Date();
            const notYetOpen = joinOpenDT ? now < joinOpenDT : (startDT ? now < startDT : false);
            const alreadyEnded = endDT ? now > endDT : false;
            const canJoin = !notYetOpen && !alreadyEnded;
            const joinOpenLabel = joinOpenDT
              ? `${String(joinOpenDT.getHours()).padStart(2, "0")}:${String(joinOpenDT.getMinutes()).padStart(2, "0")}`
              : session.startTime;
            return (
              <View style={{ marginTop: 8, flexDirection: "row", alignItems: "center", gap: 8 }}>
                <TouchableOpacity
                  activeOpacity={canJoin ? 0.78 : 1}
                  disabled={!canJoin}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    if (canJoin && session.onlineLink) Linking.openURL(session.onlineLink);
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 5,
                  backgroundColor: canJoin ? SCHEDULE_AQUA : "#9ca3af",
                    paddingVertical: 6,
                    paddingHorizontal: 12,
                    borderRadius: 20,
                  }}
                >
                  <MaterialCommunityIcons name="video-outline" size={13} color="#fff" />
                  <Text style={{ color: "#fff", fontSize: 12, fontFamily: "Inter_600SemiBold" }}>Vào học online</Text>
                </TouchableOpacity>
                {!canJoin && (
                  <Text style={{ fontSize: 11, color: "#ef4444", fontFamily: "Inter_400Regular" }}>
                    Mở lúc {joinOpenLabel}
                  </Text>
                )}
              </View>
            );
          })()}
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Staff session card ───────────────────────────────────────────────────────

function StaffSessionCard({
  session,
  colors,
  highlighted,
  onLayout,
}: {
  session: StaffSession;
  colors: ReturnType<typeof useColors>;
  highlighted?: boolean;
  onLayout?: (y: number) => void;
}) {
  const isCancelled = session.sessionStatus === "cancelled";
  const accentColor = isCancelled ? "#ef4444" : colors.primary;

  return (
    <TouchableOpacity
      activeOpacity={0.82}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push(`/session-detail/${session.classSessionId}`);
      }}
      onLayout={highlighted && onLayout ? (e) => onLayout(e.nativeEvent.layout.y) : undefined}
      style={[styles.sessionCard, {
        backgroundColor: highlighted ? colors.primary + "10" : colors.card,
        borderRadius: colors.radius + 4,
        borderLeftWidth: 4,
        borderLeftColor: highlighted ? colors.primary : accentColor,
        borderWidth: highlighted ? 1.5 : undefined,
        borderColor: highlighted ? colors.primary : undefined,
        opacity: isCancelled ? 0.65 : 1,
      }]}
    >
      <View style={styles.sessionTop}>
        <View style={[styles.sessionTimeBadge, { backgroundColor: accentColor + "15" }]}>
          <Text style={[styles.sessionTimeText, { color: accentColor }]}>{session.startTime}</Text>
          <Text style={[styles.sessionTimeEnd, { color: accentColor + "90" }]}>{session.endTime}</Text>
        </View>

        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: colors.foreground }}>{session.className}</Text>
            {session.sessionIndex != null ? (
              <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>· Buổi {session.sessionIndex}</Text>
            ) : null}
            {session.isTestSession ? (
              <View style={{ backgroundColor: "#fef3c7", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                <Text style={{ fontSize: 10, fontFamily: "Inter_600SemiBold", color: "#92400e" }}>Kiểm tra</Text>
              </View>
            ) : null}
          </View>

          {session.locationName ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
              <Feather name="map-pin" size={11} color="#555" />
              <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: "#111" }}>{session.locationName}</Text>
            </View>
          ) : null}

          {session.enrolledCount != null ? (
            <View style={{ gap: 3, marginTop: 4 }}>
              {(() => {
                const total = session.enrolledCount ?? 0;
                const pending = session.attendancePendingCount ?? 0;
                const attended = total - pending;
                const reviewed = session.reviewedCount;
                return (
                  <>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Feather name="users" size={11} color={colors.mutedForeground} />
                      <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
                        Sĩ số: {total}
                      </Text>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Feather name="check-circle" size={11} color="#10b981" />
                      <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
                        Đã điểm danh ({attended}/{total})
                      </Text>
                    </View>
                    {reviewed != null && (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        <Feather name="message-circle" size={11} color="#8b5cf6" />
                        <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
                          Đã nhận xét ({reviewed}/{total})
                        </Text>
                      </View>
                    )}
                  </>
                );
              })()}
            </View>
          ) : null}

          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            {isCancelled ? (
              <View style={{ backgroundColor: "#fee2e2", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
                <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#991b1b" }}>Đã huỷ</Text>
              </View>
            ) : (
              <View style={{ backgroundColor: "#dcfce7", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
                <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#166534" }}>Đang diễn ra</Text>
              </View>
            )}

            {(() => {
              const _isOnline = session.learningFormat === "online" || !!session.onlineLink;
              return (
                <View style={{ backgroundColor: _isOnline ? "#dbeafe" : "#f0f9ff", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
                  <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: _isOnline ? "#1d4ed8" : "#0369a1" }}>
                    {_isOnline ? "Online" : "Offline"}
                  </Text>
                </View>
              );
            })()}

            <View style={{ marginLeft: "auto" }}>
              <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
            </View>
          </View>

          {(() => {
            const _isOnline = session.learningFormat === "online" || !!session.onlineLink;
            if (isCancelled || !_isOnline || !session.onlineLink) return null;
            const datePart = session.sessionDate ? session.sessionDate.split("T")[0] : "";
            const startDT = datePart && session.startTime ? new Date(`${datePart}T${session.startTime}:00`) : null;
            const endDT = datePart && session.endTime ? new Date(`${datePart}T${session.endTime}:00`) : null;
            const joinOpenDT = startDT ? new Date(startDT.getTime() - 15 * 60000) : null;
            const now = new Date();
            const notYetOpen = joinOpenDT ? now < joinOpenDT : (startDT ? now < startDT : false);
            const alreadyEnded = endDT ? now > endDT : false;
            const canJoin = !notYetOpen && !alreadyEnded;
            const joinOpenLabel = joinOpenDT
              ? `${String(joinOpenDT.getHours()).padStart(2, "0")}:${String(joinOpenDT.getMinutes()).padStart(2, "0")}`
              : session.startTime;
            return (
              <View style={{ marginTop: 8, flexDirection: "row", alignItems: "center", gap: 8 }}>
                <TouchableOpacity
                  activeOpacity={canJoin ? 0.78 : 1}
                  disabled={!canJoin}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    if (canJoin && session.onlineLink) Linking.openURL(session.onlineLink);
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 5,
                    backgroundColor: canJoin ? "#1d4ed8" : "#4b5563",
                    paddingVertical: 6,
                    paddingHorizontal: 12,
                    borderRadius: 20,
                  }}
                >
                  <MaterialCommunityIcons name="video-outline" size={13} color="#fff" />
                  <Text style={{ color: "#fff", fontSize: 12, fontFamily: "Inter_600SemiBold" }}>Vào dạy online</Text>
                </TouchableOpacity>
                {!canJoin && (
                  <Text style={{ fontSize: 11, color: "#ef4444", fontFamily: "Inter_400Regular" }}>
                    Mở lúc {joinOpenLabel}
                  </Text>
                )}
              </View>
            );
          })()}
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ScheduleScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, isLoading: authLoading } = useAuth();
  const isStaff = user?.role === "staff" || user?.role === "teacher" || user?.role === "admin";

  const today = new Date();
  const todayYMD = toYMD(today);

  const topPad = insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : 0;

  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState(todayYMD);

  const [daysWithSessions, setDaysWithSessions] = useState<Set<string>>(new Set());
  const [loadingMonth, setLoadingMonth] = useState(false);

  // Student state
  const [daySchedule, setDaySchedule] = useState<DaySchedule | null>(null);
  const [loadingDay, setLoadingDay] = useState(false);

  // In-memory cache: "YYYY-MM" → Set of date strings that have sessions
  const monthDotsCache = useRef<Map<string, Set<string>>>(new Map());

  // Version counters — only the latest request's result is committed.
  // Prevents stale parallel fetches (e.g. initial-mount fetch for today racing
  // with a deeplink fetch for a future date) from overwriting correct data.
  const studentDayFetchVersion = useRef(0);
  const staffDayFetchVersion = useRef(0);

  // Staff state — all sessions for the month, then filter by selected date
  const [staffSessions, setStaffSessions] = useState<StaffSession[]>([]);

  // Staff day state — detailed sessions for selected date (includes enrolledCount, onlineLink)
  const [staffDaySessions, setStaffDaySessions] = useState<StaffSession[]>([]);
  const [loadingStaffDay, setLoadingStaffDay] = useState(false);

  const [refreshing, setRefreshing] = useState(false);

  const { date: deepLinkDate, classId: deepLinkClassId, sessionId: deepLinkSessionId } = useLocalSearchParams<{ date?: string; classId?: string; sessionId?: string }>();
  const [activeHighlightDate, setActiveHighlightDate] = useState<string | null>(null);
  const [activeHighlightClassId, setActiveHighlightClassId] = useState<string | null>(null);
  const scheduleScrollRef = useRef<ScrollView>(null);
  const isAutoScrollingRef = useRef(false);

  const [calendarMode, setCalendarMode] = useState<0 | 1 | 2>(0);
  const calendarModeRef = useRef<0 | 1 | 2>(0);
  const heightAnim = useRef(new Animated.Value(ROW_HEIGHT)).current;

  const selectedDateRef = useRef(selectedDate);
  const viewYearRef = useRef(viewYear);
  const viewMonthRef = useRef(viewMonth);
  useEffect(() => { selectedDateRef.current = selectedDate; }, [selectedDate]);
  useEffect(() => { viewYearRef.current = viewYear; }, [viewYear]);
  useEffect(() => { viewMonthRef.current = viewMonth; }, [viewMonth]);

  const days = useMemo(() => getDaysInMonth(viewYear, viewMonth), [viewYear, viewMonth]);
  const firstWeekday = days[0].getDay();
  const leadingBlanks = firstWeekday === 0 ? 6 : firstWeekday - 1;
  const totalRows = Math.ceil((leadingBlanks + days.length) / 7);

  const selectedFlatIdx = useMemo(() => {
    const d = parseYMD(selectedDate);
    if (d.getFullYear() !== viewYear || d.getMonth() !== viewMonth) return 0;
    return leadingBlanks + (d.getDate() - 1);
  }, [selectedDate, viewYear, viewMonth, leadingBlanks]);

  const selectedRow = Math.floor(selectedFlatIdx / 7);

  const modeToHeight = useCallback((mode: 0 | 1 | 2) => {
    if (mode === 0) return ROW_HEIGHT;
    if (mode === 1) return ROW_HEIGHT * Math.min(2, totalRows);
    return ROW_HEIGHT * totalRows;
  }, [totalRows]);

  const setMode = useCallback((newMode: 0 | 1 | 2) => {
    calendarModeRef.current = newMode;
    setCalendarMode(newMode);
    Animated.spring(heightAnim, {
      toValue: modeToHeight(newMode),
      useNativeDriver: false,
      tension: 80,
      friction: 10,
    }).start();
    Haptics.selectionAsync();
  }, [heightAnim, modeToHeight]);

  useEffect(() => { setMode(0); }, [viewYear, viewMonth]);

  const calendarNavRef = useRef({
    navigateDays: (days: number) => {
      const d = parseYMD(selectedDateRef.current);
      d.setDate(d.getDate() + days);
      selectedDateRef.current = toYMD(d);
      setSelectedDate(toYMD(d));
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
      Haptics.selectionAsync();
    },
    navigateMonth: (delta: number) => {
      let m = viewMonthRef.current + delta;
      let y = viewYearRef.current;
      if (m < 0) { m = 11; y--; }
      if (m > 11) { m = 0; y++; }
      viewMonthRef.current = m;
      viewYearRef.current = y;
      setViewMonth(m);
      setViewYear(y);
      Haptics.selectionAsync();
    },
  });

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) =>
        (Math.abs(gs.dy) > 10 || Math.abs(gs.dx) > 10) &&
        (Math.abs(gs.dy) > 5 || Math.abs(gs.dx) > 5),
      onPanResponderRelease: (_, gs) => {
        const isHoriz = Math.abs(gs.dx) > Math.abs(gs.dy);
        if (isHoriz) {
          const dir = gs.dx < -30 ? 1 : gs.dx > 30 ? -1 : 0;
          if (dir === 0) return;
          const mode = calendarModeRef.current;
          if (mode === 2) {
            calendarNavRef.current.navigateMonth(dir);
          } else {
            const weeks = mode === 1 ? 2 : 1;
            calendarNavRef.current.navigateDays(dir * weeks * 7);
          }
        } else {
          if (gs.dy > 30) {
            const next = Math.min(2, calendarModeRef.current + 1) as 0 | 1 | 2;
            if (next !== calendarModeRef.current) setMode(next);
          } else if (gs.dy < -30) {
            const prev = Math.max(0, calendarModeRef.current - 1) as 0 | 1 | 2;
            if (prev !== calendarModeRef.current) setMode(prev);
          }
        }
      },
    })
  ).current;

  const visibleDays = useMemo(() => {
    const all: (Date | null)[] = [
      ...Array.from({ length: leadingBlanks }, () => null),
      ...days,
    ];
    if (calendarMode === 0) {
      const start = selectedRow * 7;
      return all.slice(start, start + 7);
    }
    if (calendarMode === 1) {
      const start = selectedRow * 7;
      return all.slice(start, start + 14);
    }
    return all;
  }, [calendarMode, days, leadingBlanks, selectedRow]);

  // ── Fetch functions ──────────────────────────────────────────────────────────

  const fetchStaffMonth = useCallback(async (year: number, month: number) => {
    setLoadingMonth(true);
    const monthStr = `${year}-${String(month + 1).padStart(2, "0")}`;
    try {
      const data = await apiGet<StaffMonthResponse>(`/api/mobile/staff/calendar?month=${monthStr}`);
      setStaffSessions(Array.isArray(data.sessions) ? data.sessions : []);
      if (Array.isArray(data.datesWithSessions)) {
        setDaysWithSessions(new Set(data.datesWithSessions.filter(Boolean).map((d) => d.split("T")[0])));
      }
    } catch {
      setStaffSessions([]);
      setDaysWithSessions(new Set());
    } finally {
      setLoadingMonth(false);
    }
  }, []);

  const fetchStaffDay = useCallback(async (dateYMD: string, silent = false) => {
    const version = ++staffDayFetchVersion.current;
    if (!silent) {
      setLoadingStaffDay(true);
      setStaffDaySessions([]);
    }
    try {
      const data = await apiGet<{ date: string; sessions: StaffSession[] }>(`/api/mobile/staff/calendar/day?date=${dateYMD}`);
      if (version !== staffDayFetchVersion.current) return; // superseded by a newer request
      setStaffDaySessions(Array.isArray(data.sessions) ? data.sessions : []);
    } catch {
      if (version !== staffDayFetchVersion.current) return;
      setStaffDaySessions([]);
    } finally {
      if (version === staffDayFetchVersion.current) setLoadingStaffDay(false);
    }
  }, []);

  const fetchStudentMonthDots = useCallback(async (year: number, month: number, forceRefresh = false) => {
    const monthStr = `${year}-${String(month + 1).padStart(2, "0")}`;

    if (!forceRefresh && monthDotsCache.current.has(monthStr)) {
      setDaysWithSessions(monthDotsCache.current.get(monthStr)!);
      return;
    }

    setLoadingMonth(true);
    try {
      const data = await apiGet<{ month: string; datesWithSessions: string[] }>(
        `/api/mobile/student/calendar/month?month=${monthStr}`
      );
      if (Array.isArray(data.datesWithSessions)) {
        const dots = new Set(data.datesWithSessions.filter(Boolean).map((d) => d.split("T")[0]));
        monthDotsCache.current.set(monthStr, dots);
        setDaysWithSessions(dots);
      }
    } catch {
      setDaysWithSessions(new Set());
    } finally {
      setLoadingMonth(false);
    }
  }, []);

  const fetchStudentDay = useCallback(async (dateYMD: string, silent = false) => {
    const version = ++studentDayFetchVersion.current;
    if (!silent) setLoadingDay(true);
    try {
      const data = await apiGet<DaySchedule>(`/api/mobile/student/calendar/day?date=${dateYMD}`);
      if (version !== studentDayFetchVersion.current) return; // superseded by a newer request

      // Deduplicate sessions by unique key to prevent React duplicate-key errors
      if (data.sessions) {
        const seen = new Set<string>();
        data.sessions = data.sessions.filter((s) => {
          const k = s.classSessionId || s.testSessionId || `${s.sessionDate}-${s.startTime}-${s.className}`;
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
      }

      setDaySchedule(data);
    } catch {
      if (version !== studentDayFetchVersion.current) return;
      setDaySchedule({ date: dateYMD, sessions: [] });
    } finally {
      if (version === studentDayFetchVersion.current) setLoadingDay(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading || !user) return;
    if (isStaff) {
      fetchStaffMonth(viewYear, viewMonth);
    } else {
      fetchStudentMonthDots(viewYear, viewMonth);
    }
  }, [viewYear, viewMonth, isStaff, authLoading, user?.id, user?.centerUrl]);

  useEffect(() => {
    if (authLoading || !user) return;
    if (!isStaff) fetchStudentDay(selectedDate);
  }, [selectedDate, isStaff, authLoading, user?.id, user?.centerUrl]);

  useEffect(() => {
    if (authLoading || !user) return;
    if (isStaff) fetchStaffDay(selectedDate);
  }, [selectedDate, isStaff, authLoading, user?.id, user?.centerUrl]);

  // Session data is user- and center-scoped. Never reuse month dots after
  // switching accounts or centers.
  useEffect(() => {
    monthDotsCache.current.clear();
    setDaysWithSessions(new Set());
  }, [user?.id, user?.centerUrl]);

  useEffect(() => {
    if (deepLinkDate) {
      selectDate(deepLinkDate);
      setActiveHighlightDate(deepLinkDate);
    }
    // Prefer sessionId (= classSessionId) for accurate highlight; fall back to classId
    const highlightId = deepLinkSessionId ?? deepLinkClassId;
    if (highlightId) setActiveHighlightClassId(highlightId);
  }, [deepLinkDate, deepLinkSessionId, deepLinkClassId]);

  // Tracks whether this screen is currently in focus.
  // Used by the live deeplink listener to decide whether to handle the deeplink
  // directly (focused → useFocusEffect won't re-fire) or leave the store intact
  // (not focused → useFocusEffect will fire on focus and consume the store).
  const isFocusedRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      isFocusedRef.current = true;
      const dl = popCalendarDeeplink();
      if (dl?.date) {
        selectDate(dl.date);
        setActiveHighlightDate(dl.date);
      }
      // Prefer sessionId (= classSessionId) for accurate highlight; fall back to classId
      const highlightId = dl?.sessionId ?? dl?.classId;
      if (highlightId) setActiveHighlightClassId(highlightId);
      // Use refs instead of stale closure values — prevents a race where useFocusEffect
      // fires before the live-listener's selectDate() state update is committed, which
      // would cause it to fetch today's sessions instead of the deeplink date's sessions.
      const targetDate = dl?.date ?? selectedDateRef.current;
      if (isStaff) {
        // When the deeplink is to a different month, fetch that month's dots — not the
        // currently-visible month (which the regular viewMonth useEffect already handles).
        const dlDate = dl?.date ? parseYMD(dl.date) : null;
        fetchStaffMonth(
          dlDate ? dlDate.getFullYear() : viewYearRef.current,
          dlDate ? dlDate.getMonth()    : viewMonthRef.current,
        );
        fetchStaffDay(targetDate, true);
      } else {
        fetchStudentDay(targetDate, true);
      }
      return () => {
        isFocusedRef.current = false;
        setActiveHighlightDate(null);
        setActiveHighlightClassId(null);
      };
    }, [isStaff, fetchStaffMonth, fetchStaffDay, fetchStudentDay])
  );

  // ── Live deeplink listener ─────────────────────────────────────────────────
  // Handles the case where router.navigate() targets an already-focused tab —
  // useFocusEffect won't re-fire in that situation, so the listener acts directly.
  //
  // KEY RULE: when focused, apply the deeplink effects but call
  // markCalendarDeeplinkHandled() instead of popCalendarDeeplink().
  //
  // WHY: on web, navigating from /(tabs)/schedule → /notifications does NOT
  // trigger useFocusEffect's blur callback, so isFocusedRef.current stays true
  // while the user is on the notifications screen.  If the listener then called
  // popCalendarDeeplink() it would clear the store before router.navigate() causes
  // the schedule tab to re-mount.  The new instance's useFocusEffect would find
  // an empty store and fall back to today's date instead of the notification date.
  //
  // markCalendarDeeplinkHandled() leaves the store value intact but flips a flag.
  // popCalendarDeeplink() (called by useFocusEffect on any re-mounted instance)
  // sees the flag, clears the store, and returns null — no stale re-application.
  const _liveDeeplinkRef = useRef<((dl: CalendarDeeplink) => void) | null>(null);
  // Update ref every render so the stable listener always calls latest logic.
  useEffect(() => {
    _liveDeeplinkRef.current = (dl: CalendarDeeplink) => {
      // If the screen is not currently focused, useFocusEffect will fire when it
      // gains focus and will read the store itself — do nothing here.
      if (!isFocusedRef.current) return;

      // Mark as handled WITHOUT clearing the store.
      // If router.navigate causes the screen to re-mount (web behaviour),
      // the new instance's useFocusEffect will call popCalendarDeeplink(),
      // see the "already handled" flag, and return null — so it won't
      // re-apply a stale deeplink and jump to the wrong date.
      markCalendarDeeplinkHandled();
      if (dl.date) {
        selectedDateRef.current = dl.date;
        selectDate(dl.date);
        setActiveHighlightDate(dl.date);
      }
      const highlightId = dl.sessionId ?? dl.classId;
      if (highlightId) setActiveHighlightClassId(highlightId);
      if (isStaff) fetchStaffDay(dl.date ?? selectedDateRef.current, true);
      else fetchStudentDay(dl.date ?? selectedDateRef.current, true);
    };
  });
  // Register stable wrapper once on mount.
  useEffect(() => {
    const handler = (dl: CalendarDeeplink) => _liveDeeplinkRef.current?.(dl);
    onCalendarDeeplink(handler);
    return () => offCalendarDeeplink(handler);
  }, []);

  const handleSessionHighlightLayout = useCallback((y: number) => {
    isAutoScrollingRef.current = true;
    setTimeout(() => {
      scheduleScrollRef.current?.scrollTo({ y: Math.max(0, y - 60), animated: true });
      setTimeout(() => { isAutoScrollingRef.current = false; }, 800);
    }, 350);
  }, []);

  const goMonth = (delta: number) => {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    setViewMonth(m);
    setViewYear(y);
    Haptics.selectionAsync();
  };

  const selectDate = (ymd: string) => {
    setSelectedDate(ymd);
    Haptics.selectionAsync();
    const d = parseYMD(ymd);
    if (d.getFullYear() !== viewYear || d.getMonth() !== viewMonth) {
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    if (isStaff) {
      await Promise.all([fetchStaffMonth(viewYear, viewMonth), fetchStaffDay(selectedDate, true)]);
    } else {
      await Promise.all([fetchStudentMonthDots(viewYear, viewMonth, true), fetchStudentDay(selectedDate, true)]);
    }
    setRefreshing(false);
  };

  // Sessions to display for selected date — prefer day API (has enrolledCount & onlineLink)
  const sessionsForDay: StaffSession[] = useMemo(() => {
    if (!isStaff) return [];
    if (staffDaySessions.length > 0) {
      return [...staffDaySessions].sort((a, b) => a.startTime.localeCompare(b.startTime));
    }
    return staffSessions
      .filter((s) => extractDateStr(s.sessionDate) === selectedDate)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [isStaff, staffDaySessions, staffSessions, selectedDate]);

  const selectedDateObj = parseYMD(selectedDate);
  const selectedDisplayStr = selectedDateObj.toLocaleDateString("vi-VN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <View style={{ flex: 1, backgroundColor: SCHEDULE_PAGE_TINT }}>
      <View
        style={[styles.header, { paddingTop: topPad + 16, backgroundColor: SCHEDULE_AQUA_SOFT }]}
        {...panResponder.panHandlers}
      >
        <View style={styles.monthNav}>
          <TouchableOpacity onPress={() => goMonth(-1)} style={styles.navBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="chevron-left" size={22} color={SCHEDULE_AQUA_DARK} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setMode(calendarMode === 2 ? 0 : 2)}>
            <Text style={styles.monthTitle}>{MONTH_NAMES[viewMonth]}, {viewYear}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => goMonth(1)} style={styles.navBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="chevron-right" size={22} color={SCHEDULE_AQUA_DARK} />
          </TouchableOpacity>
        </View>

        <View style={styles.weekLabels}>
          {WEEKDAY_DISPLAY.map((d) => (
            <Text key={d} style={styles.weekLabel}>{d}</Text>
          ))}
        </View>

        <Animated.View style={{ height: heightAnim, overflow: "hidden" }}>
          <View style={styles.calendarGrid}>
            {visibleDays.map((d, i) => {
              if (d === null) return <View key={`b-${i}`} style={styles.dayCell} />;
              const ymd = toYMD(d);
              const isToday = ymd === todayYMD;
              const isSelected = ymd === selectedDate;
              const hasSessions = daysWithSessions.has(ymd)
                || (
                  ymd === selectedDate
                  && (
                    isStaff
                      ? sessionsForDay.some((session) => extractDateStr(session.sessionDate) === ymd)
                      : extractDateStr(daySchedule?.date ?? "") === ymd && !!daySchedule?.sessions.length
                  )
                );
              return (
                <TouchableOpacity
                  key={ymd}
                  style={[
                    styles.dayCell,
                    isSelected && { backgroundColor: "#ffffffb8", borderWidth: 1, borderColor: SCHEDULE_AQUA, borderRadius: 10 },
                    isToday && !isSelected && { borderWidth: 1.5, borderColor: "#72aaa8", borderRadius: 10 },
                  ]}
                  onPress={() => selectDate(ymd)}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    styles.dayNum,
                    isSelected && { color: SCHEDULE_AQUA_DARK, fontFamily: "Inter_700Bold" },
                    isToday && !isSelected && { color: SCHEDULE_AQUA_DARK, fontFamily: "Inter_600SemiBold" },
                    !isSelected && !isToday && { color: "#527b80" },
                  ]}>
                    {d.getDate()}
                  </Text>
                  {hasSessions ? <View style={styles.sessionDot} /> : <View style={{ width: 5, height: 5 }} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </Animated.View>

        <TouchableOpacity
          style={styles.dragHandle}
          onPress={() => setMode(calendarMode === 2 ? 0 : ((calendarMode + 1) as 0 | 1 | 2))}
          hitSlop={{ top: 6, bottom: 10, left: 40, right: 40 }}
        >
          <View style={styles.dragPill} />
          <Feather
            name={calendarMode === 2 ? "chevron-up" : "chevron-down"}
            size={13}
            color="#6f9699"
          />
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={scheduleScrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 100 + bottomPad, paddingHorizontal: 16, paddingTop: 14 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} progressBackgroundColor={colors.card} />}
        onScroll={() => {
          if (activeHighlightDate && !isAutoScrollingRef.current) setActiveHighlightDate(null);
        }}
        scrollEventThrottle={400}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <Feather name="calendar" size={15} color={SCHEDULE_AQUA} />
          <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.foreground, flex: 1, textTransform: "capitalize" }}>
            {selectedDisplayStr}
          </Text>
          {(loadingMonth || loadingStaffDay) && <ActivityIndicator size="small" color={SCHEDULE_AQUA} />}
        </View>

        {/* Staff view */}
        {isStaff ? (
          loadingStaffDay ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 13, marginTop: 8 }}>Đang tải lịch dạy...</Text>
            </View>
          ) : sessionsForDay.length === 0 ? (
            <View style={styles.emptyBox}>
              <MaterialCommunityIcons name="calendar-blank-outline" size={48} color={colors.mutedForeground} />
              <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_500Medium", fontSize: 15, marginTop: 10 }}>Không có lịch dạy</Text>
              <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 13, marginTop: 4 }}>Ngày này không có buổi dạy nào</Text>
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              {sessionsForDay.map((s, idx) => {
                const isFirst = idx === 0;
                const matchesClassId = !!activeHighlightClassId && s.classSessionId === activeHighlightClassId;
                const isHighlighted = !!activeHighlightDate && activeHighlightDate === selectedDate && (
                  activeHighlightClassId ? matchesClassId : isFirst
                );
                return (
                  <StaffSessionCard
                    key={s.classSessionId}
                    session={s}
                    colors={colors}
                    highlighted={isHighlighted}
                    onLayout={isHighlighted ? handleSessionHighlightLayout : undefined}
                  />
                );
              })}
            </View>
          )
        ) : (
          /* Student view */
          loadingDay ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 13, marginTop: 8 }}>Đang tải lịch học...</Text>
            </View>
          ) : !daySchedule || daySchedule.sessions.length === 0 ? (
            <View style={styles.emptyBox}>
              <MaterialCommunityIcons name="calendar-blank-outline" size={48} color={colors.mutedForeground} />
              <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_500Medium", fontSize: 15, marginTop: 10 }}>Không có lịch học</Text>
              <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 13, marginTop: 4 }}>Ngày này không có buổi học nào</Text>
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              {daySchedule.sessions.map((s, idx) => {
                const sessionNavId = s.classSessionId || s.testSessionId || "";
                const sessionKey = sessionNavId || `${s.sessionDate}-${s.startTime}-${s.className}`;
                const isFirst = idx === 0;
                // If a classId deeplink param is present, highlight the matching session;
                // otherwise fall back to highlighting the first session of the day.
                const matchesClassId = !!activeHighlightClassId && (
                  s.classSessionId === activeHighlightClassId
                );
                const isHighlighted = !!activeHighlightDate && activeHighlightDate === selectedDate && (
                  activeHighlightClassId ? matchesClassId : isFirst
                );
                return (
                  <StudentSessionCard
                    key={sessionKey}
                    session={s}
                    colors={colors}
                    highlighted={isHighlighted}
                    onLayout={isHighlighted ? handleSessionHighlightLayout : undefined}
                    onPress={() => router.push({
                      pathname: `/session-detail/[id]` as any,
                      params: {
                        id: sessionNavId,
                        sessionDate: extractDateStr(s.sessionDate),
                        isStudent: "1",
                        isTestSession: s.isTestSession ? "1" : "0",
                      },
                    })}
                  />
                );
              })}
            </View>
          )
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  monthNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  navBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    backgroundColor: "#ffffff99",
  },
  monthTitle: {
    color: SCHEDULE_AQUA_DARK,
    fontSize: 17,
    fontFamily: "Inter_700Bold",
  },
  weekLabels: {
    flexDirection: "row",
    marginBottom: 2,
  },
  weekLabel: {
    flex: 1,
    textAlign: "center",
    color: "#6b9294",
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  dayCell: {
    width: `${100 / 7}%`,
    height: ROW_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  dayNum: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#527b80",
  },
  sessionDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: SCHEDULE_SESSION_DOT,
    borderWidth: 1,
    borderColor: "#ffffff",
  },
  dragHandle: {
    alignItems: "center",
    paddingVertical: 8,
    gap: 2,
  },
  dragPill: {
    width: 32,
    height: 3,
    borderRadius: 2,
    backgroundColor: "#6f969966",
    marginBottom: 2,
  },
  sessionCard: {
    padding: 14,
    // Keep the same soft teal-tinted elevation as Modern Cards detail cards.
    boxShadow: "0px 3px 9px rgba(25,91,99,0.07)",
  },
  sessionTop: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  sessionTimeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: "center",
    minWidth: 58,
  },
  sessionTimeText: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  sessionTimeEnd: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  loadingBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
});
