import { Feather } from "@expo/vector-icons";
import { useFocusEffect, router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import Svg, { Circle } from "react-native-svg";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "@/hooks/useSafeAreaInsets";

import { StatCard } from "@/components/StatCard";
import NewsFeedSection from "@/components/NewsFeedSection";
import PromotionsSection from "@/components/PromotionsSection";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { usePermissions } from "@/hooks/usePermissions";
import { apiGet } from "@/lib/api";

interface Notification {
  id: string;
  title: string;
  content: string;
  type: string;
  category: string;
  isRead: boolean;
  referenceId: string;
  referenceType: string;
  createdAt: string;
  isSelf?: boolean;
  student?: { id: string; fullName: string; code: string } | null;
}

interface StudentNotifResponse {
  items: Notification[];
  totalUnread: number;
  limit: number;
  offset: number;
}

interface ParentNotificationsResponse {
  items: Notification[];
  totalUnread: number;
  limit: number;
  offset: number;
}

interface StudentSession {
  classSessionId: string;
  className: string;
  classCode?: string;
  locationName?: string;
  startTime: string;
  endTime: string;
  sessionStatus?: string;
  learningFormat?: string;
  teacherNames: string[];
  attendanceStatus: string;
  student?: { name: string; code: string };
}

interface StaffSession {
  classSessionId: string;
  className: string;
  locationName: string;
  startTime: string;
  endTime: string;
  enrolledCount: number;
  pendingCount: number;
}

interface DayScheduleResponse {
  date: string;
  sessions: StudentSession[];
}

interface ScheduleResponse {
  userType: "student" | "staff";
  date: string;
  sessions: StudentSession[] | StaffSession[];
}

interface EnrolledClass {
  classId: string;
  attendedSessions: number;
}

interface AssignmentRowStat {
  classId?: string;
  submissionStatus?: string;
}

interface AssignmentStatResponse {
  rows: AssignmentRowStat[];
}

interface StarResponse {
  available: number;
}

interface StaffDashboardStats {
  classCount: number;
  tasks: { done: number; total: number };
  sessions: { taught: number; total: number };
}

interface LinkedStudent {
  enrolledClasses: EnrolledClass[];
}

interface ParentProfileResponse {
  parent: { fullName: string; code: string };
  linkedStudents: LinkedStudent[];
}

interface QuickAccessItem {
  id: string;
  title: string;
  icon: string;
  iconBg: string;
  iconColor: string;
  accentColor: string;
  route?: string;
  disabled?: boolean;
  adminOnly?: boolean;
}

const QUICK_CARD_WIDTH = 88;
const QUICK_CARD_GAP   = 10;

// Thứ tự: chẵn = hàng 1 (top), lẻ = hàng 2 (bottom)
// Hàng 1: Bài tập/Kiểm tra | Bảng điểm | Lương đứng lớp | Xin nghỉ
// Hàng 2: HV sắp hết lịch  | Lớp sắp kết thúc | Hoá đơn | Tổng lương
const STAFF_QUICK_ACCESS: QuickAccessItem[] = [
  { id: "homework-exam",     title: "Bài tập\nKiểm tra",  icon: "edit-3",      iconBg: "#eff6ff", iconColor: "#2563eb", accentColor: "#2563eb", route: "/staff-assignments" },
  { id: "expiring-students", title: "HV sắp\nhết lịch",   icon: "clock",       iconBg: "#fff7ed", iconColor: "#ea580c", accentColor: "#ea580c", route: "/staff-expiring-students" },
  { id: "grades",            title: "Bảng điểm",          icon: "bar-chart-2", iconBg: "#f0fdf4", iconColor: "#16a34a", accentColor: "#16a34a", route: "/staff-grade-books" },
  { id: "ending-classes",    title: "Lớp sắp\nkết thúc",  icon: "flag",        iconBg: "#fdf4ff", iconColor: "#9333ea", accentColor: "#9333ea", route: "/staff-ending-classes" },
  { id: "class-salary",      title: "Lương\nđứng lớp",    icon: "briefcase",   iconBg: "#eff6ff", iconColor: "#0284c7", accentColor: "#0284c7", route: "/staff-class-salary" },
  { id: "invoices",          title: "Hoá đơn",            icon: "file-text",   iconBg: "#fef9c3", iconColor: "#d97706", accentColor: "#d97706", route: "/invoices" },
  { id: "leave-request",     title: "Xin nghỉ",           icon: "calendar",    iconBg: "#fff7ed", iconColor: "#ea580c", accentColor: "#ea580c", route: "/staff-leave-requests" },
  { id: "salary-summary",    title: "Tổng lương",         icon: "dollar-sign", iconBg: "#f0fdf4", iconColor: "#059669", accentColor: "#059669", route: "/staff-salary-summary" },
  { id: "dashboard",         title: "Dashboard",          icon: "bar-chart-2", iconBg: "#f5f3ff", iconColor: "#6c63ff", accentColor: "#6c63ff", route: "/dashboard", adminOnly: true },
];

// Lối tắt nhanh cho học viên
const STUDENT_SHORTCUTS = [
  { id: "schedule",  title: "Lịch học",   icon: "calendar",    iconBg: "#eff6ff", iconColor: "#2563eb", route: "/(tabs)/schedule" },
  { id: "homework",  title: "BTVN",        icon: "book-open",   iconBg: "#fef3c7", iconColor: "#d97706", route: "/(tabs)/homework" },
  { id: "grades",    title: "Bảng điểm",  icon: "bar-chart-2", iconBg: "#f0fdf4", iconColor: "#16a34a", route: "/(tabs)/grades" },
  { id: "invoices",  title: "Hoá đơn",    icon: "file-text",   iconBg: "#fef9c3", iconColor: "#ca8a04", route: "/invoices" },
  { id: "absence",   title: "Xin nghỉ",   icon: "x-circle",    iconBg: "#fef2f2", iconColor: "#ef4444", route: "/student-leave-requests" },
];

const CATEGORY_COLORS: Record<string, string> = {
  schedule: "#3b82f6",
  finance: "#f59e0b",
  attendance: "#ef4444",
  homework: "#f59e0b",
  exam: "#ef4444",
  announcement: "#8b5cf6",
};

/** Trả về true nếu thông báo KHÔNG liên quan đến chat — dùng để lọc carousel trang chủ */
function isNotChatNotification(n: Notification): boolean {
  if (n.type === "chat") return false;
  const rt = (n.referenceType ?? "").toLowerCase();
  if (rt === "class_chat" || rt === "group_chat" || rt === "p2p" || rt.includes("chat")) return false;
  return true;
}

const ATTENDANCE_MAP: Record<string, { bg: string; text: string; label: string }> = {
  pending:               { bg: "#f3f4f6", text: "#6b7280", label: "Chưa điểm danh" },
  present:               { bg: "#dcfce7", text: "#166534", label: "Có học" },
  absent:                { bg: "#fee2e2", text: "#991b1b", label: "Nghỉ học" },
  absent_makeup:         { bg: "#fff7ed", text: "#c2410c", label: "Nghỉ chờ bù" },
  absent_pending_makeup: { bg: "#fff7ed", text: "#c2410c", label: "Nghỉ chờ bù" },
  makeup:                { bg: "#dbeafe", text: "#1d4ed8", label: "Đã học bù" },
  makeup_done:           { bg: "#dbeafe", text: "#1d4ed8", label: "Đã học bù" },
  reserved:              { bg: "#fef9c3", text: "#854d0e", label: "Bảo lưu" },
  late:                  { bg: "#fef3c7", text: "#92400e", label: "Đi trễ" },
};

function timeAgo(dateStr: string): string {
  const now = new Date();
  const d = new Date(dateStr);
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return `${diffMins} phút trước`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} giờ trước`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} ngày trước`;
}

