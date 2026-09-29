import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
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

// ─── Types ────────────────────────────────────────────────────────────────────
interface AttendanceDay {
  workDate: string;
  timeIn: string | null;
  timeOut: string | null;
  tongCong: number;
  workedHours: number;
  note: string | null;
}

interface HRSummary {
  sheetId: string;
  sheetName: string;
  sheetMonth: string;
  soCong: number;
  luongCB: number;
  congThuc: number;
  luongTheoCong: number;
  phuCap: number;
  thuong: number;
  phat: number;
  luongDungLop: number;
  tongLuong: number;
  bhxh: number;
  bhyt: number;
  bhtn: number;
  thueTNCN: number;
  tamUng: number;
  thucNhan: number;
  daChi: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtCurrency(n: number | null | undefined) {
  if (n === null || n === undefined || isNaN(Number(n))) return "—";
  return Number(n).toLocaleString("vi-VN") + "đ";
}

const MONTH_NAMES = [
  "Tháng 1","Tháng 2","Tháng 3","Tháng 4",
  "Tháng 5","Tháng 6","Tháng 7","Tháng 8",
  "Tháng 9","Tháng 10","Tháng 11","Tháng 12",
];

const DAY_ABBR = ["CN","T2","T3","T4","T5","T6","T7"];

function getDaysInMonth(month: number, year: number): number {
  return new Date(year, month, 0).getDate();
}

function roundCong(v: number) {
  return parseFloat(v.toFixed(2));
}

function getTongCongStatus(tongCong: number): {
  label: string; color: string; bg: string; border: string;
} {
  const v = roundCong(tongCong);
  if (v > 1)    return { label: "Tăng ca",  color: "#2563eb", bg: "#eff6ff", border: "#bfdbfe" };
  if (v === 1)  return { label: "Đủ công",  color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0" };
  if (v >= 0.5) return { label: "Nửa công", color: "#d97706", bg: "#fffbeb", border: "#fde68a" };
  if (v > 0)    return { label: "Đi muộn",  color: "#ea580c", bg: "#fff7ed", border: "#fed7aa" };
  return          { label: "Vắng",    color: "#dc2626", bg: "#fef2f2", border: "#fecaca" };
}

// ─── Month Picker ─────────────────────────────────────────────────────────────
function MonthPicker({
  month, year, onChange,
}: {
  month: number; year: number;
  onChange: (m: number, y: number) => void;
}) {
  const prev = () => {
    if (month === 1) onChange(12, year - 1);
    else onChange(month - 1, year);
  };
  const next = () => {
    const now = new Date();
    if (year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth() + 1)) return;
    if (month === 12) onChange(1, year + 1);
    else onChange(month + 1, year);
  };
  const isAtMax = () => {
    const now = new Date();
    return year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth() + 1);
  };

  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 20, paddingVertical: 10 }}>
      <TouchableOpacity onPress={prev} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <View style={styles.arrowBtn}>
          <Feather name="chevron-left" size={18} color="#fff" />
        </View>
      </TouchableOpacity>
      <View style={{ alignItems: "center" }}>
        <Text style={{ fontSize: 20, fontFamily: "Inter_700Bold", color: "#fff" }}>
          {MONTH_NAMES[month - 1]}
        </Text>
        <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.7)" }}>
          {year}
        </Text>
      </View>
      <TouchableOpacity onPress={next} disabled={isAtMax()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <View style={[styles.arrowBtn, isAtMax() && { opacity: 0.3 }]}>
          <Feather name="chevron-right" size={18} color="#fff" />
        </View>
      </TouchableOpacity>
    </View>
  );
}

// ─── Salary helpers ───────────────────────────────────────────────────────────
function SectionDivider({ title }: { title: string }) {
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 }}>
      <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: "#9ca3af", letterSpacing: 0.8, textTransform: "uppercase" }}>
        {title}
      </Text>
    </View>
  );
}

function SalaryRow({
  label, value, accent, bold, dimLabel,
}: {
  label: string; value: string; accent?: string; bold?: boolean; dimLabel?: boolean;
}) {
  return (
    <View style={[styles.salRow, bold && { backgroundColor: "#f9fafb" }]}>
      <Text style={[styles.salLabel, dimLabel && { color: "#9ca3af" }, bold && { fontFamily: "Inter_600SemiBold", color: "#374151" }]}>
        {label}
      </Text>
      <Text style={[styles.salValue, { color: accent ?? "#1f2937", fontFamily: bold ? "Inter_700Bold" : "Inter_500Medium" }]}>
        {value}
      </Text>
    </View>
  );
}

