import { Feather } from "@expo/vector-icons";
import { useFocusEffect, router } from "expo-router";
import * as Notifications from "expo-notifications";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "@/hooks/useSafeAreaInsets";

import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { apiGet, apiPatch } from "@/lib/api";
import { navigateDeeplink, DEEPLINK_ROUTES, type DeepLink } from "@/lib/deeplinkNavigator";

interface NotificationItem {
  id: string;
  title: string;
  content: string;
  type?: string | null;
  category: string;
  referenceId?: string | null;
  referenceType?: string | null;
  isRead: boolean;
  createdAt: string;
  deeplink?: DeepLink | null;
  isSelf?: boolean;
  student?: { id: string; fullName: string; code: string } | null;
}

interface StudentNotifResponse {
  items: NotificationItem[];
  totalUnread: number;
  limit: number;
  offset: number;
}

const CATEGORY_COLORS: Record<string, string> = {
  attendance:   "#ef4444",
  schedule:     "#3b82f6",
  class:        "#3b82f6",  // class info changes → Calendar
  review:       "#8b5cf6",  // teacher feedback → Calendar
  content:      "#3b82f6",  // nội dung buổi học → Calendar (cùng màu lịch)
  assignment:   "#10b981",  // BTVN → Assignments
  homework:     "#10b981",  // legacy alias → Assignments
  finance:      "#f59e0b",
  invoice:      "#f59e0b",  // alias của finance — backend có thể gửi cả hai
  general:      "#6b7280",  // no navigate
  task:         "#6b7280",  // no navigate
  exam:         "#ef4444",
  announcement: "#8b5cf6",
};

const CATEGORY_LABELS: Record<string, string> = {
  attendance:   "Điểm danh",
  schedule:     "Lịch học",
  class:        "Lớp học",
  review:       "Nhận xét",
  content:      "Nội dung",
  assignment:   "Bài tập",
  homework:     "Bài tập",
  finance:      "Hoá đơn",
  invoice:      "Hoá đơn",
  general:      "Thông báo",
  task:         "Thông báo",
  exam:         "Kiểm tra",
  announcement: "Thông báo",
};

// Filter tabs — chỉ hiện các category có deeplink hoặc hay gặp
const ALL_CATEGORIES = ["all", "attendance", "schedule", "content", "finance", "review"];

// Categories ẩn khỏi trang Thông báo (chỉ ẩn UI, không xoá dữ liệu)
const HIDDEN_CATEGORIES = ["chat"];

function timeAgo(dateStr: string): string {
  const now = new Date();
  const d = new Date(dateStr);
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Vừa xong";
  if (diffMins < 60) return `${diffMins} phút trước`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} giờ trước`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays} ngày trước`;
  return d.toLocaleDateString("vi-VN", { day: "numeric", month: "numeric", year: "numeric" });
}

function notificationPlainText(content: string): string {
  return content
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}