function formatLearningFormat(f: string) {
  if (f === "offline") return "Offline";
  if (f === "online") return "Online";
  return f;
}

function AttendanceBadge({ status }: { status: string }) {
  const s = ATTENDANCE_MAP[status] || ATTENDANCE_MAP.pending;
  return (
    <View style={{ backgroundColor: s.bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 }}>
      <Text style={{ color: s.text, fontSize: 11, fontFamily: "Inter_500Medium" }}>{s.label}</Text>
    </View>
  );
}

function NotificationCarouselCard({
  n,
  colors,
  cardWidth,
}: {
  n: Notification;
  colors: ReturnType<typeof useColors>;
  cardWidth: number;
}) {
  const dotColor = CATEGORY_COLORS[n.category] || colors.primary;
  const studentName = n.student?.fullName;

  return (
    <TouchableOpacity
      activeOpacity={0.78}
      onPress={() => router.push("/notifications")}
      style={[
        styles.notifCarouselCard,
        {
          width: cardWidth,
          backgroundColor: n.isRead ? colors.card : colors.primary + "08",
          borderColor: n.isRead ? colors.border : colors.primary + "35",
          borderRadius: colors.radius,
        },
      ]}
    >
      {/* Top row: category pill + unread dot */}
      <View style={styles.notifCardTopRow}>
        <View style={[styles.notifCategoryPill, { backgroundColor: dotColor + "18" }]}>
          <View style={[styles.notifCategoryDot, { backgroundColor: dotColor }]} />
          <Text style={[styles.notifCategoryText, { color: dotColor }]}>
            {n.category === "schedule"
              ? "Lịch học"
              : n.category === "finance"
              ? "Hoá đơn"
              : n.category === "attendance"
              ? "Điểm danh"
              : n.category === "homework"
              ? "Bài tập"
              : n.category === "exam"
              ? "Kiểm tra"
              : "Thông báo"}
          </Text>
        </View>
        {!n.isRead && (
          <View style={[styles.notifUnreadDot, { backgroundColor: colors.primary }]} />
        )}
      </View>

      {/* Student name (parent view) */}
      {studentName && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 3 }}>
          <Feather name="user" size={10} color={colors.primary} />
          <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: colors.primary }} numberOfLines={1}>
            {studentName}
          </Text>
        </View>
      )}

      {/* Title */}
      <Text style={[styles.notifCardTitle, { color: colors.foreground }]} numberOfLines={1}>
        {n.title}
      </Text>

      {/* Content — max 2 lines */}
      {n.content ? (
        <Text style={[styles.notifCardContent, { color: colors.mutedForeground }]} numberOfLines={2}>
          {n.content}
        </Text>
      ) : null}

      {/* Footer: time */}
      <View style={styles.notifCardFooter}>
        <Feather name="clock" size={11} color={colors.mutedForeground} />
        <Text style={[styles.notifCardTime, { color: colors.mutedForeground }]}>
          {timeAgo(n.createdAt)}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function sessionTimeToMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0);
}

function getAutoScheduleIndex(sessions: Array<{ startTime: string; endTime: string }>): number {
  if (sessions.length === 0) return 0;

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const activeIndex = sessions.findIndex((session) => {
    const start = sessionTimeToMinutes(session.startTime);
    const end = sessionTimeToMinutes(session.endTime);
    return nowMinutes >= start && nowMinutes < end;
  });

  if (activeIndex >= 0) return activeIndex;

  const upcomingIndex = sessions.findIndex(
    (session) => nowMinutes < sessionTimeToMinutes(session.startTime),
  );
  return upcomingIndex >= 0 ? upcomingIndex : sessions.length - 1;
}

function ProgressRing({
  progress,
  label,
  colors,
}: {
  progress: number;
  label: string;
  colors: ReturnType<typeof useColors>;
}) {
  const size = 64;
  const strokeWidth = 4;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const safeProgress = Math.min(100, Math.max(0, progress));

  return (
    <View style={[styles.progressRing, { width: size, height: size }]}>
      <Svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={StyleSheet.absoluteFillObject}
      >
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke="rgba(255,255,255,0.18)"
          strokeWidth={strokeWidth}
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke={colors.accent}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference - (safeProgress / 100) * circumference}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <Text style={styles.progressRingValue}>{label}</Text>
    </View>
  );
}