// ─── Payslip Card ─────────────────────────────────────────────────────────────
function PayslipCard({ summary, colors }: { summary: HRSummary; colors: ReturnType<typeof useColors> }) {
  const [expanded, setExpanded] = useState(false);
  const totalDeductions = summary.bhxh + summary.bhyt + summary.bhtn + summary.thueTNCN + summary.tamUng;
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* Tappable header */}
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => setExpanded((v) => !v)}
        style={{ padding: 16, borderBottomWidth: expanded ? 1 : 0, borderBottomColor: colors.border, flexDirection: "row", alignItems: "center" }}
      >
        <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: "#eff6ff", alignItems: "center", justifyContent: "center", marginRight: 12 }}>
          <Feather name="file-text" size={18} color="#2563eb" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: colors.foreground }}>{summary.sheetName}</Text>
          <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 2 }}>
            Phiếu lương tháng {summary.sheetMonth.replace("-", "/")}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end", gap: 6 }}>
          <View style={[styles.statusBadge, { backgroundColor: summary.daChi ? "#f0fdf4" : "#fff7ed", borderColor: summary.daChi ? "#bbf7d0" : "#fed7aa" }]}>
            <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: summary.daChi ? "#16a34a" : "#f97316", marginRight: 5 }} />
            <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: summary.daChi ? "#15803d" : "#c2410c" }}>
              {summary.daChi ? "Đã chi" : "Chưa chi"}
            </Text>
          </View>
          <Feather name={expanded ? "chevron-up" : "chevron-down"} size={16} color={colors.mutedForeground} />
        </View>
      </TouchableOpacity>

      {/* Collapsed: show thực nhận summary */}
      {!expanded && (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12 }}>
          <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: colors.mutedForeground }}>Thực nhận</Text>
          <Text style={{ fontSize: 18, fontFamily: "Inter_700Bold", color: "#16a34a" }}>{fmtCurrency(summary.thucNhan)}</Text>
        </View>
      )}

      {/* Expanded content */}
      {expanded && (
        <>
          <SectionDivider title="Lương theo công" />
          <SalaryRow label="Lương cơ bản" value={fmtCurrency(summary.luongCB)} />
          <SalaryRow label="Số công thực tế" value={`${summary.soCong} công`} />
          <SalaryRow label="Số công quy đổi" value={`${summary.congThuc} công`} />
          <SalaryRow label="Lương theo công" value={fmtCurrency(summary.luongTheoCong)} bold />

          <SectionDivider title="Cộng thêm" />
          <SalaryRow label="Phụ cấp" value={fmtCurrency(summary.phuCap)} accent={summary.phuCap > 0 ? "#16a34a" : undefined} />
          <SalaryRow label="Thưởng" value={fmtCurrency(summary.thuong)} accent={summary.thuong > 0 ? "#16a34a" : undefined} />
          <SalaryRow label="Lương đứng lớp" value={fmtCurrency(summary.luongDungLop)} accent={summary.luongDungLop > 0 ? "#2563eb" : undefined} />
          {summary.phat > 0 && (
            <SalaryRow label="Phạt / Khấu trừ" value={`-${fmtCurrency(summary.phat)}`} accent="#dc2626" />
          )}

          <View style={{ marginHorizontal: 16, marginTop: 10, borderRadius: 10, backgroundColor: "#eff6ff", padding: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#1d4ed8" }}>Tổng lương (gross)</Text>
            <Text style={{ fontSize: 17, fontFamily: "Inter_700Bold", color: "#1d4ed8" }}>{fmtCurrency(summary.tongLuong)}</Text>
          </View>

          <SectionDivider title="Khấu trừ" />
          <SalaryRow label="BHXH (8%)" value={`-${fmtCurrency(summary.bhxh)}`} accent={summary.bhxh > 0 ? "#dc2626" : undefined} dimLabel />
          <SalaryRow label="BHYT (1.5%)" value={`-${fmtCurrency(summary.bhyt)}`} accent={summary.bhyt > 0 ? "#dc2626" : undefined} dimLabel />
          <SalaryRow label="BHTN (1%)" value={`-${fmtCurrency(summary.bhtn)}`} accent={summary.bhtn > 0 ? "#dc2626" : undefined} dimLabel />
          <SalaryRow label="Thuế TNCN" value={summary.thueTNCN > 0 ? `-${fmtCurrency(summary.thueTNCN)}` : "Không"} accent={summary.thueTNCN > 0 ? "#dc2626" : "#16a34a"} dimLabel />
          <SalaryRow label="Tạm ứng" value={summary.tamUng > 0 ? `-${fmtCurrency(summary.tamUng)}` : "Không"} accent={summary.tamUng > 0 ? "#dc2626" : "#16a34a"} dimLabel />
          {totalDeductions > 0 && (
            <SalaryRow label="Tổng khấu trừ" value={`-${fmtCurrency(totalDeductions)}`} accent="#dc2626" bold />
          )}

          <View style={{ margin: 16, marginTop: 12, borderRadius: 14, overflow: "hidden" }}>
            <View
              style={{ backgroundColor: "#16a34a", padding: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
            >
              <View>
                <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.8)" }}>Thực nhận</Text>
                <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.6)", marginTop: 2 }}>
                  Sau tất cả khấu trừ
                </Text>
              </View>
              <Text style={{ fontSize: 24, fontFamily: "Inter_700Bold", color: "#fff" }}>
                {fmtCurrency(summary.thucNhan)}
              </Text>
            </View>
          </View>
        </>
      )}
    </View>
  );
}