function NotifCard({
  item,
  colors,
  onRead,
}: {
  item: NotificationItem;
  colors: ReturnType<typeof useColors>;
  onRead: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  // So sánh chiều cao: text bị clamp (numberOfLines=3) vs text tự nhiên (không giới hạn).
  // Nếu naturalH > clampedH → text bị cắt → hiện "Xem thêm".
  // Đây là cách duy nhất đáng tin trên cả iOS và Android.
  const [clampedH, setClampedH] = useState(0);
  const [naturalH, setNaturalH] = useState(0);
  const isTruncated = naturalH > 0 && clampedH > 0 && naturalH > clampedH + 2;
  const plainContent = notificationPlainText(item.content || "");

  const dotColor = CATEGORY_COLORS[item.category] || colors.primary;
  const hasDeeplink = !!item.deeplink?.screen && !!DEEPLINK_ROUTES[item.deeplink.screen];

  // Khi text > 3 dòng bị cắt: disable outer card, inner "Xem thêm" TouchableOpacity hoạt động
  // độc lập (TouchableOpacity cha dùng capture phase nên phải disable mới chặn được).
  const needExpand = !expanded && isTruncated;

  // "Xem thêm" chỉ hiện khi text thực sự bị cắt bởi numberOfLines. Bấm = expand tại chỗ.
  // Không có navigate từ nút này. Navigate = bấm vào card (khi card không bị disable).
  const footerAction = needExpand ? (
    <TouchableOpacity
      onPress={() => { if (!item.isRead) onRead(item.id); setExpanded(true); }}
      style={styles.expandBtn}
    >
      <Text style={[styles.expandHint, { color: colors.primary }]}>Xem thêm</Text>
    </TouchableOpacity>
  ) : null;

  return (
    <TouchableOpacity
      activeOpacity={needExpand ? 1 : 0.78}
      disabled={needExpand}
      onPress={() => {
        if (!item.isRead) onRead(item.id);
        if (hasDeeplink) navigateDeeplink(item.deeplink);
      }}
      style={[
        styles.card,
        {
          backgroundColor: item.isRead ? colors.card : colors.primary + "08",
          borderColor: item.isRead ? colors.border : colors.primary + "35",
          borderRadius: colors.radius,
        },
      ]}
    >
      <View style={[styles.cardDot, { backgroundColor: dotColor }]} />
      <View style={{ flex: 1, gap: 3 }}>
        {item.student?.fullName && (
          <View style={styles.studentRow}>
            <View style={[styles.studentBadge, { backgroundColor: dotColor + "18" }]}>
              <Feather name="user" size={10} color={dotColor} />
              <Text style={[styles.studentBadgeText, { color: dotColor }]}>{item.student.fullName}</Text>
            </View>
          </View>
        )}
        {/* Hàng trên: category pill — thời gian — unread dot */}
        <View style={styles.cardTopRow}>
          <View style={[styles.categoryPill, { backgroundColor: dotColor + "15" }]}>
            <Text style={[styles.categoryPillText, { color: dotColor }]}>
              {CATEGORY_LABELS[item.category] || item.category}
            </Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={[styles.cardTime, { color: colors.mutedForeground }]}>{timeAgo(item.createdAt)}</Text>
            {!item.isRead && <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} />}
          </View>
        </View>
        <Text
          style={[styles.cardTitle, { color: colors.foreground }]}
          numberOfLines={expanded ? undefined : 2}
        >
          {item.title}
        </Text>
        {item.content ? (
          <View>
            {expanded ? (
              <Text style={[styles.cardContent, { color: colors.mutedForeground }]}>
                {plainContent}
              </Text>
            ) : (
              <>
                {/* Text hiển thị — bị clamp (preview only) */}
                <Text
                  style={[styles.cardContent, { color: colors.mutedForeground }]}
                  numberOfLines={3}
                  onLayout={(e) => setClampedH(e.nativeEvent.layout.height)}
                >
                  {plainContent}
                </Text>
                {/* Text ẩn — đo chiều cao tự nhiên để phát hiện truncation */}
                <Text
                  style={[styles.cardContent, {
                    color: "transparent",
                    position: "absolute",
                    top: 0, left: 0, right: 0,
                  }]}
                  pointerEvents="none"
                  onLayout={(e) => setNaturalH(e.nativeEvent.layout.height)}
                >
                  {plainContent}
                </Text>
              </>
            )}
          </View>
        ) : null}
        {/* "Xem thêm" chỉ hiện khi cần, căn phải */}
        {footerAction && (
          <View style={[styles.cardFooter, { justifyContent: "flex-end" }]}>
            {footerAction}
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

export default function NotificationsScreen() {
  const colors = useColors();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const topPad = insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const [items, setItems] = useState<NotificationItem[]>([]);
  const [totalUnread, setTotalUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState("all");

  const isStaffRole = user?.role === "staff" || user?.role === "teacher" || user?.role === "admin";
  const notifBasePath = isStaffRole ? "/api/mobile/staff/notifications" : "/api/mobile/student/notifications";

  const fetchNotifications = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      // Cả student lẫn parent đều dùng chung endpoint /student/, còn nhân viên dùng /staff/
      // Server phân biệt role qua JWT và tự populate field student cho parent
      const data = await apiGet<StudentNotifResponse>(
        `${notifBasePath}?limit=100&offset=0`
      );
      setItems(Array.isArray(data?.items) ? data.items : []);
      setTotalUnread(data?.totalUnread ?? 0);
    } catch (e: any) {
      setError(e?.message || "Không thể tải thông báo");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [notifBasePath]);

  useFocusEffect(useCallback(() => { fetchNotifications(); }, [fetchNotifications]));

  const onRefresh = () => {
    setRefreshing(true);
    fetchNotifications(true);
  };

  const markAsRead = async (id: string) => {
    try {
      await apiPatch(`${notifBasePath}/${id}/read`, {});
      setItems((prev) => prev.map((n) => n.id === id ? { ...n, isRead: true } : n));
      setTotalUnread((c) => Math.max(0, c - 1));
    } catch {}
  };

  const markAllRead = async () => {
    try {
      await apiPatch(`${notifBasePath}/read-all`, {});
      setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setTotalUnread(0);
    } catch {}
  };

  // Loại bỏ các category ẩn (chat) khỏi UI — dữ liệu vẫn giữ nguyên trên server
  const visibleItems = items.filter((n) => !HIDDEN_CATEGORIES.includes(n.category));
  const visibleUnread = visibleItems.filter((n) => !n.isRead).length;

  const filtered = activeCategory === "all"
    ? visibleItems
    : visibleItems.filter((n) => n.category === activeCategory);

  const visibleCategories = ALL_CATEGORIES.filter(
    (c) => c === "all" || visibleItems.some((n) => n.category === c)
  );

  // Đồng bộ badge app icon với số chưa đọc thực sự hiển thị (không tính chat)
  React.useEffect(() => {
    if (Platform.OS !== "web") Notifications.setBadgeCountAsync(visibleUnread);
  }, [visibleUnread]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={[styles.header, { paddingTop: topPad + 4, backgroundColor: colors.gradientStart }]}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} style={styles.backBtn}>
            <Feather name="arrow-left" size={20} color="#1e1b4b" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Thông báo</Text>
            {visibleUnread > 0 && (
              <Text style={styles.headerSub}>{visibleUnread} chưa đọc</Text>
            )}
          </View>
          {visibleUnread > 0 && (
            <TouchableOpacity onPress={markAllRead} activeOpacity={0.8} style={styles.readAllBtn}>
              <Feather name="check-circle" size={14} color="#1e1b4b" />
              <Text style={styles.readAllText}>Đọc tất cả</Text>
            </TouchableOpacity>
          )}
        </View>

        {visibleCategories.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            {visibleCategories.map((cat) => {
              const isActive = activeCategory === cat;
              const catColor = cat === "all" ? "#1e1b4b" : (CATEGORY_COLORS[cat] || "#1e1b4b");
              const unreadInCat = cat === "all"
                ? visibleUnread
                : visibleItems.filter((n) => n.category === cat && !n.isRead).length;
              return (
                <TouchableOpacity
                  key={cat}
                  onPress={() => setActiveCategory(cat)}
                  activeOpacity={0.75}
                  style={[
                    styles.filterPill,
                    {
                      backgroundColor: isActive ? "rgba(30,27,75,0.9)" : "rgba(30,27,75,0.1)",
                      borderColor: isActive ? "rgba(30,27,75,0.9)" : "rgba(30,27,75,0.2)",
                    },
                  ]}
                >
                  <Text style={[styles.filterPillText, { color: isActive ? "#fff" : "#1e1b4b" }]}>
                    {cat === "all" ? "Tất cả" : CATEGORY_LABELS[cat]}
                  </Text>
                  {unreadInCat > 0 && (
                    <View style={[styles.filterBadge, { backgroundColor: isActive ? "#fff" : "rgba(30,27,75,0.5)" }]}>
                      <Text style={[styles.filterBadgeText, { color: isActive ? "#1e1b4b" : "#fff" }]}>
                        {unreadInCat}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Đang tải thông báo...</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Feather name="alert-circle" size={36} color={colors.destructive} />
          <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
          <TouchableOpacity onPress={() => fetchNotifications()} style={[styles.retryBtn, { backgroundColor: colors.primary }]}>
            <Text style={styles.retryText}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 80 + bottomPad }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} progressBackgroundColor={colors.card} />}
        >
          {filtered.length === 0 ? (
            <View style={[styles.emptyBox, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
              <Feather name="bell-off" size={36} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Không có thông báo</Text>
              <Text style={[styles.emptySubText, { color: colors.mutedForeground }]}>
                {activeCategory === "all" ? "Chưa có thông báo nào" : `Không có thông báo loại "${CATEGORY_LABELS[activeCategory] ?? activeCategory}"`}
              </Text>
            </View>
          ) : (
            filtered.map((item) => (
              <NotifCard key={item.id} item={item} colors={colors} onRead={markAsRead} />
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 14,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(30,27,75,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    color: "#1e1b4b",
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  headerSub: {
    color: "rgba(30,27,75,0.65)",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  readAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(30,27,75,0.1)",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
  },
  readAllText: {
    color: "#1e1b4b",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    paddingRight: 4,
  },
  filterPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterPillText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  filterBadge: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  filterBadgeText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 32,
  },
  loadingText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  errorText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 4,
  },
  retryText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  emptyBox: {
    padding: 40,
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    marginTop: 20,
  },
  emptyTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  emptySubText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    opacity: 0.7,
  },
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    borderWidth: 1,
    marginBottom: 2,
  },
  cardDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
    flexShrink: 0,
  },
  studentRow: {
    flexDirection: "row",
  },
  studentBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    alignSelf: "flex-start",
  },
  studentBadgeText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  categoryPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  categoryPillText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  cardTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    lineHeight: 20,
  },
  cardContent: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  cardTime: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  expandHint: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  expandBtn: {
    paddingVertical: 4,
    paddingLeft: 12,
  },
});
