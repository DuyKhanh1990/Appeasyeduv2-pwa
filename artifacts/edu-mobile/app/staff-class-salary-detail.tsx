import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "@/hooks/useSafeAreaInsets";

import { useColors } from "@/hooks/useColors";
import { apiGet, initApi } from "@/lib/api";
import { type SalaryBreakdown, type SalaryClass, type SalarySummary, type SessionDetail } from "@/lib/salaryStore";

// Shape of the old published-rows endpoint (fallback)
interface LegacyPublishedRow {
  salaryTableId: string;
  classId: string;
  sessions?: SessionDetail[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(d: string) {
  if (!d) return "";
  return d.split("-").reverse().join("/");
}

function fmtCurrency(n: number | null | undefined) {
  if (n === null || n === undefined || isNaN(Number(n))) return "—";
  return Number(n).toLocaleString("vi-VN") + "đ";
}

const PACKAGE_TYPE_LABELS: Record<string, string> = {
  "theo-gio": "Theo giờ",
  "theo-buoi": "Theo buổi",
  "theo-so-hv": "Theo số HV",
  "tong-so-gio": "Tổng giờ",
  "tong-so-buoi": "Tổng buổi",
};

function getDatesInRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const cur = new Date(start);
  const last = new Date(end);
  while (cur <= last) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

// ─── Session Grid ─────────────────────────────────────────────────────────────
const DOT_SIZE = 30;
const COLS = 7;
const DAY_LABELS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

function SessionGrid({
  sessions,
  packageId,
  startDate,
  endDate,
}: {
  sessions: SessionDetail[];
  packageId: string | null;
  startDate: string;
  endDate: string;
}) {
  const sessionMap: Record<string, SessionDetail> = {};
  sessions.forEach((s) => { sessionMap[s.sessionDate] = s; });

  const allDates = getDatesInRange(startDate, endDate);
  if (allDates.length === 0) return null;

  const firstDow = new Date(allDates[0]).getDay();
  const cells: Array<string | null> = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  allDates.forEach((d) => cells.push(d));

  const weeks: Array<typeof cells> = [];
  for (let i = 0; i < cells.length; i += COLS) {
    weeks.push(cells.slice(i, i + COLS));
  }

  function cellBg(date: string): string | null {
    const s = sessionMap[date];
    if (!s) return null;
    if (!s.isEligible) return "#f97316";
    if (!packageId) return "#a855f7";
    return "#22c55e";
  }

  return (
    <View style={{ paddingHorizontal: 16, paddingBottom: 14 }}>
      {/* Day header */}
      <View style={{ flexDirection: "row", marginBottom: 4 }}>
        {DAY_LABELS.map((d) => (
          <View key={d} style={{ width: DOT_SIZE, alignItems: "center" }}>
            <Text style={{ fontSize: 9, fontFamily: "Inter_600SemiBold", color: "#9ca3af" }}>{d}</Text>
          </View>
        ))}
      </View>

      {weeks.map((week, wi) => (
        <View key={wi} style={{ flexDirection: "row", marginBottom: 3 }}>
          {week.map((date, ci) => {
            if (!date) return <View key={ci} style={{ width: DOT_SIZE, height: DOT_SIZE }} />;
            const bg = cellBg(date);
            const day = parseInt(date.slice(8), 10);
            const s = sessionMap[date];
            return (
              <View key={ci} style={{ width: DOT_SIZE, height: DOT_SIZE, alignItems: "center", justifyContent: "center" }}>
                <View
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 6,
                    backgroundColor: bg ?? "transparent",
                    borderWidth: bg ? 0 : 1,
                    borderColor: "#e5e7eb",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 10,
                      fontFamily: bg ? "Inter_700Bold" : "Inter_400Regular",
                      color: bg ? "#fff" : "#d1d5db",
                    }}
                  >
                    {day}
                  </Text>
                </View>
              </View>
            );
          })}
          {week.length < COLS &&
            Array.from({ length: COLS - week.length }).map((_, i) => (
              <View key={`pad-${i}`} style={{ width: DOT_SIZE, height: DOT_SIZE }} />
            ))}
        </View>
      ))}

      {/* Session detail list */}
      {sessions.length > 0 && (
        <View style={{ marginTop: 8, gap: 4 }}>
          {sessions.map((s, i) => {
            const bg = !s.isEligible ? "#fff7ed" : !packageId ? "#faf5ff" : "#f0fdf4";
            const dot = !s.isEligible ? "#f97316" : !packageId ? "#a855f7" : "#22c55e";
            const textColor = !s.isEligible ? "#ea580c" : !packageId ? "#7c3aed" : "#15803d";
            return (
              <View
                key={i}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  backgroundColor: bg,
                  borderRadius: 8,
                  paddingHorizontal: 10,
                  paddingVertical: 7,
                }}
              >
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} />
                <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: textColor }}>
                  {fmtDate(s.sessionDate)}
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: textColor }}>
                    Buổi {s.sessionIndex}
                  </Text>
                  {s.coefficient !== 1 && (
                    <Text style={{ fontSize: 10, fontFamily: "Inter_400Regular", color: textColor }}>
                      ×{s.coefficient}
                    </Text>
                  )}
                </View>
                <View style={{ flex: 1, alignItems: "flex-end" }}>
                  <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: textColor }}>
                    {s.attendedCount} HV · {s.durationHours}h
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Legend */}
      <View style={{ flexDirection: "row", gap: 12, marginTop: 10, flexWrap: "wrap" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: "#22c55e" }} />
          <Text style={{ fontSize: 10, fontFamily: "Inter_400Regular", color: "#6b7280" }}>Hợp lệ + gói</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: "#a855f7" }} />
          <Text style={{ fontSize: 10, fontFamily: "Inter_400Regular", color: "#6b7280" }}>Hợp lệ, chưa gắn gói</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: "#f97316" }} />
          <Text style={{ fontSize: 10, fontFamily: "Inter_400Regular", color: "#6b7280" }}>Chưa điểm danh</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Class Row ────────────────────────────────────────────────────────────────
