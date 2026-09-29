import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
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
import { useFocusEffect } from "expo-router";
import { setCurrentAssignment, getCurrentAssignment } from "@/lib/assignmentStore";
import type { AssignmentRow } from "@/lib/assignmentStore";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AssignmentResponse {
  month: string;
  rows: AssignmentRow[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("vi-VN", { day: "numeric", month: "numeric", year: "numeric" });
}

const MONTH_NAMES = [
  "Tháng 1","Tháng 2","Tháng 3","Tháng 4","Tháng 5","Tháng 6",
  "Tháng 7","Tháng 8","Tháng 9","Tháng 10","Tháng 11","Tháng 12",
];

// ─── Assignment Card ──────────────────────────────────────────────────────────

function AssignmentCard({
  row,
  onPress,
  colors,
}: {
  row: AssignmentRow;
  onPress: (row: AssignmentRow) => void;
  colors: ReturnType<typeof useColors>;
}) {
  const isBTVN = row.itemType === "BTVN";
  const isSubmitted = row.submissionStatus === "submitted";
  const hasScore = row.score !== null && row.score !== undefined && row.score !== "";
  const typeColor = isBTVN ? "#2563eb" : "#9333ea";
  const typeBg = isBTVN ? "#eff6ff" : "#fdf4ff";

  return (
    <TouchableOpacity
      activeOpacity={0.78}
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() => { Haptics.selectionAsync(); onPress(row); }}
    >
      <View style={styles.cardTop}>
        <View style={{ flex: 1, gap: 4 }}>
          <View style={styles.cardTitleRow}>
            <View style={[styles.typeBadge, { backgroundColor: typeBg }]}>
              <Text style={[styles.typeBadgeText, { color: typeColor }]}>{row.itemType}</Text>
            </View>
            {hasScore && (
              <View style={[styles.scoreBadge, { backgroundColor: "#f0fdf4" }]}>
                <Feather name="award" size={11} color="#16a34a" />
                <Text style={[styles.scoreBadgeText, { color: "#16a34a" }]}>{row.score}</Text>
              </View>
            )}
            <Text style={[styles.studentName, { color: colors.primary, flex: 1, textAlign: "right" }]} numberOfLines={1}>
              {row.studentName}
            </Text>
          </View>
          <Text style={[styles.homeworkTitle, { color: colors.foreground }]} numberOfLines={2}>
            {row.homeworkTitle}
          </Text>
          <Text style={[styles.classInfo, { color: colors.mutedForeground }]}>
            {row.className} • {row.weekday} {formatDate(row.sessionDate)} • {row.startTime}–{row.endTime}
          </Text>
        </View>
        <Feather name="chevron-right" size={18} color={colors.mutedForeground} style={{ marginLeft: 8, alignSelf: "center" }} />
      </View>

      <View style={[styles.cardFooter, { borderTopColor: colors.border }]}>
        <View style={[styles.statusChip, { backgroundColor: isSubmitted ? "#dcfce7" : "#fef3c7" }]}>
          <Feather name={isSubmitted ? "check-circle" : "clock"} size={11} color={isSubmitted ? "#166534" : "#92400e"} />
          <Text style={[styles.statusText, { color: isSubmitted ? "#166534" : "#92400e" }]}>
            {isSubmitted ? "Đã nộp" : "Chưa nộp"}
          </Text>
        </View>
        <View style={[styles.gradeChip, { backgroundColor: hasScore ? "#f0fdf4" : colors.muted }]}>
          <Feather name={hasScore ? "check" : "edit-2"} size={11} color={hasScore ? "#16a34a" : colors.mutedForeground} />
          <Text style={[styles.gradeChipText, { color: hasScore ? "#16a34a" : colors.mutedForeground }]}>
            {hasScore ? `Điểm: ${row.score}` : "Chưa chấm"}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function StaffAssignmentsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = insets.top;

  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [statusFilter, setStatusFilter] = useState<"all" | "submitted" | "pending">("all");
  const [classNamesFilter, setClassNamesFilter] = useState<string[]>([]);
  const [studentIdsFilter, setStudentIdsFilter] = useState<string[]>([]);
  const [dateFromFilter, setDateFromFilter] = useState<string | null>(null);
  const [dateToFilter, setDateToFilter] = useState<string | null>(null);
  const [filterPanelVisible, setFilterPanelVisible] = useState(false);
  const [draftDateFrom, setDraftDateFrom] = useState<string | null>(null);
  const [draftDateTo, setDraftDateTo] = useState<string | null>(null);
  const [draftClassNames, setDraftClassNames] = useState<string[]>([]);
  const [draftStudentIds, setDraftStudentIds] = useState<string[]>([]);
  const [classSubPickerVisible, setClassSubPickerVisible] = useState(false);
  const [studentSubPickerVisible, setStudentSubPickerVisible] = useState(false);
  const [datePickerTarget, setDatePickerTarget] = useState<"from" | "to" | null>(null);
  const [pickerYear, setPickerYear] = useState(() => new Date().getFullYear());
  const [pickerMonth, setPickerMonth] = useState(() => new Date().getMonth());

  const [allRows, setAllRows] = useState<AssignmentRow[]>([]);
  const [rows, setRows] = useState<AssignmentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const availableClasses = useMemo(() => {
    const names = [...new Set(allRows.map((r) => r.className).filter(Boolean))];
    return names.sort((a, b) => a.localeCompare(b));
  }, [allRows]);

  const availableStudents = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of allRows) {
      if (r.studentId && r.studentName) map.set(r.studentId, r.studentName);
    }
    return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [allRows]);

  const toggleDraftClass = (cls: string) => {
    setDraftClassNames((prev) =>
      prev.includes(cls) ? prev.filter((c) => c !== cls) : [...prev, cls]
    );
  };

  const toggleDraftStudent = (id: string) => {
    setDraftStudentIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const fetchData = useCallback(async (opts: {
    year: number; month: number; status: string;
    classNames: string[]; studentIds: string[];
    dateFrom: string | null; dateTo: string | null;
    silent?: boolean;
  }) => {
    const { year, month, status, classNames, studentIds, dateFrom, dateTo, silent } = opts;
    if (!silent) setLoading(true);
    try {
      let url: string;
      if (dateFrom && dateTo) {
        url = `/api/mobile/staff/assignments?dateFrom=${dateFrom}&dateTo=${dateTo}&status=${status}`;
      } else {
        const monthStr = `${year}-${String(month + 1).padStart(2, "0")}`;
        url = `/api/mobile/staff/assignments?month=${monthStr}&status=${status}`;
      }
      for (const cn of classNames) url += `&className=${encodeURIComponent(cn)}`;
      for (const si of studentIds) url += `&studentId=${encodeURIComponent(si)}`;
      const data = await apiGet<AssignmentResponse>(url);
      let fetched = Array.isArray(data.rows) ? data.rows : [];
      if (classNames.length > 0) {
        const lowerClassNames = classNames.map((c) => c.toLowerCase());
        fetched = fetched.filter((r) => lowerClassNames.includes((r.className ?? "").toLowerCase()));
      }
      if (studentIds.length > 0) {
        fetched = fetched.filter((r) => studentIds.includes(r.studentId));
      }
      setRows(fetched);
      if (classNames.length === 0 && studentIds.length === 0) setAllRows(fetched);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData({ year: viewYear, month: viewMonth, status: statusFilter, classNames: classNamesFilter, studentIds: studentIdsFilter, dateFrom: dateFromFilter, dateTo: dateToFilter });
  }, [viewYear, viewMonth, statusFilter, classNamesFilter, studentIdsFilter, dateFromFilter, dateToFilter, fetchData]);

  const goMonth = (delta: number) => {
    if (dateFromFilter || dateToFilter) {
      setDateFromFilter(null);
      setDateToFilter(null);
      return;
    }
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    setClassNamesFilter([]);
    setStudentIdsFilter([]);
    setViewMonth(m);
    setViewYear(y);
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchData({ year: viewYear, month: viewMonth, status: statusFilter, classNames: classNamesFilter, studentIds: studentIdsFilter, dateFrom: dateFromFilter, dateTo: dateToFilter, silent: true });
  };

  // Khi quay lại từ trang chấm bài, đồng bộ điểm/nhận xét đã lưu vào danh sách
  useFocusEffect(
    useCallback(() => {
      const updated = getCurrentAssignment();
      if (!updated) return;
      setRows((prev) =>
        prev.map((r) =>
          r.studentSessionContentId === updated.studentSessionContentId
            ? { ...r, score: updated.score, comment: updated.comment }
            : r
        )
      );
      setAllRows((prev) =>
        prev.map((r) =>
          r.studentSessionContentId === updated.studentSessionContentId
            ? { ...r, score: updated.score, comment: updated.comment }
            : r
        )
      );
    }, [])
  );

  const handleCardPress = (row: AssignmentRow) => {
    setCurrentAssignment(row);
    router.push("/staff-assignment-detail");
  };

  const filterOptions: { key: "all" | "submitted" | "pending"; label: string }[] = [
    { key: "all", label: "Tất cả" },
    { key: "submitted", label: "Đã nộp" },
    { key: "pending", label: "Chưa nộp" },
  ];

  const activeFilterCount = classNamesFilter.length + studentIdsFilter.length + ((dateFromFilter && dateToFilter) ? 1 : 0);

  const openFilterPanel = () => {
    setDraftDateFrom(dateFromFilter);
    setDraftDateTo(dateToFilter);
    setDraftClassNames([...classNamesFilter]);
    setDraftStudentIds([...studentIdsFilter]);
    setFilterPanelVisible(true);
  };

  const applyFilters = () => {
    setDateFromFilter(draftDateFrom);
    setDateToFilter(draftDateTo);
    setClassNamesFilter([...draftClassNames]);
    setStudentIdsFilter([...draftStudentIds]);
    setFilterPanelVisible(false);
  };

  const resetFilters = () => {
    setDraftDateFrom(null);
    setDraftDateTo(null);
    setDraftClassNames([]);
    setDraftStudentIds([]);
  };

  const openDatePicker = (target: "from" | "to") => {
    const existingDate = target === "from" ? draftDateFrom : draftDateTo;
    if (existingDate) {
      const [y, m] = existingDate.split("-").map(Number);
      setPickerYear(y);
      setPickerMonth(m - 1);
    } else {
      setPickerYear(now.getFullYear());
      setPickerMonth(now.getMonth());
    }
    setDatePickerTarget(target);
  };

  const formatDateDisplay = (d: string) => {
    const [y, m, day] = d.split("-");
    return `${day}/${m}/${y}`;
  };

  const goPickerMonth = (delta: number) => {
    setPickerMonth((prev) => {
      let nm = prev + delta;
      if (nm < 0) { nm = 11; setPickerYear((y) => y - 1); }
      else if (nm > 11) { nm = 0; setPickerYear((y) => y + 1); }
      return nm;
    });
  };

  const groupedByDate = useMemo(() => {
    const map = new Map<string, AssignmentRow[]>();
    for (const r of rows) {
      const key = r.sessionDate;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return [...map.entries()].sort(([a], [b]) => (a > b ? -1 : a < b ? 1 : 0));
  }, [rows]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={{
          backgroundColor: colors.gradientStart,
          paddingTop: (Platform.OS === "web" ? topPad : insets.top) + 12,
          paddingBottom: 16,
          paddingHorizontal: 16,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="arrow-left" size={22} color="#1e1b4b" />
          </TouchableOpacity>
          <Text style={{ fontSize: 20, fontFamily: "Inter_700Bold", color: "#1e1b4b", flex: 1 }}>
            Bài tập - Bài kiểm tra
          </Text>
          <TouchableOpacity onPress={openFilterPanel} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ position: "relative" }}>
            <View style={{
              width: 36, height: 36, borderRadius: 18,
              backgroundColor: activeFilterCount > 0 ? "#1e1b4b" : "rgba(30,27,75,0.1)",
              alignItems: "center", justifyContent: "center",
            }}>
              <Feather name="sliders" size={18} color={activeFilterCount > 0 ? "#fff" : "#1e1b4b"} />
            </View>
            {activeFilterCount > 0 && (
              <View style={{
                position: "absolute", top: -2, right: -2,
                width: 16, height: 16, borderRadius: 8,
                backgroundColor: "#ef4444", alignItems: "center", justifyContent: "center",
              }}>
                <Text style={{ fontSize: 9, fontFamily: "Inter_700Bold", color: "#fff" }}>{activeFilterCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.monthNav}>
          <TouchableOpacity onPress={() => goMonth(-1)} style={styles.navBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="chevron-left" size={20} color="rgba(255,255,255,0.9)" />
          </TouchableOpacity>
          <Text style={styles.monthLabel}>
            {(dateFromFilter && dateToFilter)
              ? `${formatDateDisplay(dateFromFilter)} — ${formatDateDisplay(dateToFilter)}`
              : `${MONTH_NAMES[viewMonth]}, ${viewYear}`}
          </Text>
          <TouchableOpacity onPress={() => goMonth(1)} style={styles.navBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="chevron-right" size={20} color="rgba(255,255,255,0.9)" />
          </TouchableOpacity>
        </View>

        <View style={styles.filterRow}>
          {filterOptions.map((f) => (
            <TouchableOpacity
              key={f.key}
              onPress={() => setStatusFilter(f.key)}
              style={[styles.filterBtn, statusFilter === f.key && styles.filterBtnActive]}
            >
              <Text style={[styles.filterBtnText, statusFilter === f.key && styles.filterBtnTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 14, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} progressBackgroundColor={colors.card} />}
        >
          {rows.length === 0 ? (
            <View style={[styles.empty, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="inbox" size={32} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                Không có dữ liệu trong tháng này
              </Text>
            </View>
          ) : (
            <>
              {groupedByDate.map(([date, dateRows], groupIdx) => {
                const d = new Date(date + "T00:00:00");
                const weekdays = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
                const wd = weekdays[d.getDay()];
                const dateLabel = `${wd}, ${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
                const isLast = groupIdx === groupedByDate.length - 1;
                return (
                  <View key={date} style={{ marginBottom: isLast ? 0 : 16 }}>
                    {/* Date header */}
                    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
                      <View style={{
                        width: 8, height: 8, borderRadius: 4,
                        backgroundColor: colors.primary,
                        marginRight: 8,
                        shadowColor: colors.primary, shadowOpacity: 0.4,
                        shadowRadius: 4, elevation: 2,
                      }} />
                      <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: colors.primary }}>
                        {dateLabel}
                      </Text>
                      <View style={{ marginLeft: 8, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10, backgroundColor: colors.primary + "18" }}>
                        <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: colors.primary }}>
                          {dateRows.length} mục
                        </Text>
                      </View>
                    </View>
                    {/* Cards for this date */}
                    {dateRows.map((row, i) => (
                      <AssignmentCard key={`${date}-${row.studentId}-${row.homeworkId ?? row.examId}-${i}`} row={row} onPress={handleCardPress} colors={colors} />
                    ))}
                  </View>
                );
              })}
            </>
          )}
        </ScrollView>
      )}

      {/* Unified filter panel */}
      <Modal visible={filterPanelVisible} transparent animationType="slide" onRequestClose={() => setFilterPanelVisible(false)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)" }} activeOpacity={1} onPress={() => setFilterPanelVisible(false)} />
        <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, position: "absolute", bottom: 0, left: 0, right: 0, borderWidth: 1, borderColor: colors.border }}>
          {/* Header */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <TouchableOpacity onPress={resetFilters}>
              <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: "#f97316" }}>Đặt lại</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: colors.foreground }}>Bộ lọc</Text>
            <TouchableOpacity onPress={() => setFilterPanelVisible(false)}>
              <Feather name="x" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          {/* Date range rows */}
          <TouchableOpacity
            onPress={() => openDatePicker("from")}
            style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}
          >
            <Feather name="calendar" size={16} color={colors.mutedForeground} style={{ marginRight: 12 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: colors.mutedForeground, marginBottom: 2 }}>Từ ngày</Text>
              <Text style={{ fontSize: 14, fontFamily: draftDateFrom ? "Inter_600SemiBold" : "Inter_400Regular", color: draftDateFrom ? colors.primary : colors.foreground }}>
                {draftDateFrom ? formatDateDisplay(draftDateFrom) : "Chọn ngày bắt đầu"}
              </Text>
            </View>
            {draftDateFrom && (
              <TouchableOpacity onPress={() => setDraftDateFrom(null)} style={{ padding: 4, marginRight: 4 }} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                <Feather name="x-circle" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
            )}
            <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => openDatePicker("to")}
            style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}
          >
            <Feather name="calendar" size={16} color={colors.mutedForeground} style={{ marginRight: 12 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: colors.mutedForeground, marginBottom: 2 }}>Đến ngày</Text>
              <Text style={{ fontSize: 14, fontFamily: draftDateTo ? "Inter_600SemiBold" : "Inter_400Regular", color: draftDateTo ? colors.primary : colors.foreground }}>
                {draftDateTo ? formatDateDisplay(draftDateTo) : "Chọn ngày kết thúc"}
              </Text>
            </View>
            {draftDateTo && (
              <TouchableOpacity onPress={() => setDraftDateTo(null)} style={{ padding: 4, marginRight: 4 }} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                <Feather name="x-circle" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
            )}
            <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>

          {/* Class row */}
          <TouchableOpacity
            onPress={() => setClassSubPickerVisible(true)}
            style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}
          >
            <Feather name="layers" size={16} color={colors.mutedForeground} style={{ marginRight: 12 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: colors.mutedForeground, marginBottom: 2 }}>Lớp học</Text>
              <Text style={{ fontSize: 14, fontFamily: draftClassNames.length > 0 ? "Inter_600SemiBold" : "Inter_400Regular", color: draftClassNames.length > 0 ? colors.primary : colors.foreground }}>
                {draftClassNames.length === 0 ? "Tất cả lớp" : draftClassNames.length === 1 ? draftClassNames[0] : `${draftClassNames.length} lớp`}
              </Text>
            </View>
            {draftClassNames.length > 0 && (
              <TouchableOpacity onPress={() => { setDraftClassNames([]); setDraftStudentIds([]); }} style={{ padding: 4, marginRight: 4 }} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                <Feather name="x-circle" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
            )}
            <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>

          {/* Student row */}
          <TouchableOpacity
            onPress={() => setStudentSubPickerVisible(true)}
            style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 16 }}
          >
            <Feather name="user" size={16} color={colors.mutedForeground} style={{ marginRight: 12 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: colors.mutedForeground, marginBottom: 2 }}>Học viên</Text>
              <Text style={{ fontSize: 14, fontFamily: draftStudentIds.length > 0 ? "Inter_600SemiBold" : "Inter_400Regular", color: draftStudentIds.length > 0 ? colors.primary : colors.foreground }}>
                {draftStudentIds.length === 0
                  ? "Tất cả học viên"
                  : draftStudentIds.length === 1
                    ? (availableStudents.find((s) => s.id === draftStudentIds[0])?.name ?? "Học viên")
                    : `${draftStudentIds.length} học viên`}
              </Text>
            </View>
            {draftStudentIds.length > 0 && (
              <TouchableOpacity onPress={() => setDraftStudentIds([])} style={{ padding: 4, marginRight: 4 }} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                <Feather name="x-circle" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
            )}
            <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>

          {/* Apply button */}
          <View style={{ padding: 16, paddingBottom: insets.bottom + 16, borderTopWidth: 1, borderTopColor: colors.border }}>
            <TouchableOpacity
              onPress={applyFilters}
              style={{ backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: "center" }}
            >
              <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" }}>Áp dụng</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Class sub-picker — multi-select */}
      <Modal visible={classSubPickerVisible} transparent animationType="slide" onRequestClose={() => setClassSubPickerVisible(false)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)" }} activeOpacity={1} onPress={() => setClassSubPickerVisible(false)} />
        <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "65%", position: "absolute", bottom: 0, left: 0, right: 0, borderWidth: 1, borderColor: colors.border }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <TouchableOpacity onPress={() => setDraftClassNames([])}>
              <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: colors.mutedForeground }}>Bỏ chọn tất cả</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: colors.foreground }}>
              Chọn lớp {draftClassNames.length > 0 ? `(${draftClassNames.length})` : ""}
            </Text>
            <TouchableOpacity onPress={() => setClassSubPickerVisible(false)}><Feather name="x" size={18} color={colors.mutedForeground} /></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ paddingVertical: 6 }}>
            {availableClasses.map((cls, idx) => {
              const isSelected = draftClassNames.includes(cls);
              const isLast = idx === availableClasses.length - 1;
              return (
                <TouchableOpacity
                  key={cls}
                  onPress={() => toggleDraftClass(cls)}
                  style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: isLast ? 0 : 1, borderBottomColor: colors.border }}
                >
                  <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: isSelected ? colors.primary : colors.border, backgroundColor: isSelected ? colors.primary : "transparent", alignItems: "center", justifyContent: "center", marginRight: 12 }}>
                    {isSelected && <Feather name="check" size={13} color="#fff" />}
                  </View>
                  <Text style={{ flex: 1, fontSize: 14, fontFamily: isSelected ? "Inter_600SemiBold" : "Inter_400Regular", color: isSelected ? colors.primary : colors.foreground }}>
                    {cls}
                  </Text>
                </TouchableOpacity>
              );
            })}
            {availableClasses.length === 0 && (
              <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular", textAlign: "center", paddingVertical: 24 }}>Không có dữ liệu</Text>
            )}
            <View style={{ height: insets.bottom + 12 }} />
          </ScrollView>
        </View>
      </Modal>

      {/* Student sub-picker — multi-select */}
      <Modal visible={studentSubPickerVisible} transparent animationType="slide" onRequestClose={() => setStudentSubPickerVisible(false)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)" }} activeOpacity={1} onPress={() => setStudentSubPickerVisible(false)} />
        <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "65%", position: "absolute", bottom: 0, left: 0, right: 0, borderWidth: 1, borderColor: colors.border }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <TouchableOpacity onPress={() => setDraftStudentIds([])}>
              <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: colors.mutedForeground }}>Bỏ chọn tất cả</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: colors.foreground }}>
              Chọn học viên {draftStudentIds.length > 0 ? `(${draftStudentIds.length})` : ""}
            </Text>
            <TouchableOpacity onPress={() => setStudentSubPickerVisible(false)}><Feather name="x" size={18} color={colors.mutedForeground} /></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ paddingVertical: 6 }}>
            {availableStudents.map((s, idx) => {
              const isSelected = draftStudentIds.includes(s.id);
              const isLast = idx === availableStudents.length - 1;
              return (
                <TouchableOpacity
                  key={s.id}
                  onPress={() => toggleDraftStudent(s.id)}
                  style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: isLast ? 0 : 1, borderBottomColor: colors.border }}
                >
                  <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: isSelected ? colors.primary : colors.border, backgroundColor: isSelected ? colors.primary : "transparent", alignItems: "center", justifyContent: "center", marginRight: 12 }}>
                    {isSelected && <Feather name="check" size={13} color="#fff" />}
                  </View>
                  <Text style={{ flex: 1, fontSize: 14, fontFamily: isSelected ? "Inter_600SemiBold" : "Inter_400Regular", color: isSelected ? colors.primary : colors.foreground }}>
                    {s.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
            {availableStudents.length === 0 && (
              <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular", textAlign: "center", paddingVertical: 24 }}>
                Không có học viên nào
              </Text>
            )}
            <View style={{ height: insets.bottom + 12 }} />
          </ScrollView>
        </View>
      </Modal>

      {/* Calendar date picker */}
      <Modal visible={datePickerTarget !== null} transparent animationType="slide" onRequestClose={() => setDatePickerTarget(null)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)" }} activeOpacity={1} onPress={() => setDatePickerTarget(null)} />
        <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, position: "absolute", bottom: 0, left: 0, right: 0, borderWidth: 1, borderColor: colors.border, paddingBottom: insets.bottom + 16 }}>
          {/* Picker header */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <TouchableOpacity onPress={() => {
              if (datePickerTarget === "from") setDraftDateFrom(null);
              else setDraftDateTo(null);
              setDatePickerTarget(null);
            }}>
              <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: colors.mutedForeground }}>Xoá</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: colors.foreground }}>
              {datePickerTarget === "from" ? "Từ ngày" : "Đến ngày"}
            </Text>
            <TouchableOpacity onPress={() => setDatePickerTarget(null)}>
              <Feather name="x" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          {/* Month navigation */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 12 }}>
            <TouchableOpacity onPress={() => goPickerMonth(-1)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="chevron-left" size={20} color={colors.foreground} />
            </TouchableOpacity>
            <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: colors.foreground }}>
              {MONTH_NAMES[pickerMonth]}, {pickerYear}
            </Text>
            <TouchableOpacity onPress={() => goPickerMonth(1)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="chevron-right" size={20} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          {/* Weekday labels */}
          <View style={{ flexDirection: "row", paddingHorizontal: 12, marginBottom: 4 }}>
            {["CN","T2","T3","T4","T5","T6","T7"].map((d) => (
              <Text key={d} style={{ width: "14.28%", textAlign: "center", fontSize: 11, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground }}>{d}</Text>
            ))}
          </View>

          {/* Day grid */}
          {(() => {
            const daysInMonth = new Date(pickerYear, pickerMonth + 1, 0).getDate();
            const firstDay = new Date(pickerYear, pickerMonth, 1).getDay();
            const activeDate = datePickerTarget === "from" ? draftDateFrom : draftDateTo;
            const activeDateStr = activeDate ?? "";
            const cells: React.ReactElement[] = [];
            for (let i = 0; i < firstDay; i++) {
              cells.push(<View key={`blank${i}`} style={{ width: "14.28%" }} />);
            }
            for (let d = 1; d <= daysInMonth; d++) {
              const dateStr = `${pickerYear}-${String(pickerMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
              const isSelected = dateStr === activeDateStr;
              cells.push(
                <TouchableOpacity
                  key={d}
                  onPress={() => {
                    if (datePickerTarget === "from") setDraftDateFrom(dateStr);
                    else setDraftDateTo(dateStr);
                    setDatePickerTarget(null);
                  }}
                  style={{ width: "14.28%", aspectRatio: 1, alignItems: "center", justifyContent: "center", marginBottom: 2 }}
                >
                  <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: isSelected ? colors.primary : "transparent", alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontSize: 14, fontFamily: isSelected ? "Inter_700Bold" : "Inter_400Regular", color: isSelected ? "#fff" : colors.foreground }}>{d}</Text>
                  </View>
                </TouchableOpacity>
              );
            }
            return <View style={{ flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 12 }}>{cells}</View>;
          })()}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  monthNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  monthLabel: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
  navBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
  },
  filterBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  filterBtnActive: {
    backgroundColor: "#fff",
  },
  filterBtnText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "rgba(255,255,255,0.85)",
  },
  filterBtnTextActive: {
    color: "#2563eb",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
    marginTop: 4,
  },
  sectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sectionTitle: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
    overflow: "hidden",
  },
  cardTop: {
    flexDirection: "row",
    padding: 14,
    paddingBottom: 10,
    alignItems: "flex-start",
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  typeBadgeText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
  },
  scoreBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  scoreBadgeText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
  },
  homeworkTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    lineHeight: 20,
  },
  studentName: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  classInfo: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  statusChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  gradeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  gradeChipText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  empty: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 40,
    alignItems: "center",
    gap: 12,
    marginTop: 20,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
});