// ─── Attendance Stats strip ───────────────────────────────────────────────────
function AttendanceStats({ days }: { days: AttendanceDay[] }) {
  const full     = days.filter((d) => roundCong(d.tongCong) === 1).length;
  const overtime = days.filter((d) => roundCong(d.tongCong) > 1).length;
  const half     = days.filter((d) => { const v = roundCong(d.tongCong); return v >= 0.5 && v < 1; }).length;
  const late     = days.filter((d) => { const v = roundCong(d.tongCong); return v > 0 && v < 0.5; }).length;
  const stats = [
    { label: "Đủ công",  value: full,     color: "#16a34a", bg: "#f0fdf4" },
    { label: "Tăng ca",  value: overtime, color: "#2563eb", bg: "#eff6ff" },
    { label: "Nửa công", value: half,     color: "#d97706", bg: "#fffbeb" },
    { label: "Đi muộn",  value: late,     color: "#ea580c", bg: "#fff7ed" },
  ];
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {stats.map((s) => (
        <View key={s.label} style={{ flex: 1, minWidth: "45%", backgroundColor: s.bg, borderRadius: 10, padding: 10, alignItems: "center", gap: 2 }}>
          <Text style={{ fontSize: 20, fontFamily: "Inter_700Bold", color: s.color }}>{s.value}</Text>
          <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: s.color }}>{s.label}</Text>
        </View>
      ))}
    </View>
  );
}

// ─── Attendance Calendar Grid (3 per row) ─────────────────────────────────────
const COLS = 3;