function ClassRow({
  cls,
  sessions,
  startDate,
  endDate,
  colors,
}: {
  cls: SalaryClass;
  sessions: SessionDetail[];
  startDate: string;
  endDate: string;
  colors: ReturnType<typeof useColors>;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasPackage = !!cls.packageId;
  const salary = Number(cls.totalSalary);
  const hasSessions = sessions.length > 0;

  return (
    <View style={{ borderTopWidth: 1, borderTopColor: colors.border }}>
      <TouchableOpacity
        activeOpacity={hasSessions ? 0.7 : 1}
        onPress={() => hasSessions && setExpanded((v) => !v)}
        style={{ paddingHorizontal: 16, paddingVertical: 13, flexDirection: "row", alignItems: "center", gap: 10 }}
      >
        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: "#eff6ff", alignItems: "center", justifyContent: "center" }}>
          <Feather name="book-open" size={16} color="#2563eb" />
        </View>

        <View style={{ flex: 1, gap: 3 }}>
          <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold", color: colors.foreground }} numberOfLines={1}>
            {cls.className}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
              {cls.role}
            </Text>
            {!hasPackage ? (
              <View style={{ backgroundColor: "#fdf4ff", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: "#e9d5ff" }}>
                <Text style={{ fontSize: 10, fontFamily: "Inter_600SemiBold", color: "#7c3aed" }}>Chưa gắn gói</Text>
              </View>
            ) : (
              <View style={{ backgroundColor: "#f0fdf4", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: "#bbf7d0" }}>
                <Text style={{ fontSize: 10, fontFamily: "Inter_600SemiBold", color: "#15803d" }}>{cls.packageName}</Text>
              </View>
            )}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Feather name="check-circle" size={11} color="#15803d" />
            <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: "#15803d" }}>
              {Number(cls.totalEligibleSessions)} buổi đủ điều kiện
            </Text>
            {hasSessions && (
              <Text style={{ fontSize: 10, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginLeft: 2 }}>
                · nhấn để xem lịch
              </Text>
            )}
          </View>
        </View>

        <View style={{ alignItems: "flex-end", gap: 4 }}>
          {!hasPackage ? (
            <View style={{ backgroundColor: "#fdf4ff", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
              <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#7c3aed" }}>Chưa tính</Text>
            </View>
          ) : (
            <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: "#16a34a" }}>
              {fmtCurrency(salary)}
            </Text>
          )}
          {hasSessions && (
            <Feather name={expanded ? "chevron-up" : "chevron-down"} size={14} color={colors.mutedForeground} />
          )}
        </View>
      </TouchableOpacity>

      {expanded && hasSessions && (
        <SessionGrid
          sessions={sessions}
          packageId={cls.packageId}
          startDate={startDate}
          endDate={endDate}
        />
      )}
    </View>
  );
}

