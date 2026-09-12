import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
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
import { usePermissions } from "@/hooks/usePermissions";
import { apiGet } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CustomerData {
  customerSummary: { total: number; hocVien: number; hocVienPct: number; phuHuynh: number; phuHuynhPct: number; active: number; activePct: number; inactive: number };
  accountStatus: { active: number; activePct: number; inactive: number };
  newCustomers: { today: number; thisMonth: number };
  learningStatus: { dangHoc: number; baoLuu: number; choLich: number; daNghi: number; chuaCoLich: number; total: number };
  byRelationship: { name: string; count: number; color: string }[];
  bySource: { name: string; count: number; pct: number }[];
  byLocation: { name: string; count: number; pct: number }[];
  byStaff: { name: string; count: number; pct: number }[];
  monthlyCounts: { monthKey: string; label: string; count: number; growthPct: number }[];
}

interface TrainingData {
  formatSummary: { total: number; offline: number; offlinePct: number; online: number; onlinePct: number };
  statusSummary: { active: number; recruiting: number; planning: number; closed: number; total: number };
  newClasses: { today: number; thisMonth: number };
  byLocation: { locationId: string; locationName: string; total: number; active: number; closed: number }[];
  monthlyAttendance: { monthKey: string; label: string; total: number; present: number; rate: number }[];
  byTeacher: { name: string; count: number; pct: number }[];
  byTeacherSessions: { name: string; count: number; pct: number }[];
}

interface FinanceData {
  invoiceSummary: {
    totalCount: number;
    byStatus: { unpaid: number; partial: number; paid: number; debt: number; cancelled: number };
    totalRevenue: number; actualCollected: number; debtAmount: number;
    expectedIncome: number; expectedExpense: number;
    actualIncome: number; actualExpense: number;
    debtIncome: number; debtExpense: number;
  };
  byCategory: {
    income: { total: number; categories: { name: string; amount: number; pct: number }[] };
    expense: { total: number; categories: { name: string; amount: number; pct: number }[] };
  };
  revenueByLocation: {
    rows: { locationId: string; locationName: string; totalIncome: number; totalExpense: number; profit: number }[];
    totals: { totalIncome: number; totalExpense: number; profit: number };
  };
  debtSummary: {
    totalDebtAmount: number; totalCount: number;
    byStatus: { key: string; label: string; count: number; amount: number; pct: number }[];
  };
}

// ─── Time filter ──────────────────────────────────────────────────────────────

type FilterKey = "today" | "week" | "month" | "3m" | "6m" | "year";
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "today", label: "Hôm nay" },
  { key: "week",  label: "Tuần này" },
  { key: "month", label: "Tháng này" },
  { key: "3m",    label: "3 tháng" },
  { key: "6m",    label: "6 tháng" },
  { key: "year",  label: "Năm nay" },
];

function buildDateParams(filter: FilterKey): string {
  const now = new Date();
  const fmt = (d: Date) => d.toISOString().split("T")[0];
  const today = fmt(now);

  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay() + 1);

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfYear  = new Date(now.getFullYear(), 0, 1);

  const daysAgo = (n: number) => { const d = new Date(now); d.setDate(d.getDate() - n); return d; };

  const map: Record<FilterKey, { from: string; to: string }> = {
    today: { from: today, to: today },
    week:  { from: fmt(startOfWeek), to: today },
    month: { from: fmt(startOfMonth), to: today },
    "3m":  { from: fmt(daysAgo(90)), to: today },
    "6m":  { from: fmt(daysAgo(180)), to: today },
    year:  { from: fmt(startOfYear), to: today },
  };
  const { from, to } = map[filter];
  return `dateFrom=${from}&dateTo=${to}`;
}

// ─── Shared UI helpers ────────────────────────────────────────────────────────

function fmtMoney(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}T`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}tr`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

function fmtMoneyFull(n: number): string {
  return n.toLocaleString("vi-VN") + "đ";
}

function Bar({ pct, color, height = 7 }: { pct: number; color: string; height?: number }) {
  return (
    <View style={{ flex: 1, height, borderRadius: height, backgroundColor: color + "22", overflow: "hidden" }}>
      <View style={{ width: `${Math.min(100, Math.max(0, pct))}%`, height, borderRadius: height, backgroundColor: color }} />
    </View>
  );
}

