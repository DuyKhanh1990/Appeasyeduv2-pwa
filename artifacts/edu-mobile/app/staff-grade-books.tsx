import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
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

import { useColors } from "@/hooks/useColors";
import { apiGet } from "@/lib/api";

interface StaffClass {
  id: string;
  classCode: string;
  name: string;
}

interface GradeBook {
  id: string;
  title: string;
  classId: string;
  classCode: string;
  className: string;
  scoreSheetId: string | null;
  scoreSheetName: string;
  sessionId: string | null;
  sessionIndex: number | null;
  sessionDate: string | null;
  published: boolean;
  scoreCount: number;
  studentCount: number;
  createdByName: string;
  updatedByName: string;
  createdAt: string;
  updatedAt: string;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("vi-VN", { day: "numeric", month: "numeric", year: "numeric" });
}

function GradeBookCard({
  item,
  showClassName,
  colors,
}: {
  item: GradeBook;
  showClassName: boolean;
  colors: ReturnType<typeof useColors>;
}) {
  const handleEdit = () => {
    Haptics.selectionAsync();
    router.push({ pathname: "/staff-grade-book-edit", params: { classId: item.classId, id: item.id } } as any);
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: colors.foreground }} numberOfLines={2}>
            {item.title}
          </Text>
          {showClassName ? (
            <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.primary }}>
              {item.classCode || item.className}
            </Text>
          ) : null}
          {item.scoreSheetName ? (
            <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
              Mẫu: {item.scoreSheetName}
            </Text>
          ) : null}
          {item.sessionDate ? (
            <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
              {item.sessionIndex != null ? `#${item.sessionIndex} · ` : ""}{formatDate(item.sessionDate)}
            </Text>
          ) : null}
        </View>
        <View style={{ alignItems: "flex-end", gap: 6 }}>
          <View style={{
            backgroundColor: item.published ? "#f0fdf4" : "#fff7ed",
            paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
          }}>
            <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: item.published ? "#16a34a" : "#ea580c" }}>
              {item.published ? "Đã công bố" : "Nháp"}
            </Text>
          </View>
        </View>
      </View>

      <View style={[styles.statsRow, { borderTopColor: colors.border }]}>
        <View style={styles.statItem}>
          <Feather name="clock" size={13} color={colors.mutedForeground} />
          <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
            {formatDate(item.updatedAt || item.createdAt)}
          </Text>
          {item.updatedByName ? (
            <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
              · {item.updatedByName}
            </Text>
          ) : null}
        </View>
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          onPress={handleEdit}
          style={[styles.actionBtn, { backgroundColor: colors.primary + "15" }]}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Feather name="edit-2" size={13} color={colors.primary} />
          <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: colors.primary }}>Sửa</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const PAGE_SIZE = 20;
const ALL_TAB = "__all__";