// ─── Detail Screen ────────────────────────────────────────────────────────────
export default function StaffClassSalaryDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = insets.top;

  const { id } = useLocalSearchParams<{ id: string }>();
  const [table, setTable] = useState<SalaryBreakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const rawId = Array.isArray(id) ? id[0] : id;
    if (!rawId) { setLoading(false); return; }
    setLoading(true);
    setErrorMsg(null);

    async function fetchBreakdown() {
      await initApi();

      // 1. Thử API mới trước
      try {
        const data = await apiGet<SalaryBreakdown>(
          `/api/mobile/staff/salary-tables/${rawId}/breakdown`
        );
        return data;
      } catch (err: any) {
        // Nếu server trả HTML (chưa deploy) hoặc lỗi không rõ → fallback
        const isHtmlResponse = err?.message?.includes("<!DOCTYPE") ||
          err?.message?.includes("not valid JSON") ||
          err?.message?.includes("Unexpected token");
        if (!isHtmlResponse && err?.status) throw err; // lỗi HTTP thật → không fallback
      }

      // 2. Fallback: build breakdown từ salary-summary + published-rows
      const [summaries, rows] = await Promise.all([
        apiGet<SalarySummary[]>("/api/mobile/staff/payroll/salary-summary"),
        apiGet<LegacyPublishedRow[]>("/api/mobile/staff/payroll/published-rows"),
      ]);
      const summary = summaries.find((s) => s.salaryTableId === rawId);
      if (!summary) throw Object.assign(new Error("not found"), { status: 404 });
      return {
        ...summary,
        classes: summary.classes.map((cls) => ({
          ...cls,
          sessions: rows.find(
            (r) => r.salaryTableId === rawId && r.classId === cls.classId
          )?.sessions ?? [],
        })),
      } as SalaryBreakdown;
    }

    fetchBreakdown()
      .then(setTable)
      .catch((err: any) => {
        console.error("[salary detail] error status:", err?.status, "msg:", err?.message);
        if (err?.status === 401) setErrorMsg("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
        else if (err?.status === 403) setErrorMsg("Bạn không có quyền xem bảng lương này.");
        else if (err?.status === 404) setErrorMsg("Bảng lương không tồn tại.");
        else setErrorMsg("Không thể tải chi tiết. Vui lòng thử lại.");
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (errorMsg || !table) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, gap: 12 }}>
        <Text style={{ fontSize: 14, fontFamily: "Inter_500Medium", color: colors.mutedForeground, textAlign: "center" }}>
          {errorMsg ?? "Không tìm thấy dữ liệu"}
        </Text>
        <TouchableOpacity onPress={() => router.back()} style={{ paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.primary }}>
          <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" }}>Quay lại</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const grandTotal = Number(table.grandTotal);
  const totalEligible = table.classes.reduce((sum, c) => sum + Number(c.totalEligibleSessions), 0);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View
        style={{ backgroundColor: colors.gradientStart, paddingTop: (Platform.OS === "web" ? topPad : insets.top) + 12, paddingBottom: 18, paddingHorizontal: 16 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="arrow-left" size={22} color="#1e1b4b" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 18, fontFamily: "Inter_700Bold", color: "#1e1b4b" }} numberOfLines={1}>
              {table.salaryTableName}
            </Text>
            <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(30,27,75,0.65)", marginTop: 1 }}>
              {fmtDate(table.startDate)} – {fmtDate(table.endDate)}
              {table.locationName ? ` · ${table.locationName}` : ""}
            </Text>
          </View>
          <View style={{ backgroundColor: "rgba(30,27,75,0.1)", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6, alignItems: "flex-end" }}>
            <Text style={{ fontSize: 10, fontFamily: "Inter_500Medium", color: "rgba(30,27,75,0.65)" }}>Tổng nhận</Text>
            <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: "#1e1b4b" }}>{fmtCurrency(grandTotal)}</Text>
          </View>
        </View>
      </View>

      {/* Summary strip */}
      <View style={{ flexDirection: "row", backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border, paddingHorizontal: 20, paddingVertical: 10, gap: 20 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
          <Feather name="layers" size={13} color="#2563eb" />
          <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: "#2563eb" }}>
            {table.classes.length} lớp
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
          <Feather name="check-circle" size={13} color="#15803d" />
          <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: "#15803d" }}>
            {totalEligible} buổi hợp lệ
          </Text>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Class list card */}
        <View style={{ margin: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, overflow: "hidden" }}>
          {table.classes.map((cls) => (
            <ClassRow
              key={cls.classId}
              cls={cls}
              sessions={cls.sessions ?? []}
              startDate={table.startDate}
              endDate={table.endDate}
              colors={colors}
            />
          ))}

          {/* Footer total */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 13, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: "#f9fafb" }}>
            <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground }}>
              Tổng bảng lương này
            </Text>
            <Text style={{ fontSize: 17, fontFamily: "Inter_700Bold", color: "#16a34a" }}>
              {fmtCurrency(grandTotal)}
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({});
