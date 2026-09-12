import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { popGradesDeeplink } from "@/lib/deeplinkStore";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "@/hooks/useSafeAreaInsets";

import { HtmlText } from "@/components/HtmlText";
import { useColors } from "@/hooks/useColors";
import { apiGet } from "@/lib/api";

interface ScoreCategory {
  categoryId: string;
  categoryName: string;
  score: number | null | string;
}

interface ScoreSheet {
  id: string;
  title: string;
  classId: string;
  classCode: string;
  className: string;
  scoreSheetId: string;
  scoreSheetName: string;
  sessionId: string | null;
  sessionIndex: number | null;
  sessionDate: string | null;
  weekday?: number | null;
  startTime?: string | null;
  endTime?: string | null;
  published: boolean;
  createdAt: string;
  updatedAt: string;
  createdByName: string;
  scores: ScoreCategory[] | null;
  teacherComment: string | null;
  student?: { id: string; name: string; code: string } | null;
  isParent?: boolean;
}

interface ScoreSheetResponse {
  items: ScoreSheet[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

function parseScore(s: number | null | string): number {
  if (s === null || s === undefined) return 0;
  const n = typeof s === "number" ? s : parseFloat(s as string);
  return isNaN(n) ? 0 : n;
}

function formatScore(s: number | null | string): string {
  if (s === null || s === undefined) return "—";
  const n = typeof s === "number" ? s : parseFloat(s as string);
  if (isNaN(n)) return "—";
  return n % 1 === 0 ? String(n) : n.toFixed(1);
}

function getScoreColor(score: number, colors: ReturnType<typeof useColors>) {
  if (score >= 8.5) return colors.success;
  if (score >= 7) return colors.primary;
  if (score >= 5) return colors.warning;
  return colors.destructive;
}

function formatSessionDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("vi-VN", { day: "numeric", month: "numeric", year: "numeric" });
}

const WEEKDAYS_VI = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
function getDateKey(dateStr: string): string {
  return dateStr ? dateStr.slice(0, 10) : "";
}
function formatTimelineDate(dateKey: string): string {
  const d = new Date(dateKey + "T00:00:00");
  if (isNaN(d.getTime())) return dateKey;
  const wd = WEEKDAYS_VI[d.getDay()];
  return `${wd}, ${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}
function groupByDate<T>(items: T[], getKey: (item: T) => string): { dateKey: string; items: T[] }[] {
  const map: Map<string, T[]> = new Map();
  for (const item of items) {
    const key = getKey(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return Array.from(map.entries()).map(([dateKey, items]) => ({ dateKey, items }));
}

function ScoreDetailPage({ item, visible, onClose }: { item: ScoreSheet; visible: boolean; onClose: () => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const safeScores = item.scores ?? [];
  const totalCategory = safeScores.length > 1 ? safeScores[safeScores.length - 1] : null;
  const detailScores = safeScores.length > 1 ? safeScores.slice(0, -1) : safeScores;
  const totalScore = totalCategory ? parseScore(totalCategory.score) : null;
  const scoreColor = totalScore !== null ? getScoreColor(totalScore, colors) : colors.primary;

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <StatusBar barStyle="dark-content" translucent />
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {/* Header — paddingTop accounts for notch / Dynamic Island on both platforms */}
        <View style={[
          styles.detailPageHeader,
          { paddingTop: insets.top + 8, backgroundColor: colors.card, borderBottomColor: colors.border },
        ]}>
          <TouchableOpacity onPress={onClose} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="arrow-left" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={[styles.detailPageTitle, { color: colors.foreground }]} numberOfLines={1}>
              {item.scoreSheetName || item.title}
            </Text>
            <Text style={[styles.detailPageSub, { color: colors.mutedForeground }]} numberOfLines={1}>
              {item.classCode || item.className}
              {item.sessionIndex !== null ? ` · Buổi ${item.sessionIndex}` : ""}
            </Text>
          </View>
          {totalScore !== null && (
            <View style={[styles.detailPageBadge, { backgroundColor: scoreColor + "18" }]}>
              <Text style={[styles.detailPageScore, { color: scoreColor }]}>{totalCategory?.score ?? totalScore}</Text>
              <Text style={[styles.detailPageScoreLabel, { color: scoreColor }]}>{totalCategory?.categoryName ?? "Điểm"}</Text>
            </View>
          )}
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Meta */}
          <View style={[styles.detailMetaBox, { backgroundColor: colors.card, borderColor: colors.border, marginBottom: 14 }]}>
            {item.student?.name && (
              <View style={styles.metaRow}>
                <Feather name="user" size={14} color="#16a34a" />
                <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#16a34a" }}>{item.student.name}</Text>
              </View>
            )}
            {item.createdByName ? (
              <View style={styles.metaRow}>
                <Feather name="edit-3" size={14} color={colors.mutedForeground} />
                <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{item.createdByName}</Text>
              </View>
            ) : null}
            {item.sessionDate && (
              <View style={styles.metaRow}>
                <Feather name="calendar" size={14} color={colors.mutedForeground} />
                <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
                  {formatSessionDate(item.sessionDate)}
                  {item.startTime ? ` · ${item.startTime}${item.endTime ? `–${item.endTime}` : ""}` : ""}
                </Text>
              </View>
            )}
          </View>

          {/* Score table */}
          <View style={[styles.scoreTable, { borderColor: colors.border, borderRadius: colors.radius, marginBottom: 14 }]}>
            {detailScores.map((cat, idx) => {
              const hasScore = cat.score !== null && cat.score !== undefined;
              const sc = hasScore ? parseScore(cat.score) : 0;
              const color = hasScore ? getScoreColor(sc, colors) : colors.mutedForeground;
              const isLast = idx === detailScores.length - 1;
              return (
                <View
                  key={cat.categoryId}
                  style={[
                    styles.scoreRow,
                    !isLast && { borderBottomWidth: 1, borderBottomColor: colors.border },
                  ]}
                >
                  <Text style={[styles.scoreCatName, { color: colors.foreground }]}>{cat.categoryName}</Text>
                  <View style={[styles.scorePill, { backgroundColor: color + "18" }]}>
                    <Text style={[styles.scorePillText, { color }]}>{formatScore(cat.score)}</Text>
                  </View>
                </View>
              );
            })}
            {totalCategory && (
              <View style={[styles.scoreRow, styles.totalRow, { borderTopColor: colors.border, backgroundColor: scoreColor + "0c" }]}>
                <Text style={[styles.scoreCatName, styles.totalCatName, { color: colors.foreground }]}>{totalCategory.categoryName}</Text>
                <View style={[styles.scorePill, { backgroundColor: scoreColor + "25" }]}>
                  <Text style={[styles.scorePillText, styles.totalPillText, { color: scoreColor }]}>{formatScore(totalCategory.score)}</Text>
                </View>
              </View>
            )}
          </View>

          {/* Teacher comment */}
          {item.teacherComment ? (
            <View style={[styles.commentBox, { backgroundColor: colors.primary + "0d", borderColor: colors.primary + "30" }]}>
              <View style={styles.commentHeader}>
                <Feather name="message-circle" size={13} color={colors.primary} />
                <Text style={[styles.commentLabel, { color: colors.primary }]}>Nhận xét</Text>
              </View>
              <HtmlText html={item.teacherComment} style={{ color: colors.foreground }} compactImages />
            </View>
          ) : (
            <View style={[styles.noCommentBox, { borderColor: colors.border }]}>
              <Feather name="message-circle" size={13} color={colors.mutedForeground} />
              <Text style={[styles.noCommentText, { color: colors.mutedForeground }]}>Chưa có nhận xét</Text>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

function ScoreSheetCard({ item }: { item: ScoreSheet }) {
  const colors = useColors();
  const [modalVisible, setModalVisible] = useState(false);

  const safeScores = item.scores ?? [];
  const totalCategory = safeScores.length > 1 ? safeScores[safeScores.length - 1] : null;
  const totalScore = totalCategory ? parseScore(totalCategory.score) : null;
  const scoreColor = totalScore !== null ? getScoreColor(totalScore, colors) : colors.primary;

  return (
    <View style={[styles.card, {
      backgroundColor: colors.card,
      borderColor: colors.border,
      borderRadius: colors.radius + 4,
      borderLeftWidth: 4,
      borderLeftColor: totalScore !== null ? scoreColor : colors.primary,
    }]}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <View style={styles.classRow}>
            <View style={[styles.classBadge, { backgroundColor: colors.primary + "18" }]}>
              <Text style={[styles.classBadgeText, { color: colors.primary }]}>{item.classCode || item.className}</Text>
            </View>
            <Text style={[styles.createdAt, { color: colors.mutedForeground }]}>
              {new Date(item.createdAt).toLocaleDateString("vi-VN", { day: "numeric", month: "2-digit", year: "numeric" })}
            </Text>
          </View>
          <Text style={[styles.sheetName, { color: colors.foreground }]}>{item.scoreSheetName || item.title}</Text>
          {item.student?.name && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
              <Feather name="user" size={11} color="#16a34a" />
              <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#16a34a" }}>
                {item.student.name}
              </Text>
            </View>
          )}
          {item.sessionIndex !== null && (
            <Text style={[styles.sessionInfo, { color: colors.mutedForeground }]}>
              {`Buổi ${item.sessionIndex}`}
              {item.sessionDate !== null ? ` · ${formatSessionDate(item.sessionDate)}` : ""}
              {item.startTime ? ` · ${item.startTime}${item.endTime ? `–${item.endTime}` : ""}` : ""}
            </Text>
          )}
        </View>
        {totalScore !== null && (
          <View style={[styles.totalBadge, { backgroundColor: scoreColor + "18" }]}>
            <Text style={[styles.totalScore, { color: scoreColor }]}>{totalCategory?.score ?? totalScore}</Text>
            <Text style={[styles.totalLabel, { color: scoreColor }]}>{totalCategory?.categoryName ?? "Điểm"}</Text>
          </View>
        )}
      </View>

      <TouchableOpacity
        onPress={() => setModalVisible(true)}
        activeOpacity={0.7}
        style={[styles.detailBtn, { borderColor: colors.border }]}
      >
        <Text style={[styles.detailBtnText, { color: colors.primary }]}>Xem chi tiết</Text>
        <Feather name="chevron-right" size={15} color={colors.primary} />
      </TouchableOpacity>

      <ScoreDetailPage item={item} visible={modalVisible} onClose={() => setModalVisible(false)} />
    </View>
  );
}

const MONTH_NAMES = ["Tháng 1","Tháng 2","Tháng 3","Tháng 4","Tháng 5","Tháng 6","Tháng 7","Tháng 8","Tháng 9","Tháng 10","Tháng 11","Tháng 12"];

export default function GradesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : 0;

  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const [sheets, setSheets] = useState<ScoreSheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [pendingClassId, setPendingClassId] = useState<string | null>(null);
  const currentPageRef = useRef(1);
  const loadingMoreRef = useRef(false);

  const monthKey = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}`;

  const fetchScores = useCallback(async (silent = false, page = 1) => {
    if (page === 1) {
      if (!silent) setLoading(true);
      setError(null);
      setHasMore(false);
      currentPageRef.current = 1;
    } else {
      setLoadingMore(true);
    }
    try {
      const data = await apiGet<ScoreSheetResponse | ScoreSheet[]>(
        `/api/mobile/student/score-sheet?month=${monthKey}&page=${page}&pageSize=50`
      );
      let newItems: ScoreSheet[];
      if (Array.isArray(data)) {
        newItems = data;
        setHasMore(false);
      } else {
        newItems = (data as ScoreSheetResponse).items ?? [];
        const tp = (data as ScoreSheetResponse).totalPages ?? 1;
        setHasMore(page < tp);
      }
      if (page === 1) {
        setSheets(newItems);
      } else {
        setSheets(prev => [...prev, ...newItems]);
      }
      currentPageRef.current = page;
    } catch (e: any) {
      if (page === 1) setError("Không thể tải bảng điểm. Vui lòng thử lại.");
    } finally {
      if (page === 1) {
        setLoading(false);
        setRefreshing(false);
      } else {
        setLoadingMore(false);
        loadingMoreRef.current = false;
      }
    }
  }, [monthKey]);

  const loadMore = useCallback(() => {
    if (loadingMoreRef.current || !hasMore || loading) return;
    loadingMoreRef.current = true;
    fetchScores(true, currentPageRef.current + 1);
  }, [hasMore, loading, fetchScores]);

  useEffect(() => { fetchScores(); }, [monthKey]);
  useFocusEffect(
    useCallback(() => {
      const dl = popGradesDeeplink();
      fetchScores(true);
      if (dl?.classId) {
        // Wait for data then auto-select — handled in the sheets useEffect below
        setPendingClassId(dl.classId);
      }
    }, [fetchScores])
  );

  // Auto-select class from deeplink once data is loaded
  useEffect(() => {
    if (!pendingClassId || loading || sheets.length === 0) return;
    const exists = sheets.some(s => s.classId === pendingClassId);
    if (exists) setSelectedClass(pendingClassId);
    setPendingClassId(null);
  }, [pendingClassId, loading, sheets]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchScores(true);
  };

  const goMonth = (delta: number) => {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    setViewMonth(m);
    setViewYear(y);
    setSelectedClass(null);
  };

  const allClasses = Array.from(
    new Map(sheets.filter(s => s.classId).map(s => [s.classId, s.className])).entries()
  ).map(([id, name]) => ({ id, name }));

  const filtered = selectedClass ? sheets.filter(s => s.classId === selectedClass) : sheets;

  const allTotals = filtered
    .map(s => {
      const sc = s.scores ?? [];
      return sc.length > 0 ? parseScore(sc[sc.length - 1].score) : null;
    })
    .filter((v): v is number => v !== null);
  const highestScore = allTotals.length > 0 ? Math.max(...allTotals) : null;
  const lowestScore = allTotals.length > 0 ? Math.min(...allTotals) : null;

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
        {!loading && filtered.length > 0 && (
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{filtered.length}</Text>
              <Text style={styles.summaryLabel}>Bảng điểm</Text>
            </View>
            {highestScore !== null && (
              <>
                <View style={styles.divider} />
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryValue}>{highestScore % 1 === 0 ? highestScore : highestScore.toFixed(1)}</Text>
                  <Text style={styles.summaryLabel}>Cao nhất</Text>
                </View>
              </>
            )}
            {lowestScore !== null && (
              <>
                <View style={styles.divider} />
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryValue}>{lowestScore % 1 === 0 ? lowestScore : lowestScore.toFixed(1)}</Text>
                  <Text style={styles.summaryLabel}>Thấp nhất</Text>
                </View>
              </>
            )}
          </View>
        )}
      </View>

      {!loading && allClasses.length > 1 && (
        <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.card }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 10 }}
          >
            <TouchableOpacity
              onPress={() => setSelectedClass(null)}
              style={{
                paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1,
                backgroundColor: selectedClass === null ? colors.primary : colors.card,
                borderColor: selectedClass === null ? colors.primary : colors.border,
              }}
            >
              <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: selectedClass === null ? "#fff" : colors.mutedForeground }}>
                Tất cả
              </Text>
            </TouchableOpacity>
            {allClasses.map(cls => (
              <TouchableOpacity
                key={cls.id}
                onPress={() => setSelectedClass(cls.id === selectedClass ? null : cls.id)}
                style={{
                  paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1,
                  backgroundColor: selectedClass === cls.id ? colors.primary : colors.card,
                  borderColor: selectedClass === cls.id ? colors.primary : colors.border,
                }}
              >
                <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: selectedClass === cls.id ? "#fff" : colors.mutedForeground }}>
                  {cls.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Đang tải bảng điểm...</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Feather name="alert-circle" size={40} color={colors.destructive} />
          <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.center}>
          <Feather name="bar-chart-2" size={48} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            {`Không có bảng điểm trong ${MONTH_NAMES[viewMonth]}`}
          </Text>
          <Text style={[styles.emptySubText, { color: colors.mutedForeground }]}>
            Chuyển tháng để xem bảng điểm khác
          </Text>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.content, { paddingBottom: 100 + bottomPad }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} progressBackgroundColor={colors.card} />
          }
          onScroll={(e) => {
            const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
            if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 200) {
              loadMore();
            }
          }}
          scrollEventThrottle={200}
        >
          {groupByDate(filtered, (s) => getDateKey(s.sessionDate || s.createdAt)).map(({ dateKey, items: groupItems }) => (
            <View key={dateKey}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10, marginTop: 4 }}>
                <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#7c3aed" }}>
                  {formatTimelineDate(dateKey)}
                </Text>
                <View style={{ backgroundColor: "#7c3aed18", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 }}>
                  <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: "#7c3aed" }}>
                    {groupItems.length} bảng
                  </Text>
                </View>
              </View>
              {groupItems.map((sheet) => (
                <ScoreSheetCard key={sheet.id} item={sheet} />
              ))}
            </View>
          ))}
          {loadingMore && (
            <View style={{ paddingVertical: 20, alignItems: "center" }}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 6, fontFamily: "Inter_400Regular" }}>
                Đang tải thêm...
              </Text>
            </View>
          )}
          {!loadingMore && !hasMore && sheets.length > 0 && (
            <Text style={{ textAlign: "center", color: colors.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular", paddingVertical: 12 }}>
              Đã hiển thị tất cả {sheets.length} bảng điểm
            </Text>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingBottom: 20,
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
  summaryRow: {
    flexDirection: "row",
    backgroundColor: "rgba(30,27,75,0.08)",
    borderRadius: 12,
    padding: 14,
  },
  summaryItem: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  summaryValue: {
    color: "#1e1b4b",
    fontSize: 22,
    fontFamily: "Inter_700Bold",
  },
  summaryLabel: {
    color: "rgba(30,27,75,0.6)",
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  divider: {
    width: 1,
    backgroundColor: "rgba(30,27,75,0.15)",
    marginVertical: 4,
  },
  content: {
    padding: 16,
    gap: 0,
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
  emptyText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
    marginTop: 8,
  },
  emptySubText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    opacity: 0.7,
  },
  card: {
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
    gap: 10,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  classRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
    gap: 6,
    flexWrap: "wrap",
  },
  classBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  classBadgeText: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  createdAt: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  sheetName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    lineHeight: 20,
  },
  sessionInfo: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  totalBadge: {
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    minWidth: 56,
  },
  totalScore: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
  },
  totalLabel: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  detailBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderWidth: 1,
    borderRadius: 8,
  },
  detailBtnText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  detailPanel: {
    borderTopWidth: 1,
    paddingTop: 12,
    gap: 10,
  },
  teacherRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  teacherName: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  scoreTable: {
    borderWidth: 1,
    overflow: "hidden",
  },
  scoreRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  scoreCatName: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    flex: 1,
  },
  scorePill: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    minWidth: 44,
    alignItems: "center",
  },
  scorePillText: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  totalRow: {
    borderTopWidth: 1,
  },
  totalCatName: {
    fontFamily: "Inter_600SemiBold",
  },
  totalPillText: {
    fontSize: 15,
  },
  commentBox: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    gap: 6,
  },
  commentHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  commentLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  commentText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
  },
  noCommentBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderRadius: 8,
    borderStyle: "dashed",
  },
  noCommentText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  detailPageHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  detailPageTitle: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    lineHeight: 20,
  },
  detailPageSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  detailPageBadge: {
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    minWidth: 56,
  },
  detailPageScore: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
  },
  detailPageScoreLabel: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  detailMetaBox: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  metaText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
});