function AttendanceCalendar({
  days, month, year, colors,
}: {
  days: AttendanceDay[];
  month: number; year: number;
  colors: ReturnType<typeof useColors>;
}) {
  const dayMap: Record<string, AttendanceDay> = {};
  days.forEach((d) => { dayMap[d.workDate] = d; });

  const totalDays = getDaysInMonth(month, year);

  // Build rows of 3
  const rows: Array<Array<number | null>> = [];
  let row: Array<number | null> = [];
  for (let d = 1; d <= totalDays; d++) {
    row.push(d);
    if (row.length === COLS) { rows.push(row); row = []; }
  }
  if (row.length > 0) {
    while (row.length < COLS) row.push(null);
    rows.push(row);
  }

  const pad2 = (n: number) => String(n).padStart(2, "0");

  function CellDay({ dayNum }: { dayNum: number | null }) {
    if (!dayNum) return <View style={{ flex: 1 }} />;

    const dateStr = `${year}-${pad2(month)}-${pad2(dayNum)}`;
    const att = dayMap[dateStr];
    const dow = new Date(year, month - 1, dayNum).getDay();

    if (!att) {
      // No attendance recorded — show as a light placeholder
      const isWeekend = dow === 0 || dow === 6;
      return (
        <View style={[styles.calCell, { backgroundColor: isWeekend ? "#f9fafb" : colors.card, borderColor: colors.border }]}>
          <View style={[styles.calDayNumWrap, { backgroundColor: "#f3f4f6" }]}>
            <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: isWeekend ? "#d1d5db" : "#9ca3af" }}>
              {dayNum}
            </Text>
          </View>
          <Text style={{ fontSize: 9, fontFamily: "Inter_400Regular", color: "#d1d5db", marginTop: 4 }}>
            {DAY_ABBR[dow]}
          </Text>
        </View>
      );
    }

    const st = getTongCongStatus(att.tongCong);
    return (
      <View style={[styles.calCell, { backgroundColor: st.bg, borderColor: st.border }]}>
        {/* Day number */}
        <View style={[styles.calDayNumWrap, { backgroundColor: st.color + "22" }]}>
          <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: st.color }}>
            {dayNum}
          </Text>
        </View>

        {/* Day of week */}
        <Text style={{ fontSize: 9, fontFamily: "Inter_600SemiBold", color: st.color + "aa", marginTop: 3 }}>
          {DAY_ABBR[dow]}
        </Text>

        {/* Status badge */}
        <View style={{ backgroundColor: st.color + "22", borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2, marginTop: 5, alignSelf: "stretch", alignItems: "center" }}>
          <Text style={{ fontSize: 9, fontFamily: "Inter_700Bold", color: st.color }} numberOfLines={1}>
            {st.label}
          </Text>
        </View>

        {/* Time in/out */}
        {(att.timeIn || att.timeOut) && (
          <View style={{ marginTop: 5, gap: 2, alignSelf: "stretch" }}>
            {att.timeIn && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                <Feather name="log-in" size={9} color={st.color} />
                <Text style={{ fontSize: 9, fontFamily: "Inter_500Medium", color: st.color }}>{att.timeIn}</Text>
              </View>
            )}
            {att.timeOut && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                <Feather name="log-out" size={9} color={st.color} />
                <Text style={{ fontSize: 9, fontFamily: "Inter_500Medium", color: st.color }}>{att.timeOut}</Text>
              </View>
            )}
          </View>
        )}

        {/* Công value */}
        <View style={{ flex: 1, justifyContent: "flex-end", alignItems: "flex-end", alignSelf: "stretch", marginTop: 4 }}>
          <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: st.color, lineHeight: 18 }}>
            {roundCong(att.tongCong)}
          </Text>
          <Text style={{ fontSize: 8, fontFamily: "Inter_400Regular", color: st.color + "99" }}>công</Text>
        </View>

        {/* Note */}
        {!!att.note && (
          <Text style={{ fontSize: 8, fontFamily: "Inter_400Regular", color: "#f97316", marginTop: 2 }} numberOfLines={1}>
            {att.note}
          </Text>
        )}
      </View>
    );
  }

  if (days.length === 0) {
    return (
      <View style={{ alignItems: "center", paddingVertical: 28, gap: 8 }}>
        <Feather name="calendar" size={32} color={colors.mutedForeground} />
        <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
          Chưa có dữ liệu chấm công
        </Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 8 }}>
      {rows.map((r, ri) => (
        <View key={ri} style={{ flexDirection: "row", gap: 8 }}>
          {r.map((dayNum, ci) => (
            <View key={ci} style={{ flex: 1 }}>
              <CellDay dayNum={dayNum} />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function StaffSalarySummaryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = insets.top;

  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear]   = useState(now.getFullYear());

  const [hrSummary,  setHrSummary]  = useState<HRSummary | null>(null);
  const [attendance, setAttendance] = useState<AttendanceDay[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg,   setErrorMsg]   = useState<string | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setErrorMsg(null);
    try {
      const [hr, att] = await Promise.allSettled([
        apiGet<HRSummary | null>(`/api/mobile/staff/payroll/hr-summary?month=${month}&year=${year}`),
        apiGet<AttendanceDay[]>(`/api/mobile/staff/payroll/attendance?month=${month}&year=${year}`),
      ]);
      setHrSummary(hr.status === "fulfilled" ? hr.value : null);
      setAttendance(att.status === "fulfilled" && Array.isArray(att.value) ? att.value : []);
      if (hr.status === "rejected") {
        const err = hr.reason as any;
        if (err?.status === 401) setErrorMsg("Phiên đăng nhập đã hết hạn.");
        else if (err?.status === 403) setErrorMsg("Bạn không có quyền truy cập.");
      }
    } catch {
      setErrorMsg("Không thể tải dữ liệu. Vui lòng thử lại.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [month, year]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onMonthChange = (m: number, y: number) => { setMonth(m); setYear(y); };
  const onRefresh = () => { setRefreshing(true); fetchData(true); };

  const totalAttCong = attendance.reduce((s, d) => s + d.tongCong, 0);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View
        style={{ backgroundColor: colors.gradientStart, paddingTop: topPad + 12, paddingHorizontal: 16, paddingBottom: 8 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="arrow-left" size={22} color="#1e1b4b" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 20, fontFamily: "Inter_700Bold", color: "#1e1b4b" }}>Bảng tổng lương</Text>
            <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(30,27,75,0.65)", marginTop: 1 }}>
              Lương tổng hợp nhân sự theo tháng
            </Text>
          </View>
        </View>
        <MonthPicker month={month} year={year} onChange={onMonthChange} />
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
            Đang tải bảng lương...
          </Text>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 14, paddingBottom: 100 + insets.bottom, gap: 14 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} progressBackgroundColor={colors.card} />}
        >
          {/* Error banner */}
          {!!errorMsg && (
            <View style={{ backgroundColor: "#fef2f2", borderRadius: 10, padding: 12, borderWidth: 1, borderColor: "#fecaca", flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Feather name="alert-circle" size={16} color="#dc2626" />
              <Text style={{ flex: 1, fontSize: 13, fontFamily: "Inter_500Medium", color: "#dc2626" }}>{errorMsg}</Text>
            </View>
          )}

          {/* No payslip */}
          {!hrSummary && !errorMsg && (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, alignItems: "center", padding: 32, gap: 12 }]}>
              <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: "#f3f4f6", alignItems: "center", justifyContent: "center" }}>
                <Feather name="file-text" size={28} color="#9ca3af" />
              </View>
              <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: colors.foreground }}>
                Chưa có phiếu lương
              </Text>
              <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center", lineHeight: 20 }}>
                Bộ phận kế toán chưa lập bảng lương cho {MONTH_NAMES[month - 1]} {year}.
              </Text>
              <TouchableOpacity
                onPress={onRefresh}
                style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: colors.primary }}
              >
                <Feather name="refresh-cw" size={14} color={colors.primary} />
                <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.primary }}>Kiểm tra lại</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Payslip */}
          {!!hrSummary && <PayslipCard summary={hrSummary} colors={colors} />}

          {/* Attendance card */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {/* Card header */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setShowCalendar((v) => !v)}
              style={{ flexDirection: "row", alignItems: "center", padding: 16 }}
            >
              <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: "#f0fdf4", alignItems: "center", justifyContent: "center", marginRight: 12 }}>
                <Feather name="calendar" size={18} color="#16a34a" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: colors.foreground }}>
                  Chấm công tháng
                </Text>
                <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
                  {attendance.length} ngày · Tổng {roundCong(totalAttCong)} công
                </Text>
              </View>
              <Feather name={showCalendar ? "chevron-up" : "chevron-down"} size={18} color={colors.mutedForeground} />
            </TouchableOpacity>

            {/* Stats strip */}
            <View style={{ paddingHorizontal: 14, paddingBottom: showCalendar ? 0 : 14 }}>
              <AttendanceStats days={attendance} />
            </View>

            {/* Calendar grid */}
            {showCalendar && (
              <View style={{ padding: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border, marginTop: 12 }}>
                <AttendanceCalendar
                  days={attendance}
                  month={month}
                  year={year}
                  colors={colors}
                />
              </View>
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  salRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: "#f3f4f6",
  },
  salLabel: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#374151",
    flex: 1,
  },
  salValue: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    textAlign: "right",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
  },
  arrowBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  calCell: {
    borderRadius: 12,
    borderWidth: 1.5,
    padding: 10,
    minHeight: 130,
    alignItems: "flex-start",
  },
  calDayNumWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
});