function Card({ title, icon, iconColor, children }: { title: string; icon: string; iconColor: string; children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={s.cardHeader}>
        <View style={[s.cardIcon, { backgroundColor: iconColor + "18" }]}>
          <Feather name={icon as any} size={15} color={iconColor} />
        </View>
        <Text style={[s.cardTitle, { color: colors.foreground }]}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function StatPill({ label, value, color, bg }: { label: string; value: string | number; color: string; bg: string }) {
  return (
    <View style={[s.pill, { backgroundColor: bg }]}>
      <Text style={[s.pillNum, { color }]}>{value}</Text>
      <Text style={s.pillLabel}>{label}</Text>
    </View>
  );
}

function BarRow({ label, value, pct, color, suffix }: { label: string; value: string | number; pct: number; color: string; suffix?: string }) {
  return (
    <View style={{ marginBottom: 9 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
        <Text style={s.rowLabel}>{label}</Text>
        <Text style={[s.rowValue, { color }]}>{value}{suffix}</Text>
      </View>
      <Bar pct={pct} color={color} />
    </View>
  );
}

function Divider() {
  return <View style={{ height: 1, backgroundColor: "#f3f4f6", marginVertical: 8 }} />;
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={s.center}>
      <Feather name="alert-circle" size={36} color="#ef4444" />
      <Text style={{ color: "#ef4444", marginTop: 10, fontFamily: "Inter_500Medium", fontSize: 14 }}>Không tải được dữ liệu</Text>
      <TouchableOpacity onPress={onRetry} style={s.retryBtn}>
        <Text style={{ color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 13 }}>Thử lại</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Tab: KHÁCH HÀNG — 9 widget ──────────────────────────────────────────────

function CustomerTab({ filter }: { filter: FilterKey }) {
  const [data, setData] = useState<CustomerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(false);
    try {
      const r = await apiGet<{ success: boolean; data: CustomerData }>(
        `/api/mobile/dashboard/customers?${buildDateParams(filter)}`
      );
      setData(r.data ?? null);
    } catch { setError(true); }
    finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color="#6c63ff" /></View>;
  if (error || !data) return <ErrorState onRetry={load} />;

  const cs = data.customerSummary;
  const ac = data.accountStatus;
  const ls = data.learningStatus;
  const lsTotal = ls.total || 1;

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

      {/* W1 — Tổng Khách hàng */}
      <Card title="Tổng Khách hàng" icon="users" iconColor="#6c63ff">
        <View style={s.pillRow}>
          <StatPill label="Tổng" value={cs.total} color="#6c63ff" bg="#f5f3ff" />
          <StatPill label="Hoạt động" value={cs.active} color="#16a34a" bg="#f0fdf4" />
          <StatPill label="Không HĐ" value={cs.inactive} color="#ef4444" bg="#fef2f2" />
        </View>
        <Divider />
        <BarRow label="Học viên" value={`${cs.hocVien} (${cs.hocVienPct}%)`} pct={cs.hocVienPct} color="#4F8EF7" />
        <BarRow label="Phụ huynh" value={`${cs.phuHuynh} (${cs.phuHuynhPct}%)`} pct={cs.phuHuynhPct} color="#F7A24F" />
      </Card>

      {/* W2 — Trạng thái tài khoản */}
      <Card title="Trạng thái tài khoản" icon="shield" iconColor="#0284c7">
        <View style={s.pillRow}>
          <StatPill label="Hoạt động" value={ac.active} color="#16a34a" bg="#f0fdf4" />
          <StatPill label="Không HĐ" value={ac.inactive} color="#ef4444" bg="#fef2f2" />
        </View>
        <View style={{ marginTop: 10 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
            <Text style={s.rowLabel}>Tỷ lệ hoạt động</Text>
            <Text style={[s.rowValue, { color: "#16a34a" }]}>{ac.activePct}%</Text>
          </View>
          <Bar pct={ac.activePct} color="#16a34a" height={10} />
        </View>
      </Card>

      {/* W3 — Khách hàng mới */}
      <Card title="Khách hàng mới" icon="user-plus" iconColor="#059669">
        <View style={s.pillRow}>
          <StatPill label="Hôm nay" value={data.newCustomers.today} color="#059669" bg="#f0fdf4" />
          <StatPill label="Tháng này" value={data.newCustomers.thisMonth} color="#0284c7" bg="#eff6ff" />
        </View>
      </Card>

      {/* W4 — Trạng thái học tập */}
      <Card title="Trạng thái học tập" icon="activity" iconColor="#8b5cf6">
        <BarRow label="Đang học"      value={ls.dangHoc}   pct={(ls.dangHoc / lsTotal) * 100}   color="#16a34a" />
        <BarRow label="Bảo lưu"       value={ls.baoLuu}    pct={(ls.baoLuu / lsTotal) * 100}    color="#f59e0b" />
        <BarRow label="Chờ xếp lịch"  value={ls.choLich}   pct={(ls.choLich / lsTotal) * 100}   color="#3b82f6" />
        <BarRow label="Đã nghỉ"       value={ls.daNghi}    pct={(ls.daNghi / lsTotal) * 100}    color="#ef4444" />
        {ls.chuaCoLich > 0 && <BarRow label="Chưa có lịch" value={ls.chuaCoLich} pct={(ls.chuaCoLich / lsTotal) * 100} color="#9ca3af" />}
      </Card>

      {/* W5 — Số lượng HV theo tháng */}
      {data.monthlyCounts.length > 0 && (
        <Card title="Số lượng HV theo tháng" icon="trending-up" iconColor="#6c63ff">
          {data.monthlyCounts.slice(-6).map((m, i) => (
            <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Text style={{ width: 56, fontSize: 11, fontFamily: "Inter_400Regular", color: "#6b7280" }}>{m.label}</Text>
              <Bar pct={(m.count / Math.max(...data.monthlyCounts.map(x => x.count), 1)) * 100} color="#6c63ff" height={9} />
              <Text style={{ width: 28, textAlign: "right", fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#374151" }}>{m.count}</Text>
              {m.growthPct !== 0 && (
                <Text style={{ width: 36, fontSize: 10, fontFamily: "Inter_500Medium", color: m.growthPct > 0 ? "#16a34a" : "#ef4444" }}>
                  {m.growthPct > 0 ? "▲" : "▼"}{Math.abs(m.growthPct)}%
                </Text>
              )}
            </View>
          ))}
        </Card>
      )}

      {/* W6 — Học viên theo Nguồn */}
      {data.bySource.length > 0 && (
        <Card title="Học viên theo Nguồn" icon="pie-chart" iconColor="#0ea5e9">
          {data.bySource.map((s2, i) => (
            <BarRow key={i} label={s2.name} value={`${s2.count}`} pct={s2.pct} color="#0ea5e9" suffix={` (${s2.pct}%)`} />
          ))}
        </Card>
      )}

      {/* W7 — Học viên theo Mối quan hệ */}
      {data.byRelationship.length > 0 && (
        <Card title="Học viên theo Mối quan hệ" icon="git-branch" iconColor="#f97316">
          {data.byRelationship.map((r, i) => {
            const relTotal = data.byRelationship.reduce((a, x) => a + x.count, 0) || 1;
            return (
              <BarRow key={i} label={r.name} value={r.count} pct={(r.count / relTotal) * 100} color={r.color || "#f97316"} />
            );
          })}
        </Card>
      )}

      {/* W8 — Học viên theo Cơ sở */}
      {data.byLocation.length > 0 && (
        <Card title="Học viên theo Cơ sở" icon="map-pin" iconColor="#e11d48">
          {data.byLocation.map((l, i) => (
            <BarRow key={i} label={l.name} value={`${l.count}`} pct={l.pct} color="#e11d48" suffix={` (${l.pct}%)`} />
          ))}
        </Card>
      )}

      {/* W9 — Học viên theo Nhân sự */}
      {data.byStaff.length > 0 && (
        <Card title="Học viên theo Nhân sự" icon="briefcase" iconColor="#7c3aed">
          {data.byStaff.map((st, i) => (
            <BarRow key={i} label={st.name} value={`${st.count}`} pct={st.pct} color="#7c3aed" suffix={` (${st.pct}%)`} />
          ))}
        </Card>
      )}
    </ScrollView>
  );
}

// ─── Tab: ĐÀO TẠO — 7 widget ─────────────────────────────────────────────────

function TrainingTab({ filter }: { filter: FilterKey }) {
  const [data, setData] = useState<TrainingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(false);
    try {
      const r = await apiGet<{ success: boolean; data: TrainingData }>(
        `/api/mobile/dashboard/training?${buildDateParams(filter)}`
      );
      setData(r.data ?? null);
    } catch { setError(true); }
    finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color="#6c63ff" /></View>;
  if (error || !data) return <ErrorState onRetry={load} />;

  const fs = data.formatSummary;
  const ss = data.statusSummary;
  const ssTotal = ss.total || 1;
  const maxTeacher = Math.max(...data.byTeacher.map(t => t.count), 1);
  const maxSessions = Math.max(...data.byTeacherSessions.map(t => t.count), 1);

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

      {/* W1 — Tổng số lớp học (Online/Offline) */}
      <Card title="Tổng số lớp học" icon="book-open" iconColor="#6c63ff">
        <View style={s.pillRow}>
          <StatPill label="Tổng" value={fs.total} color="#6c63ff" bg="#f5f3ff" />
          <StatPill label="Offline" value={fs.offline} color="#16a34a" bg="#f0fdf4" />
          <StatPill label="Online" value={fs.online} color="#0284c7" bg="#eff6ff" />
        </View>
        <Divider />
        <BarRow label="Offline" value={`${fs.offline} (${fs.offlinePct}%)`} pct={fs.offlinePct} color="#16a34a" />
        <BarRow label="Online"  value={`${fs.online} (${fs.onlinePct}%)`}  pct={fs.onlinePct}  color="#0284c7" />
      </Card>

      {/* W2 — Trạng thái lớp học */}
      <Card title="Trạng thái lớp học" icon="flag" iconColor="#8b5cf6">
        <BarRow label="Đang hoạt động"  value={ss.active}    pct={(ss.active    / ssTotal) * 100} color="#16a34a" />
        <BarRow label="Đang tuyển sinh" value={ss.recruiting} pct={(ss.recruiting / ssTotal) * 100} color="#3b82f6" />
        <BarRow label="Lên kế hoạch"    value={ss.planning}  pct={(ss.planning   / ssTotal) * 100} color="#f59e0b" />
        <BarRow label="Đã đóng"         value={ss.closed}    pct={(ss.closed     / ssTotal) * 100} color="#9ca3af" />
      </Card>

      {/* W3 — Lớp học mới */}
      <Card title="Lớp học mới" icon="plus-circle" iconColor="#059669">
        <View style={s.pillRow}>
          <StatPill label="Hôm nay"   value={data.newClasses.today}     color="#059669" bg="#f0fdf4" />
          <StatPill label="Tháng này" value={data.newClasses.thisMonth} color="#0284c7" bg="#eff6ff" />
        </View>
      </Card>

      {/* W4 — Tổng số lớp theo cơ sở */}
      {data.byLocation.length > 0 && (
        <Card title="Lớp theo Cơ sở" icon="map-pin" iconColor="#e11d48">
          {data.byLocation.map((loc, i) => {
            const maxLoc = Math.max(...data.byLocation.map(l => l.total), 1);
            return (
              <View key={i} style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                  <Text style={s.rowLabel}>{loc.locationName}</Text>
                  <Text style={[s.rowValue, { color: "#e11d48" }]}>Tổng: {loc.total}</Text>
                </View>
                <Bar pct={(loc.total / maxLoc) * 100} color="#e11d48" height={8} />
                <View style={{ flexDirection: "row", gap: 16, marginTop: 4 }}>
                  <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: "#16a34a" }}>Đang HĐ: {loc.active}</Text>
                  <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: "#9ca3af" }}>Đã đóng: {loc.closed}</Text>
                </View>
              </View>
            );
          })}
        </Card>
      )}

      {/* W5 — Tỷ lệ điểm danh theo tháng */}
      {data.monthlyAttendance.length > 0 && (
        <Card title="Tỷ lệ điểm danh theo tháng" icon="check-square" iconColor="#0ea5e9">
          {data.monthlyAttendance.slice(-6).map((m, i) => (
            <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Text style={{ width: 52, fontSize: 11, fontFamily: "Inter_400Regular", color: "#6b7280" }}>{m.label}</Text>
              <Bar pct={m.rate} color={m.rate >= 90 ? "#16a34a" : m.rate >= 70 ? "#f59e0b" : "#ef4444"} height={9} />
              <Text style={{ width: 38, textAlign: "right", fontSize: 12, fontFamily: "Inter_700Bold", color: m.rate >= 90 ? "#16a34a" : m.rate >= 70 ? "#f59e0b" : "#ef4444" }}>
                {m.rate}%
              </Text>
            </View>
          ))}
          <Divider />
          <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: "#9ca3af" }}>
            ✅ ≥90% · ⚠️ 70–89% · ❌ &lt;70%
          </Text>
        </Card>
      )}

      {/* W6 — Tổng số lớp giáo viên */}
      {data.byTeacher.length > 0 && (
        <Card title="Số lớp theo Giáo viên" icon="user" iconColor="#7c3aed">
          {data.byTeacher.map((t, i) => (
            <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Text style={{ flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", color: "#374151" }} numberOfLines={1}>{t.name}</Text>
              <Bar pct={(t.count / maxTeacher) * 100} color="#7c3aed" height={8} />
              <Text style={{ width: 24, textAlign: "right", fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#7c3aed" }}>{t.count}</Text>
            </View>
          ))}
        </Card>
      )}

      {/* W7 — Tổng số ca dạy giáo viên */}
      {data.byTeacherSessions.length > 0 && (
        <Card title="Số ca dạy theo Giáo viên" icon="clock" iconColor="#f97316">
          {data.byTeacherSessions.map((t, i) => (
            <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Text style={{ flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", color: "#374151" }} numberOfLines={1}>{t.name}</Text>
              <Bar pct={(t.count / maxSessions) * 100} color="#f97316" height={8} />
              <Text style={{ width: 36, textAlign: "right", fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#f97316" }}>
                {t.count} ca
              </Text>
            </View>
          ))}
        </Card>
      )}
    </ScrollView>
  );
}

// ─── Tab: TÀI CHÍNH — 5 widget ───────────────────────────────────────────────

function FinanceTab({ filter }: { filter: FilterKey }) {
  const [data, setData] = useState<FinanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(false);
    try {
      const r = await apiGet<{ success: boolean; data: FinanceData }>(
        `/api/mobile/dashboard/finance?${buildDateParams(filter)}`
      );
      setData(r.data ?? null);
    } catch { setError(true); }
    finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color="#6c63ff" /></View>;
  if (error || !data) return <ErrorState onRetry={load} />;

  const inv = data.invoiceSummary;
  const invTotal = inv.totalCount || 1;
  const cat = data.byCategory;
  const rev = data.revenueByLocation;
  const debt = data.debtSummary;

  const STATUS_COLORS: Record<string, string> = {
    paid: "#16a34a", unpaid: "#ef4444", partial: "#f59e0b", debt: "#dc2626", cancelled: "#9ca3af",
  };
  const STATUS_LABELS: Record<string, string> = {
    paid: "Đã thanh toán", unpaid: "Chưa thanh toán", partial: "Thanh toán một phần", debt: "Công nợ", cancelled: "Đã huỷ",
  };

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

      {/* W1 — Tổng hoá đơn */}
      <Card title="Tổng hoá đơn" icon="file-text" iconColor="#6c63ff">
        <View style={s.pillRow}>
          <StatPill label="Tổng HĐ"  value={inv.totalCount}             color="#6c63ff" bg="#f5f3ff" />
          <StatPill label="Doanh thu" value={fmtMoney(inv.totalRevenue)} color="#059669" bg="#f0fdf4" />
          <StatPill label="Thực thu"  value={fmtMoney(inv.actualCollected)} color="#16a34a" bg="#dcfce7" />
        </View>
        <Divider />
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={s.rowLabel}>Công nợ</Text>
          <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: "#ef4444" }}>{fmtMoneyFull(inv.debtAmount)}</Text>
        </View>
      </Card>

      {/* W2 — Trạng thái hoá đơn */}
      <Card title="Trạng thái hoá đơn" icon="layers" iconColor="#f59e0b">
        {(["paid", "unpaid", "partial", "debt", "cancelled"] as const).map((key) => {
          const count = inv.byStatus[key];
          if (count === 0) return null;
          return (
            <BarRow
              key={key}
              label={STATUS_LABELS[key]}
              value={count}
              pct={(count / invTotal) * 100}
              color={STATUS_COLORS[key]}
            />
          );
        })}
      </Card>

      {/* W3 — Thu/Chi kế hoạch vs thực tế */}
      <Card title="Thu / Chi: Kế hoạch vs Thực tế" icon="bar-chart-2" iconColor="#6c63ff">
        {/* Thu nhập */}
        <Text style={s.subHeading}>Thu nhập</Text>
        <View style={[s.compareRow, { borderColor: "#dcfce7" }]}>
          <View style={s.compareCell}>
            <Text style={s.compareLabel}>Kế hoạch</Text>
            <Text style={[s.compareValue, { color: "#16a34a" }]}>{fmtMoney(inv.expectedIncome)}</Text>
          </View>
          <View style={[s.compareDivider, { backgroundColor: "#dcfce7" }]} />
          <View style={s.compareCell}>
            <Text style={s.compareLabel}>Thực tế</Text>
            <Text style={[s.compareValue, { color: "#059669" }]}>{fmtMoney(inv.actualIncome)}</Text>
          </View>
          <View style={[s.compareDivider, { backgroundColor: "#dcfce7" }]} />
          <View style={s.compareCell}>
            <Text style={s.compareLabel}>Nợ phải thu</Text>
            <Text style={[s.compareValue, { color: "#dc2626" }]}>{fmtMoney(inv.debtIncome)}</Text>
          </View>
        </View>

        <View style={{ height: 10 }} />

        {/* Chi phí */}
        <Text style={s.subHeading}>Chi phí</Text>
        <View style={[s.compareRow, { borderColor: "#fee2e2" }]}>
          <View style={s.compareCell}>
            <Text style={s.compareLabel}>Kế hoạch</Text>
            <Text style={[s.compareValue, { color: "#ea580c" }]}>{fmtMoney(inv.expectedExpense)}</Text>
          </View>
          <View style={[s.compareDivider, { backgroundColor: "#fee2e2" }]} />
          <View style={s.compareCell}>
            <Text style={s.compareLabel}>Thực tế</Text>
            <Text style={[s.compareValue, { color: "#dc2626" }]}>{fmtMoney(inv.actualExpense)}</Text>
          </View>
          <View style={[s.compareDivider, { backgroundColor: "#fee2e2" }]} />
          <View style={s.compareCell}>
            <Text style={s.compareLabel}>Nợ phải trả</Text>
            <Text style={[s.compareValue, { color: "#9ca3af" }]}>{fmtMoney(inv.debtExpense)}</Text>
          </View>
        </View>
      </Card>

      {/* W4 — Phân bổ thu / Phân bổ chi */}
      <Card title="Phân bổ Thu nhập" icon="trending-up" iconColor="#059669">
        <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: "#059669", marginBottom: 8 }}>
          Tổng: {fmtMoneyFull(cat.income.total)}
        </Text>
        {cat.income.categories.map((c, i) => (
          <BarRow key={i} label={c.name} value={`${fmtMoney(c.amount)} (${c.pct}%)`} pct={c.pct} color="#059669" />
        ))}
      </Card>

      <Card title="Phân bổ Chi phí" icon="trending-down" iconColor="#ef4444">
        <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: "#ef4444", marginBottom: 8 }}>
          Tổng: {fmtMoneyFull(cat.expense.total)}
        </Text>
        {cat.expense.categories.map((c, i) => (
          <BarRow key={i} label={c.name} value={`${fmtMoney(c.amount)} (${c.pct}%)`} pct={c.pct} color="#ef4444" />
        ))}
      </Card>

      {/* W5 — Doanh thu thực theo cơ sở */}
      {rev.rows.length > 0 && (
        <Card title="Doanh thu theo Cơ sở" icon="map-pin" iconColor="#7c3aed">
          {rev.rows.map((r, i) => (
            <View key={i} style={{ marginBottom: 12, paddingBottom: 12, borderBottomWidth: i < rev.rows.length - 1 ? 1 : 0, borderBottomColor: "#f3f4f6" }}>
              <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#374151", marginBottom: 6 }}>{r.locationName}</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={[s.pill, { backgroundColor: "#f0fdf4", flex: 1 }]}>
                  <Text style={{ fontSize: 10, fontFamily: "Inter_400Regular", color: "#9ca3af" }}>Thu</Text>
                  <Text style={[s.pillNum, { color: "#16a34a", fontSize: 13 }]}>{fmtMoney(r.totalIncome)}</Text>
                </View>
                <View style={[s.pill, { backgroundColor: "#fef2f2", flex: 1 }]}>
                  <Text style={{ fontSize: 10, fontFamily: "Inter_400Regular", color: "#9ca3af" }}>Chi</Text>
                  <Text style={[s.pillNum, { color: "#ef4444", fontSize: 13 }]}>{fmtMoney(r.totalExpense)}</Text>
                </View>
                <View style={[s.pill, { backgroundColor: "#f5f3ff", flex: 1 }]}>
                  <Text style={{ fontSize: 10, fontFamily: "Inter_400Regular", color: "#9ca3af" }}>Lợi nhuận</Text>
                  <Text style={[s.pillNum, { color: "#7c3aed", fontSize: 13 }]}>{fmtMoney(r.profit)}</Text>
                </View>
              </View>
            </View>
          ))}
          {/* Tổng toàn trung tâm */}
          <View style={{ backgroundColor: "#f5f3ff", borderRadius: 10, padding: 10 }}>
            <Text style={{ fontSize: 12, fontFamily: "Inter_700Bold", color: "#6c63ff", marginBottom: 6 }}>Tổng toàn trung tâm</Text>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <View>
                <Text style={{ fontSize: 10, color: "#9ca3af" }}>Thu nhập</Text>
                <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold", color: "#16a34a" }}>{fmtMoney(rev.totals.totalIncome)}</Text>
              </View>
              <View>
                <Text style={{ fontSize: 10, color: "#9ca3af" }}>Chi phí</Text>
                <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold", color: "#ef4444" }}>{fmtMoney(rev.totals.totalExpense)}</Text>
              </View>
              <View>
                <Text style={{ fontSize: 10, color: "#9ca3af" }}>Lợi nhuận</Text>
                <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold", color: "#7c3aed" }}>{fmtMoney(rev.totals.profit)}</Text>
              </View>
            </View>
          </View>
        </Card>
      )}

      {/* W5b — Công nợ khách hàng */}
      <Card title="Công nợ khách hàng" icon="alert-triangle" iconColor="#dc2626">
        <View style={s.pillRow}>
          <StatPill label="Tổng nợ"  value={fmtMoney(debt.totalDebtAmount)} color="#dc2626" bg="#fef2f2" />
          <StatPill label="Số lượng" value={`${debt.totalCount} HĐ`}        color="#f59e0b" bg="#fff7ed" />
        </View>
        <Divider />
        {debt.byStatus.map((st, i) => (
          <BarRow key={i} label={st.label} value={`${st.count} HĐ · ${fmtMoney(st.amount)}`} pct={st.pct} color="#dc2626" />
        ))}
      </Card>
    </ScrollView>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

const ALL_TABS = [
  { key: "customers" as const, label: "Khách hàng", icon: "users" },
  { key: "training"  as const, label: "Đào tạo",    icon: "book-open" },
  { key: "finance"   as const, label: "Tài chính",  icon: "dollar-sign" },
];

export default function DashboardScreen() {
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const topPad  = Platform.OS === "web" ? 67 : 0;
  const perms   = usePermissions();

  // Lọc các tab theo quyền từ API permissions
  const TAB_PERMISSION: Record<"customers" | "training" | "finance", boolean> = {
    customers: perms.dashboardTabCustomers,
    training:  perms.dashboardTabTraining,
    finance:   perms.dashboardTabFinance,
  };
  const TABS = ALL_TABS.filter((t) => TAB_PERMISSION[t.key]);

  const firstTab = TABS[0]?.key ?? "training";
  const [activeTab, setActiveTab] = useState<"customers" | "training" | "finance">(firstTab);
  const [filter, setFilter] = useState<FilterKey>("month");

  // Nếu activeTab không còn trong danh sách được phép → chuyển về tab đầu tiên
  const safeTab = TABS.some((t) => t.key === activeTab) ? activeTab : firstTab;

  // Không có quyền dashboard → hiển thị màn hình thông báo
  if (!perms.dashboardCanView) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, height: insets.top, backgroundColor: "#6c63ff", zIndex: 10 }} />
        <View style={[s.header, { paddingTop: (Platform.OS === "web" ? topPad : insets.top) + 16 }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
              <Feather name="arrow-left" size={20} color="#fff" />
            </TouchableOpacity>
            <Text style={{ fontSize: 20, fontFamily: "Inter_700Bold", color: "#fff" }}>Dashboard</Text>
          </View>
        </View>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 14, padding: 32 }}>
          <Feather name="lock" size={48} color={colors.mutedForeground} />
          <Text style={{ fontSize: 16, fontFamily: "Inter_600SemiBold", color: colors.foreground, textAlign: "center" }}>
            Bạn không có quyền xem Dashboard
          </Text>
          <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center" }}>
            Liên hệ quản trị viên để được cấp quyền truy cập.
          </Text>
        </View>
      </View>
    );
  }

  // Không có tab nào được phép → cũng hiển thị thông báo
  if (TABS.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, height: insets.top, backgroundColor: "#6c63ff", zIndex: 10 }} />
        <View style={[s.header, { paddingTop: (Platform.OS === "web" ? topPad : insets.top) + 16 }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
              <Feather name="arrow-left" size={20} color="#fff" />
            </TouchableOpacity>
            <Text style={{ fontSize: 20, fontFamily: "Inter_700Bold", color: "#fff" }}>Dashboard</Text>
          </View>
        </View>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 14, padding: 32 }}>
          <Feather name="bar-chart-2" size={48} color={colors.mutedForeground} />
          <Text style={{ fontSize: 16, fontFamily: "Inter_600SemiBold", color: colors.foreground, textAlign: "center" }}>
            Chưa có dữ liệu Dashboard
          </Text>
          <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center" }}>
            Bạn chưa được cấp quyền xem tab nào.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Status bar cover */}
      <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, height: insets.top, backgroundColor: "#6c63ff", zIndex: 10 }} />

      {/* Header */}
      <View style={[s.header, { paddingTop: (Platform.OS === "web" ? topPad : insets.top) + 16 }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Feather name="arrow-left" size={20} color="#fff" />
          </TouchableOpacity>
          <View>
            <Text style={{ fontSize: 20, fontFamily: "Inter_700Bold", color: "#fff" }}>Dashboard</Text>
            <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.7)" }}>Tổng quan hệ thống</Text>
          </View>
        </View>
      </View>

      {/* Time filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ backgroundColor: "#6c63ff", flexGrow: 0 }}
        contentContainerStyle={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 14, paddingTop: 4, gap: 8 }}
      >
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            onPress={() => setFilter(f.key)}
            activeOpacity={0.75}
            style={[s.chip, filter === f.key ? s.chipActive : s.chipInactive]}
          >
            <Text style={{ fontSize: 12, fontFamily: filter === f.key ? "Inter_600SemiBold" : "Inter_400Regular", color: filter === f.key ? "#fff" : "rgba(255,255,255,0.75)" }}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Tab bar — chỉ hiển thị các tab mà user được phép */}
      <View style={[s.tabBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {TABS.map((tab) => {
          const active = safeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              style={[s.tabItem, active && { borderBottomWidth: 2.5, borderBottomColor: "#6c63ff" }]}
              activeOpacity={0.7}
            >
              <Feather name={tab.icon as any} size={14} color={active ? "#6c63ff" : colors.mutedForeground} />
              <Text style={{ fontSize: 12, fontFamily: active ? "Inter_700Bold" : "Inter_400Regular", color: active ? "#6c63ff" : colors.mutedForeground, marginLeft: 4 }}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Content */}
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {safeTab === "customers" && <CustomerTab key={`cust-${filter}`} filter={filter} />}
        {safeTab === "training"  && <TrainingTab  key={`train-${filter}`} filter={filter} />}
        {safeTab === "finance"   && <FinanceTab   key={`fin-${filter}`}   filter={filter} />}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingBottom: 12, backgroundColor: "#6c63ff" },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center" },
  chip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  chipActive:   { backgroundColor: "rgba(255,255,255,0.28)", borderColor: "rgba(255,255,255,0.6)" },
  chipInactive: { backgroundColor: "transparent",            borderColor: "rgba(255,255,255,0.3)" },
  tabBar: { flexDirection: "row", borderBottomWidth: 1 },
  tabItem: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 12, gap: 4 },
  scroll: { padding: 14, gap: 12, paddingBottom: 40 },
  card: { borderRadius: 16, borderWidth: 1, padding: 14 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  cardIcon: { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontSize: 14, fontFamily: "Inter_700Bold" },
  pillRow: { flexDirection: "row", gap: 8 },
  pill: { flex: 1, borderRadius: 12, padding: 10, alignItems: "center" },
  pillNum: { fontSize: 18, fontFamily: "Inter_700Bold", marginTop: 2 },
  pillLabel: { fontSize: 10, fontFamily: "Inter_400Regular", color: "#6b7280", marginTop: 2, textAlign: "center" },
  rowLabel: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#374151", flex: 1 },
  rowValue: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  subHeading: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#6b7280", marginBottom: 6 },
  compareRow: { flexDirection: "row", borderRadius: 10, borderWidth: 1, overflow: "hidden" },
  compareCell: { flex: 1, padding: 10, alignItems: "center" },
  compareDivider: { width: 1 },
  compareLabel: { fontSize: 10, fontFamily: "Inter_400Regular", color: "#9ca3af", marginBottom: 3 },
  compareValue: { fontSize: 14, fontFamily: "Inter_700Bold" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  retryBtn: { marginTop: 14, paddingHorizontal: 24, paddingVertical: 10, backgroundColor: "#6c63ff", borderRadius: 10 },
});