interface PaginatedResponse {
  items: GradeBook[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export default function StaffGradeBooksScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : 0;

  const [classes, setClasses] = useState<StaffClass[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>(ALL_TAB);
  const [gradeBooks, setGradeBooks] = useState<GradeBook[]>([]);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [loadingBooks, setLoadingBooks] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const endpointFor = (classId: string) =>
    classId === ALL_TAB
      ? "/api/mobile/staff/score-sheet"
      : `/api/mobile/staff/classes/${classId}/grade-books`;

  const loadGradeBooks = useCallback(async (classId: string) => {
    setLoadingBooks(true);
    try {
      const res = await apiGet<PaginatedResponse | GradeBook[]>(`${endpointFor(classId)}?limit=${PAGE_SIZE}&offset=0`);
      if (Array.isArray(res)) {
        setGradeBooks(res);
        setHasMore(false);
      } else {
        setGradeBooks(res?.items ?? []);
        setHasMore(res?.hasMore ?? false);
      }
    } catch {
      setGradeBooks([]);
      setHasMore(false);
    } finally {
      setLoadingBooks(false);
    }
  }, []);

  const loadMoreGradeBooks = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const res = await apiGet<PaginatedResponse | GradeBook[]>(`${endpointFor(selectedClassId)}?limit=${PAGE_SIZE}&offset=${gradeBooks.length}`);
      if (Array.isArray(res)) {
        setGradeBooks((prev) => [...(prev ?? []), ...res]);
        setHasMore(false);
      } else {
        setGradeBooks((prev) => [...(prev ?? []), ...(res?.items ?? [])]);
        setHasMore(res?.hasMore ?? false);
      }
    } catch {
      // ignore, keep current state
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, selectedClassId, gradeBooks.length]);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoadingClasses(true);
    setError(false);
    try {
      const cls = await apiGet<StaffClass[]>("/api/mobile/staff/classes");
      setClasses(cls);
      setSelectedClassId((prev) => {
        const id = prev === ALL_TAB || cls.find((c) => c.id === prev) ? prev : ALL_TAB;
        loadGradeBooks(id);
        return id;
      });
    } catch {
      setError(true);
    } finally {
      setLoadingClasses(false);
      setRefreshing(false);
    }
  }, [loadGradeBooks]);

  const { classId: deeplinkClassId } = useLocalSearchParams<{ classId?: string }>();

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Auto-select class from deeplink params once classes are loaded
  useEffect(() => {
    if (!deeplinkClassId || classes.length === 0) return;
    const found = classes.find(c => c.id === deeplinkClassId);
    if (found) {
      setSelectedClassId(deeplinkClassId);
      loadGradeBooks(deeplinkClassId);
    }
  }, [deeplinkClassId, classes, loadGradeBooks]);

  const handleSelectClass = (classId: string) => {
    Haptics.selectionAsync();
    setSelectedClassId(classId);
    loadGradeBooks(classId);
  };

  const handleCreate = () => {
    if (!selectedClassId || selectedClassId === ALL_TAB) return;
    Haptics.selectionAsync();
    router.push({ pathname: "/staff-grade-book-edit", params: { classId: selectedClassId } } as any);
  };

  const groupedByDate = useMemo(() => {
    const map = new Map<string, GradeBook[]>();
    for (const gb of gradeBooks) {
      const key = gb.updatedAt ? gb.updatedAt.slice(0, 10) : gb.createdAt?.slice(0, 10) ?? "__nodate__";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(gb);
    }
    return [...map.entries()].sort(([a], [b]) => (a > b ? -1 : a < b ? 1 : 0));
  }, [gradeBooks]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={{ backgroundColor: colors.gradientStart, paddingTop: (Platform.OS === "web" ? topPad : insets.top) + 12, paddingBottom: 16, paddingHorizontal: 16 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <TouchableOpacity
            onPress={() => { Haptics.selectionAsync(); router.back(); }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(30,27,75,0.1)", alignItems: "center", justifyContent: "center" }}
          >
            <Feather name="arrow-left" size={20} color="#1e1b4b" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 20, fontFamily: "Inter_700Bold", color: "#1e1b4b" }}>Bảng điểm</Text>
            <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: "rgba(30,27,75,0.65)" }}>Quản lý điểm số học viên</Text>
          </View>
        </View>
      </View>

      {/* Class tabs */}
      {!loadingClasses && classes.length > 0 && (
        <View style={{ backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 10, gap: 8 }}>
            <TouchableOpacity
              onPress={() => handleSelectClass(ALL_TAB)}
              style={{
                paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
                backgroundColor: selectedClassId === ALL_TAB ? colors.primary : colors.muted,
                borderWidth: 1, borderColor: selectedClassId === ALL_TAB ? colors.primary : colors.border,
              }}
            >
              <Text style={{ fontSize: 13, fontFamily: selectedClassId === ALL_TAB ? "Inter_600SemiBold" : "Inter_400Regular", color: selectedClassId === ALL_TAB ? "#fff" : colors.foreground }}>
                Tất cả
              </Text>
            </TouchableOpacity>
            {classes.map((cls) => {
              const active = cls.id === selectedClassId;
              return (
                <TouchableOpacity
                  key={cls.id}
                  onPress={() => handleSelectClass(cls.id)}
                  style={{
                    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
                    backgroundColor: active ? colors.primary : colors.muted,
                    borderWidth: 1, borderColor: active ? colors.primary : colors.border,
                  }}
                >
                  <Text style={{ fontSize: 13, fontFamily: active ? "Inter_600SemiBold" : "Inter_400Regular", color: active ? "#fff" : colors.foreground }}>
                    {cls.classCode || cls.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Content */}
      {loadingClasses ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>Đang tải...</Text>
        </View>
      ) : error ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 }}>
          <Feather name="alert-circle" size={32} color={colors.destructive} />
          <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>Không tải được dữ liệu</Text>
          <TouchableOpacity onPress={() => load()} style={{ backgroundColor: colors.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 }}>
            <Text style={{ color: "#fff", fontFamily: "Inter_600SemiBold" }}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      ) : classes.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 }}>
          <Feather name="book-open" size={40} color={colors.mutedForeground} />
          <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.foreground, textAlign: "center" }}>Bạn chưa phụ trách lớp nào</Text>
          <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center" }}>Liên hệ quản lý để được phân công lớp học.</Text>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 100 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={[colors.primary]} tintColor={colors.primary} progressBackgroundColor={colors.card} />}
        >
          {loadingBooks ? (
            <View style={{ alignItems: "center", paddingTop: 40, gap: 10 }}>
              <ActivityIndicator color={colors.primary} />
              <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>Đang tải bảng điểm...</Text>
            </View>
          ) : gradeBooks.length === 0 ? (
            <View style={{ alignItems: "center", paddingTop: 60, gap: 12 }}>
              <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.primary + "15", alignItems: "center", justifyContent: "center" }}>
                <Feather name="bar-chart-2" size={28} color={colors.primary} />
              </View>
              <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>Chưa có bảng điểm</Text>
              <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center" }}>Nhấn nút + bên dưới để tạo bảng điểm mới.</Text>
            </View>
          ) : (
            <>
              {groupedByDate.map(([dateKey, books]) => {
                const isNoDate = dateKey === "__nodate__";
                let dateLabel = "Không rõ ngày";
                if (!isNoDate) {
                  const d = new Date(dateKey + "T00:00:00");
                  const weekdays = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
                  const wd = weekdays[d.getDay()];
                  dateLabel = `${wd}, ${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
                }
                return (
                  <View key={dateKey} style={{ marginBottom: 20 }}>
                    {/* Date header */}
                    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
                      <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: isNoDate ? colors.mutedForeground : colors.primary }}>
                        {dateLabel}
                      </Text>
                      <View style={{ marginLeft: 8, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10, backgroundColor: (isNoDate ? colors.mutedForeground : colors.primary) + "18" }}>
                        <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: isNoDate ? colors.mutedForeground : colors.primary }}>
                          {books.length} bảng
                        </Text>
                      </View>
                    </View>
                    {/* Cards */}
                    {books.map((gb) => (
                      <View key={gb.id} style={{ marginBottom: 10 }}>
                        <GradeBookCard item={gb} showClassName={selectedClassId === ALL_TAB} colors={colors} />
                      </View>
                    ))}
                  </View>
                );
              })}
              {hasMore ? (
                <TouchableOpacity
                  onPress={loadMoreGradeBooks}
                  disabled={loadingMore}
                  style={{
                    alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8,
                    paddingVertical: 12, borderRadius: 12, marginTop: 4,
                    backgroundColor: colors.muted,
                  }}
                >
                  {loadingMore ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Feather name="chevron-down" size={16} color={colors.primary} />
                  )}
                  <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.primary }}>
                    {loadingMore ? "Đang tải..." : "Xem thêm"}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </>
          )}
        </ScrollView>
      )}

      {/* FAB */}
      {!loadingClasses && classes.length > 0 && selectedClassId && selectedClassId !== ALL_TAB && (
        <TouchableOpacity
          onPress={handleCreate}
          activeOpacity={0.85}
          style={[styles.fab, { backgroundColor: colors.primary, bottom: insets.bottom + 24 }]}
        >
          <Feather name="plus" size={24} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  statItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  fab: {
    position: "absolute",
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
});