function CompletionCelebration({ colors }: { colors: ReturnType<typeof useColors> }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse]);

  const scale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.92, 1.08],
  });
  const rotate = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: ["-6deg", "6deg"],
  });

  return (
    <View style={styles.celebrationWrap}>
      <Animated.View style={[styles.celebrationStar, styles.celebrationStarTop, { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }) }]}>
        <Feather name="star" size={13} color={colors.accent} />
      </Animated.View>
      <Animated.View style={[styles.celebrationStar, styles.celebrationStarSide, { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.55] }) }]}>
        <Feather name="star" size={10} color={colors.gradientEnd} />
      </Animated.View>
      <Animated.View style={[styles.celebrationCore, { backgroundColor: colors.gradientStart, transform: [{ scale }, { rotate }] }]}>
        <Feather name="award" size={30} color={colors.foreground} />
      </Animated.View>
    </View>
  );
}

function TodayScheduleSection({
  schedule,
  loadingSchedule,
  isStaff,
  colors,
}: {
  schedule: ScheduleResponse | null;
  loadingSchedule: boolean;
  isStaff: boolean;
  colors: ReturnType<typeof useColors>;
}) {
  const sessions = schedule?.sessions ?? [];
  const tabsRef = useRef<ScrollView>(null);
  const [activeIndex, setActiveIndex] = useState(() => getAutoScheduleIndex(sessions));

  useEffect(() => {
    setActiveIndex(getAutoScheduleIndex(sessions));
  }, [schedule?.date, sessions.length]);

  useEffect(() => {
    if (sessions.length === 0) return;

    const updateActiveTab = () => {
      setActiveIndex(getAutoScheduleIndex(sessions));
    };
    updateActiveTab();
    const timer = setInterval(updateActiveTab, 30_000);
    return () => clearInterval(timer);
  }, [schedule?.date, sessions]);

  useEffect(() => {
    if (sessions.length === 0) return;
    tabsRef.current?.scrollTo({
      x: Math.max(0, activeIndex * 72 - 90),
      animated: true,
    });
  }, [activeIndex, sessions.length]);

  const selectedSession = sessions[activeIndex] ?? sessions[0];

  return (
    <View style={[styles.section, styles.scheduleSection]}>
      <View style={styles.sectionRow}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={styles.sectionAccentBar} />
          <Text style={[styles.sectionTitle, { color: colors.foreground, marginBottom: 0 }]}>
            Lịch học hôm nay{sessions.length > 0 ? ` (${sessions.length})` : ""}
          </Text>
        </View>
        <TouchableOpacity onPress={() => router.push("/(tabs)/schedule" as any)} activeOpacity={0.7}>
          <Text style={[styles.scheduleSeeAll, { color: colors.primary }]}>Xem tất cả</Text>
        </TouchableOpacity>
      </View>

      {loadingSchedule ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      ) : sessions.length === 0 || !selectedSession ? (
        <View style={[styles.emptyBox, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
          <Feather name="calendar" size={20} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Không có lịch học hôm nay</Text>
        </View>
      ) : (
        <>
          <ScrollView
            ref={tabsRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.scheduleTabsContent}
          >
            {sessions.map((session, index) => {
              const isActive = index === activeIndex;
              return (
                <TouchableOpacity
                  key={`${session.classSessionId}-${index}`}
                  activeOpacity={0.8}
                  onPress={() => setActiveIndex(index)}
                  style={[
                    styles.scheduleTab,
                    {
                      backgroundColor: isActive ? colors.primary : colors.card,
                      borderColor: isActive ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text style={[styles.scheduleTabText, { color: isActive ? colors.card : colors.mutedForeground }]}>
                    {session.startTime}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <TouchableOpacity
            activeOpacity={0.86}
            onPress={() => router.push("/(tabs)/schedule" as any)}
            style={[styles.scheduleFocusCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <View style={[styles.scheduleFocusAccent, { backgroundColor: colors.primary }]} />
            <View style={styles.scheduleFocusBody}>
              {isStaff ? (
                <Text style={[styles.schedulePerson, { color: colors.mutedForeground }]}>Lớp học</Text>
              ) : (selectedSession as StudentSession).student?.name ? (
                <Text style={[styles.schedulePerson, { color: colors.mutedForeground }]}>
                  {(selectedSession as StudentSession).student?.name}
                </Text>
              ) : null}

              <View style={styles.scheduleFocusTitleRow}>
                <View style={styles.scheduleFocusTitleWrap}>
                  <Text style={[styles.scheduleFocusTitle, { color: colors.foreground }]} numberOfLines={1}>
                    {isStaff
                      ? (selectedSession as StaffSession).className
                      : (selectedSession as StudentSession).classCode || (selectedSession as StudentSession).className}
                  </Text>
                  {!isStaff && (selectedSession as StudentSession).classCode && (
                    <Text style={[styles.scheduleFocusSubtitle, { color: colors.mutedForeground }]} numberOfLines={1}>
                      {(selectedSession as StudentSession).className}
                    </Text>
                  )}
                </View>
                <View style={[styles.scheduleTimePill, { backgroundColor: colors.secondary }]}>
                  <Text style={[styles.scheduleTimeStart, { color: colors.primary }]}>{selectedSession.startTime}</Text>
                  <Text style={[styles.scheduleTimeEnd, { color: colors.mutedForeground }]}>{selectedSession.endTime}</Text>
                </View>
              </View>

              <View style={styles.scheduleInfoRow}>
                <Feather name="map-pin" size={15} color={colors.foreground} />
                <Text style={[styles.scheduleInfoText, { color: colors.foreground }]} numberOfLines={1}>
                  {selectedSession.locationName || "Chưa cập nhật địa điểm"}
                </Text>
              </View>

              {isStaff ? (
                <View style={styles.scheduleInfoRow}>
                  <Feather name="users" size={15} color={colors.foreground} />
                  <Text style={[styles.scheduleInfoText, { color: colors.foreground }]} numberOfLines={1}>
                    {(selectedSession as StaffSession).enrolledCount} học viên
                    {(selectedSession as StaffSession).pendingCount > 0
                      ? ` · ${(selectedSession as StaffSession).pendingCount} chờ điểm danh`
                      : ""}
                  </Text>
                </View>
              ) : (
                <View style={styles.scheduleInfoRow}>
                  <Feather name="user" size={15} color={colors.foreground} />
                  <Text style={[styles.scheduleInfoText, { color: colors.foreground }]} numberOfLines={1}>
                    {(selectedSession as StudentSession).teacherNames?.join(", ") || "Chưa cập nhật giáo viên"}
                  </Text>
                </View>
              )}

              <View style={styles.scheduleStatusRow}>
                {!isStaff && <AttendanceBadge status={(selectedSession as StudentSession).attendanceStatus} />}
                {isStaff && (selectedSession as StaffSession).pendingCount > 0 && (
                  <View style={[styles.scheduleStatusPill, { backgroundColor: colors.warning + "20" }]}>
                    <Text style={[styles.scheduleStatusText, { color: colors.warning }]}>Cần điểm danh</Text>
                  </View>
                )}
                <View style={[styles.scheduleModePill, { backgroundColor: colors.muted }]}>
                  <Text style={[styles.scheduleModeText, { color: colors.mutedForeground }]}>
                    {isStaff ? "Offline" : formatLearningFormat((selectedSession as StudentSession).learningFormat ?? "")}
                  </Text>
                </View>
              </View>
            </View>

          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

export default function HomeScreen() {
  const colors = useColors();
  const { user, permissions } = useAuth();
  const perms = usePermissions();
  const insets = useSafeAreaInsets();

  const { width: screenWidth } = useWindowDimensions();
  // 2 cards visible: (screenWidth - 20*2 padding - 10 gap) / 2
  const NOTIF_CARD_WIDTH = Math.floor((screenWidth - 50) / 2);
  const NOTIF_CARD_GAP = 10;

  const [quickExpanded, setQuickExpanded] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [schedule, setSchedule] = useState<ScheduleResponse | null>(null);
  const [loadingNotifs, setLoadingNotifs] = useState(true);
  const [loadingSchedule, setLoadingSchedule] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [parentProfile, setParentProfile] = useState<ParentProfileResponse | null>(null);
  const [studentStats, setStudentStats] = useState<{ classes: number; done: number; total: number } | null>(null);
  const [studentStars, setStudentStars] = useState<number | null>(null);
  const [staffStats, setStaffStats] = useState<StaffDashboardStats | null>(null);

  const topPad = insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : 0;

  const today = new Date();
  const dateStr = today.toLocaleDateString("vi-VN", { weekday: "long", day: "numeric", month: "long" });

  const fetchNotifications = async () => {
    try {
      const isStaffRole = user?.role === "staff" || user?.role === "teacher" || user?.role === "admin";
      if (user?.role === "parent") {
        const data = await apiGet<ParentNotificationsResponse>("/api/mobile/parent/notifications?limit=10&offset=0");
        const list = Array.isArray(data?.items) ? data.items : [];
        setUnreadCount(data?.totalUnread ?? 0);
        setNotifications(list.filter(isNotChatNotification).slice(0, 10));
      } else if (isStaffRole) {
        const data = await apiGet<StudentNotifResponse>("/api/mobile/staff/notifications?limit=10&offset=0");
        const list = Array.isArray(data?.items) ? data.items : [];
        setUnreadCount(data?.totalUnread ?? 0);
        setNotifications(list.filter(isNotChatNotification).slice(0, 10));
      } else {
        const data = await apiGet<StudentNotifResponse>("/api/mobile/student/notifications?limit=10&offset=0");
        const list = Array.isArray(data?.items) ? data.items : [];
        setUnreadCount(data?.totalUnread ?? 0);
        setNotifications(list.filter(isNotChatNotification).slice(0, 10));
      }
    } catch {
      setNotifications([]);
      setUnreadCount(0);
    } finally {
      setLoadingNotifs(false);
    }
  };

  const fetchSchedule = async () => {
    try {
      const isStaffRole = user?.role === "staff" || user?.role === "teacher" || user?.role === "admin";
      if (isStaffRole) {
        const data = await apiGet<ScheduleResponse>("/api/mobile/schedule/today");
        setSchedule(data);
      } else {
        const today = new Date().toISOString().split("T")[0];
        const data = await apiGet<DayScheduleResponse>(`/api/mobile/student/calendar/day?date=${today}`);
        setSchedule({ userType: "student", date: data.date, sessions: data.sessions });
      }
    } catch {
      setSchedule(null);
    } finally {
      setLoadingSchedule(false);
    }
  };

  const fetchParentProfile = async () => {
    try {
      const data = await apiGet<ParentProfileResponse>("/api/mobile/parent/profile");
      setParentProfile(data);
    } catch {
      setParentProfile(null);
    }
  };

  const fetchStudentStats = async () => {
    try {
      const month = new Date().toISOString().slice(0, 7);
      const data = await apiGet<AssignmentStatResponse>(
        `/api/mobile/student/assignments?month=${month}&pageSize=200`
      );
      const rows = data.rows ?? [];
      const classIds = new Set(rows.map((r) => r.classId).filter(Boolean));
      const done = rows.filter(
        (r) => r.submissionStatus === "submitted" || r.submissionStatus === "graded"
      ).length;
      setStudentStats({ classes: classIds.size, done, total: rows.length });
    } catch {
      setStudentStats(null);
    }
  };

  const fetchStudentStars = async () => {
    try {
      const data = await apiGet<StarResponse>("/api/mobile/student/stars");
      setStudentStars(data.available ?? 0);
    } catch {
      setStudentStars(null);
    }
  };

  const fetchStaffStats = async () => {
    // Thử endpoint tổng hợp riêng trước (nếu trung tâm có)
    try {
      const data = await apiGet<StaffDashboardStats>("/api/mobile/staff/dashboard-stats");
      setStaffStats(data);
      return;
    } catch {}

    // Fallback: tổng hợp từ đúng các API mà các trang khác đang dùng
    try {
      const month = new Date().toISOString().slice(0, 7);
      const today = new Date().toISOString().split("T")[0];

      const [kanbanResult, salaryResult, calendarResult] = await Promise.allSettled([
        // Trang Công việc dùng endpoint này
        apiGet<any>("/api/mobile/tasks/kanban"),
        // Trang Lương đứng lớp dùng endpoint này
        apiGet<any[]>("/api/mobile/staff/payroll/salary-summary"),
        // Trang Lịch dùng endpoint này — không cần publish lương
        apiGet<any>(`/api/mobile/staff/calendar?month=${month}`),
      ]);

      // Công việc: đếm tổng và hoàn thành từ kanban (giống trang Công việc)
      let taskDone = 0;
      let taskTotal = 0;
      if (kanbanResult.status === "fulfilled") {
        const columns: any[] = kanbanResult.value?.columns ?? [];
        const allTasks = columns.flatMap((col: any) => col.tasks ?? []);
        taskTotal = allTasks.length;
        taskDone = columns
          .filter((col: any) => col.status?.name === "Hoàn thành")
          .flatMap((col: any) => col.tasks ?? []).length;
      }

      // Lớp học: từ bảng lương gần nhất (giống trang Lương đứng lớp)
      let classCount = 0;
      if (salaryResult.status === "fulfilled") {
        const tables: any[] = salaryResult.value ?? [];
        if (tables.length > 0) {
          classCount = tables[0].classes?.length ?? 0;
        }
      }

      // Đã dạy: đếm buổi đã qua trong tháng từ calendar (giống trang Lịch, không cần publish lương)
      let taughtSessions = 0;
      let totalSessions = 0;
      if (calendarResult.status === "fulfilled") {
        const sessions: any[] = calendarResult.value?.sessions ?? [];
        totalSessions = sessions.length;
        taughtSessions = sessions.filter((s: any) => (s.sessionDate ?? "") <= today).length;
      }

      setStaffStats({
        classCount,
        tasks: { done: taskDone, total: taskTotal },
        sessions: { taught: taughtSessions, total: totalSessions },
      });
    } catch {
      setStaffStats(null);
    }
  };

  const loadAll = useCallback(async () => {
    const tasks: Promise<void>[] = [fetchNotifications(), fetchSchedule()];
    if (user?.role === "parent") tasks.push(fetchParentProfile());
    else if (user?.role === "staff" || user?.role === "teacher" || user?.role === "admin") {
      tasks.push(fetchStaffStats());
    } else {
      tasks.push(fetchStudentStats(), fetchStudentStars());
    }
    await Promise.all(tasks);
  }, [user?.role]);

  useFocusEffect(
    useCallback(() => {
      loadAll();
      // Thu gọn grid khi quay lại màn hình
      return () => { setQuickExpanded(false); };
    }, [loadAll])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    setLoadingNotifs(true);
    setLoadingSchedule(true);
    await loadAll();
    setRefreshing(false);
  };

  const isStaffRole = user?.role === "staff" || user?.role === "teacher" || user?.role === "admin";
  const isStaff = isStaffRole || schedule?.userType === "staff";
  const nextSession = schedule?.sessions[0];
  const pendingAssignments = studentStats ? Math.max(studentStats.total - studentStats.done, 0) : 0;
  const nextActionDone = isStaffRole ? (staffStats?.tasks.done ?? 0) : (studentStats?.done ?? 0);
  const nextActionTotal = isStaffRole ? (staffStats?.tasks.total ?? 0) : (studentStats?.total ?? 0);
  const nextActionPending = Math.max(nextActionTotal - nextActionDone, 0);
  const nextActionPercent = nextActionTotal > 0
    ? Math.round((nextActionDone / nextActionTotal) * 100)
    : 0;
  const hasCompletedAllAssignments =
    user?.role === "student" &&
    !!studentStats &&
    studentStats.total > 0 &&
    studentStats.done >= studentStats.total;
  const nextActionRoute = isStaffRole
    ? "/(tabs)/tasks"
    : user?.role === "parent"
      ? "/(tabs)/schedule"
      : "/(tabs)/homework";
  const nextActionTitle = isStaffRole
    ? "Hoàn thành công việc"
    : user?.role === "parent"
      ? "Theo dõi lịch học"
      : hasCompletedAllAssignments
        ? "Tuyệt vời!"
        : "Hoàn thành BTVN";
  const nextActionCopy = isStaffRole
    ? nextActionTotal > 0
      ? `Còn ${nextActionPending} việc, bạn đã hoàn thành ${nextActionDone} việc rồi.`
      : "Mở danh sách công việc để xem việc cần làm."
    : user?.role === "parent"
      ? nextSession
        ? `${nextSession.className} · ${nextSession.startTime}`
        : "Mở lịch để xem hoạt động hôm nay."
        : hasCompletedAllAssignments
          ? `Bạn đã hoàn thành tất cả ${studentStats?.total ?? 0} bài trong tháng này.`
      : studentStats
        ? `Còn ${pendingAssignments} bài, bạn đã hoàn thành ${studentStats.done} bài rồi.`
        : "Đang cập nhật tiến độ bài tập của bạn.";
  const todayProgress = isStaffRole
    ? staffStats ? `${staffStats.tasks.done}/${staffStats.tasks.total}` : "—"
    : studentStats ? `${studentStats.done}/${studentStats.total}` : "—";
  const avatarLetter = (user?.username || "U")[0].toUpperCase();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Status bar cover — prevents scroll content from bleeding into the system status bar */}
      <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, height: insets.top, backgroundColor: "#6c63ff", zIndex: 10 }} />
    {/* ── Fixed header + stats — stays on screen while content scrolls under ── */}
    <View
      style={[styles.header, { paddingTop: topPad + 16, backgroundColor: "#6c63ff" }]}
    >
      <View style={styles.headerRow}>
        <View style={styles.userInfo}>
          {/* Avatar with white ring */}
          <View style={styles.avatarWrapper}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>{avatarLetter}</Text>
            </View>
            <View style={styles.onlineDot} />
          </View>
          <View>
            <Text style={styles.dateText}>{dateStr}</Text>
            <Text style={styles.userName}>
              Chào, {user?.name || user?.username || "bạn"}!
            </Text>
          </View>
        </View>

        <TouchableOpacity style={styles.bellBtn} onPress={() => router.push("/notifications")} activeOpacity={0.8}>
          <Feather name="bell" size={22} color="#ffffff" />
          {unreadCount > 0 && (
            <View style={styles.bellBadge}>
              <Text style={styles.bellBadgeText}>{unreadCount > 99 ? "99+" : unreadCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
      <View style={styles.todayStrip}>
        <View style={{ flex: 1 }}>
          <Text style={styles.todayStripTitle}>Hôm nay có gì mới?</Text>
          <Text style={styles.todayStripSubtitle}>
            {loadingSchedule
              ? "Đang cập nhật lịch học..."
              : nextSession
                ? `${schedule?.sessions.length ?? 0} buổi học trong ngày`
                : "Bạn không có lịch học hôm nay"}
          </Text>
        </View>
        <View style={styles.todayProgress}>
          <Text style={styles.todayProgressValue}>{todayProgress}</Text>
          <Text style={styles.todayProgressLabel}>{isStaffRole ? "công việc" : "BT xong"}</Text>
        </View>
      </View>
    </View>

    <View style={[styles.statsRow, { marginTop: -20 }]}>
      <View style={[styles.statsCard, { backgroundColor: colors.background, borderRadius: colors.radius + 4 }]}>
        {user?.role === "parent" ? (
          <>
            <StatCard
              icon={<Feather name="users" size={20} color={colors.primary} />}
              label="Học viên"
              value={parentProfile ? String(parentProfile.linkedStudents.length) : "—"}
              color={colors.primary}
            />
            <StatCard
              icon={<Feather name="book-open" size={20} color={colors.success} />}
              label="Lớp học"
              value={parentProfile ? String(parentProfile.linkedStudents.reduce((sum, s) => sum + s.enrolledClasses.length, 0)) : "—"}
              color={colors.success}
            />
            <StatCard
              icon={<Feather name="check-circle" size={20} color={colors.warning} />}
              label="Buổi đã học"
              value={parentProfile ? String(parentProfile.linkedStudents.reduce((sum, s) => sum + s.enrolledClasses.reduce((a, c) => a + c.attendedSessions, 0), 0)) : "—"}
              color={colors.warning}
            />
          </>
        ) : user?.role === "staff" || user?.role === "teacher" || user?.role === "admin" ? (
          <>
            <StatCard
              icon={<Feather name="book-open" size={20} color={colors.primary} />}
              label="Lớp học"
              value={staffStats ? String(staffStats.classCount) : "—"}
              color={colors.primary}
            />
            <StatCard
              icon={<Feather name="check-circle" size={20} color={colors.success} />}
              label="Công việc"
              value={staffStats ? `${staffStats.tasks.done}/${staffStats.tasks.total}` : "—"}
              color={colors.success}
            />
            <StatCard
              icon={<Feather name="star" size={20} color={colors.warning} />}
              label="Đã dạy"
              value={staffStats ? `${staffStats.sessions.taught}/${staffStats.sessions.total}` : "—"}
              color={colors.warning}
            />
          </>
        ) : (
          <>
            <StatCard
              icon={<Feather name="book-open" size={20} color={colors.primary} />}
              label="Lớp học"
              value={studentStats ? String(studentStats.classes) : "—"}
              color={colors.primary}
            />
            <StatCard
              icon={<Feather name="check-circle" size={20} color={colors.success} />}
              label="BT xong"
              value={studentStats ? `${studentStats.done}/${studentStats.total}` : "—"}
              color={colors.success}
            />
            <StatCard
              icon={<Feather name="star" size={20} color={colors.warning} />}
              label="Điểm sao"
              value={studentStars !== null ? String(studentStars) : "—"}
              color={colors.warning}
            />
          </>
        )}
      </View>
    </View>

    {/* ── Scrollable content — slides under fixed header + stats ── */}
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingBottom: 100 + bottomPad }}
      showsVerticalScrollIndicator={false}
      onScroll={(e) => { if (e.nativeEvent.contentOffset.y > 40) setQuickExpanded(false); }}
      scrollEventThrottle={16}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} progressBackgroundColor={colors.card} />}
    >

        {user?.role === "parent" && (
          <View style={styles.section}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => router.push("/parent-profile")}
              style={[styles.parentBanner, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "30", borderRadius: colors.radius }]}
            >
              <View style={[styles.parentBannerIcon, { backgroundColor: colors.primary + "20" }]}>
                <Feather name="users" size={22} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.parentBannerTitle, { color: colors.foreground }]}>Thông tin Học viên liên kết</Text>
                <Text style={[styles.parentBannerSub, { color: colors.mutedForeground }]}>Xem thông tin & học viên liên kết</Text>
              </View>
              <Feather name="chevron-right" size={18} color={colors.primary} />
            </TouchableOpacity>
          </View>
        )}

        <View style={[styles.section, styles.nextActionSection]}>
          <TouchableOpacity
            activeOpacity={0.86}
            onPress={() => router.push(nextActionRoute as any)}
            style={[styles.nextActionCard, { backgroundColor: colors.foreground }]}
          >
            <View style={styles.nextActionContent}>
              <View style={styles.nextActionKickerRow}>
                <Feather name="star" size={13} color={colors.accent} />
                <Text style={[styles.nextActionKicker, { color: colors.accent }]}>VIỆC TIẾP THEO</Text>
              </View>
              <Text style={[styles.nextActionTitle, { color: colors.card }]} numberOfLines={1}>
                {nextActionTitle}
              </Text>
              <Text style={[styles.nextActionCopy, { color: "rgba(255,255,255,0.72)" }]} numberOfLines={2}>
                {nextActionCopy}
              </Text>
              <View style={[styles.nextActionButton, { backgroundColor: colors.gradientStart }]}>
                <Text style={[styles.nextActionButtonText, { color: colors.foreground }]}>
                  {user?.role === "parent" ? "Xem lịch" : "Làm ngay"}
                </Text>
                <Feather name="arrow-right" size={14} color={colors.foreground} />
              </View>
            </View>
            <ProgressRing
              progress={nextActionPercent}
              label={user?.role === "parent" ? "→" : `${nextActionPercent}%`}
              colors={colors}
            />
          </TouchableOpacity>
        </View>

        <TodayScheduleSection
          schedule={schedule}
          loadingSchedule={loadingSchedule}
          isStaff={isStaff}
          colors={colors}
        />

        {(user?.role === "staff" || user?.role === "teacher" || user?.role === "admin") && (
          <View style={{ marginTop: 20, paddingHorizontal: 16 }}>
            <View style={[styles.quickAccessHeader, { paddingHorizontal: 0, marginBottom: 10 }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={styles.sectionAccentBar} />
                <Text style={[styles.sectionTitle, { color: colors.foreground, marginBottom: 0 }]}>Học vụ - Hành chính</Text>
              </View>
            </View>
            <View style={[styles.quickGrid, { backgroundColor: colors.card }]}>
              {(quickExpanded ? STAFF_QUICK_ACCESS : STAFF_QUICK_ACCESS.slice(0, 8)).map((it) => {
                // Map từng quick-access item sang permission flag tương ứng
                const permDisabled = (() => {
                  const ms = permissions?.features?.mySpace;
                  const f  = permissions?.features;
                  switch (it.id) {
                    case "homework-exam":     return ms ? !ms.assignments.canView : false;
                    case "grades":            return ms ? !ms.scoreSheet.canView  : false;
                    case "expiring-students": return f  ? !f.learningOverview.canView : false;
                    case "ending-classes":    return f  ? !f.learningOverview.canView : false;
                    case "class-salary":      return ms ? !ms.payroll.canView     : false;
                    case "invoices":          return ms ? !ms.invoices.canView    : false;
                    case "salary-summary":    return ms ? !ms.payroll.canView     : false;
                    case "dashboard":         return f
                      ? !f.dashboard.canView
                      : user?.role !== "admin";
                    default: return false;
                  }
                })();
                const isDisabled = it.disabled || permDisabled;
                return (
                <TouchableOpacity
                  key={it.id}
                  activeOpacity={isDisabled ? 1 : 0.7}
                  onPress={() => { if (!isDisabled && it.route) router.push(it.route as any); }}
                  style={[styles.quickGridItem, isDisabled && { opacity: 0.4 }]}
                >
                  <View style={[styles.quickIconWrap, { backgroundColor: it.iconBg }]}>
                    <Feather name={it.icon as any} size={22} color={it.iconColor} />
                  </View>
                  <Text style={[styles.quickLabel, { color: colors.foreground }]} numberOfLines={2}>{it.title}</Text>
                </TouchableOpacity>
                );
              })}
            </View>
            {STAFF_QUICK_ACCESS.length > 8 && (
              <TouchableOpacity
                onPress={() => setQuickExpanded(v => !v)}
                activeOpacity={0.8}
                style={[styles.expandBtn, { backgroundColor: "#6c63ff" }]}
              >
                <Feather name={quickExpanded ? "chevron-up" : "chevron-down"} size={18} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        )}

        {(user?.role === "student" || user?.role === "parent") && (
          <View style={{ marginTop: 24 }}>
            <View style={{ paddingHorizontal: 20, marginBottom: 10 }}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Lối tắt</Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              decelerationRate="fast"
              contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 4, gap: QUICK_CARD_GAP }}
            >
              {STUDENT_SHORTCUTS.map((it) => {
                // Kiểm tra quyền cho từng shortcut dựa vào API permissions
                // student/parent luôn được xem lịch; các mục còn lại check từ API permissions
                const permDisabled = (() => {
                  switch (it.id) {
                    case "schedule": return false; // student/parent luôn có quyền calendar
                    case "homework": return !perms.mySpaceAssignments;
                    case "grades":   return !perms.mySpaceScoreSheet;
                    case "invoices": return !perms.mySpaceInvoices;
                    default: return false;
                  }
                })();
                const isDisabled = !it.route || permDisabled;
                return (
                  <TouchableOpacity
                    key={it.id}
                    activeOpacity={isDisabled ? 1 : 0.75}
                    onPress={() => { if (!isDisabled) router.push(it.route as any); }}
                    style={[styles.quickCard, { backgroundColor: colors.card, borderColor: colors.border }, isDisabled && { opacity: 0.4 }]}
                  >
                    <View style={[styles.quickIconWrap, { backgroundColor: it.iconBg }]}>
                      <Feather name={it.icon as any} size={22} color={it.iconColor} />
                    </View>
                    <Text style={[styles.quickLabel, { color: colors.foreground }]} numberOfLines={2}>{it.title}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        <PromotionsSection />

        {/* Bảng tin — chỉ hiện khi có quyền canViewNewsFeed */}
        {perms.canViewNewsFeed && <NewsFeedSection />}


      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingBottom: 36,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  userInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatarWrapper: {
    position: "relative",
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2.5,
    borderColor: "rgba(255,255,255,0.7)",
  },
  avatarText: {
    color: "#ffffff",
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  onlineDot: {
    position: "absolute",
    bottom: 1,
    right: 1,
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: "#4ade80",
    borderWidth: 2,
    borderColor: "#ffffff",
  },
  userName: {
    color: "#ffffff",
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    marginTop: 2,
  },
  userCode: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  dateText: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textTransform: "capitalize",
  },
  bellBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.3)",
  },
  bellBadge: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#ef4444",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: "#ffffff",
  },
  bellBadgeText: {
    color: "#ffffff",
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    lineHeight: 12,
  },
  todayStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 20,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "rgba(35,27,117,0.26)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    borderRadius: 15,
  },
  todayStripTitle: {
    color: "#ffffff",
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  todayStripSubtitle: {
    marginTop: 3,
    color: "rgba(255,255,255,0.68)",
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  todayProgress: {
    alignItems: "flex-end",
  },
  todayProgressValue: {
    color: "#ffffff",
    fontSize: 20,
    fontFamily: "Inter_700Bold",
  },
  todayProgressLabel: {
    color: "rgba(255,255,255,0.68)",
    fontSize: 9,
    fontFamily: "Inter_400Regular",
  },
  statsRow: {
    paddingHorizontal: 16,
  },
  statsCard: {
    flexDirection: "row",
    gap: 8,
    padding: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  section: {
    paddingHorizontal: 20,
    marginTop: 24,
  },
  scheduleSection: {
    marginTop: 20,
  },
  scheduleSeeAll: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
  },
  scheduleTabsContent: {
    gap: 8,
    paddingHorizontal: 1,
    paddingBottom: 2,
  },
  scheduleTab: {
    minWidth: 62,
    height: 36,
    paddingHorizontal: 13,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 18,
    shadowColor: "#2c3159",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 7,
    elevation: 2,
  },
  scheduleTabText: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
  scheduleFocusCard: {
    position: "relative",
    minHeight: 140,
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 20,
    overflow: "hidden",
    shadowColor: "#2c3159",
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.1,
    shadowRadius: 15,
    elevation: 4,
  },
  scheduleFocusAccent: {
    height: 5,
    width: "100%",
  },
  scheduleFocusBody: {
    padding: 12,
    paddingBottom: 11,
  },
  schedulePerson: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 3,
  },
  scheduleFocusTitleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  scheduleFocusTitleWrap: {
    minWidth: 0,
    flex: 1,
    paddingTop: 2,
  },
  scheduleFocusTitle: {
    fontSize: 18,
    lineHeight: 22,
    fontFamily: "Inter_700Bold",
  },
  scheduleFocusSubtitle: {
    marginTop: 1,
    fontSize: 10,
    lineHeight: 13,
    fontFamily: "Inter_500Medium",
  },
  scheduleTimePill: {
    width: 66,
    minHeight: 52,
    paddingVertical: 6,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
  },
  scheduleTimeStart: {
    fontSize: 15,
    lineHeight: 18,
    fontFamily: "Inter_700Bold",
  },
  scheduleTimeEnd: {
    marginTop: 1,
    fontSize: 10,
    fontFamily: "Inter_500Medium",
  },
  scheduleInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  scheduleInfoText: {
    minWidth: 0,
    flex: 1,
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  scheduleStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 8,
  },
  scheduleStatusPill: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
  },
  scheduleStatusText: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
  },
  scheduleModePill: {
    marginLeft: "auto",
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
  },
  scheduleModeText: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
  },
  nextActionSection: {
    marginTop: 20,
  },
  nextActionCard: {
    width: "100%",
    minHeight: 140,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: 16,
    borderRadius: 20,
    overflow: "hidden",
    shadowColor: "#17264f",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 14,
    elevation: 5,
  },
  nextActionContent: {
    width: 0,
    minWidth: 0,
    flex: 1,
    alignItems: "flex-start",
  },
  nextActionKickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  nextActionKicker: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.1,
  },
  nextActionTitle: {
    maxWidth: "100%",
    marginTop: 5,
    fontSize: 17,
    lineHeight: 21,
    fontFamily: "Inter_700Bold",
  },
  nextActionCopy: {
    maxWidth: "100%",
    marginTop: 3,
    fontSize: 11,
    lineHeight: 15,
    fontFamily: "Inter_400Regular",
  },
  nextActionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 10,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 10,
  },
  nextActionButtonText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
  },
  progressRing: {
    position: "relative",
    flexShrink: 0,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
  },
  progressRingValue: {
    width: "100%",
    color: "#ffffff",
    fontSize: 14,
    lineHeight: 18,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    includeFontPadding: false,
  },
  nowCard: {
    padding: 16,
    borderRadius: 18,
    shadowColor: "#1f2b54",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 4,
  },
  nowEyebrow: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  nowTitle: {
    marginTop: 7,
    fontSize: 16,
    lineHeight: 21,
    fontFamily: "Inter_700Bold",
  },
  nowCopy: {
    marginTop: 5,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: "Inter_400Regular",
  },
  nowFoot: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 14,
  },
  nowTime: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  nowLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  nowLinkText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
  },
  quickAccessHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  expandBtn: {
    alignSelf: "center",
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 4,
  },
  quickCard: {
    width: QUICK_CARD_WIDTH,
    height: 110,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  quickGrid: {
    borderRadius: 18,
    flexDirection: "row",
    flexWrap: "wrap",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  quickGridItem: {
    width: "25%",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  quickIconWrap: {
    width: 50,
    height: 50,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  quickLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
    lineHeight: 15,
  },
  sectionAccentBar: {
    width: 4,
    height: 18,
    borderRadius: 2,
    backgroundColor: "#6c63ff",
  },
  sectionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    marginBottom: 12,
  },
  loadingBox: {
    padding: 20,
    alignItems: "center",
  },
  emptyBox: {
    padding: 20,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
    borderWidth: 1,
    borderColor: "transparent",
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  // ── Notification carousel ──
  notifSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  notifSeeAll: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  notifCarouselCard: {
    padding: 12,
    borderWidth: 1,
    gap: 6,
    // subtle shadow — boxShadow (not legacy shadow*/elevation) so Android's Fabric
    // renderer clips it to borderRadius instead of drawing a detached gray box.
    boxShadow: "0px 2px 6px rgba(0,0,0,0.06)",
  },
  notifCardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  notifCategoryPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    alignSelf: "flex-start",
  },
  notifCategoryDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  notifCategoryText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  notifUnreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  notifCardTitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    lineHeight: 18,
  },
  notifCardContent: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 17,
  },
  notifCardFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  notifCardTime: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  expandHint: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  classesContainer: {
    gap: 8,
  },
  parentBanner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderWidth: 1,
    gap: 12,
  },
  parentBannerIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  parentBannerTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  parentBannerSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  classItem: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    padding: 12,
    gap: 12,
  },
  classTime: {
    width: 68,
    padding: 8,
    alignItems: "center",
  },
  classTimeText: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  classTimeEnd: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  classSubject: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  classTeacher: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  classBadge: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
});
