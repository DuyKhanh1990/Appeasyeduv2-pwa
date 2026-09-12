import { Feather } from "@expo/vector-icons";
import { useFocusEffect, router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
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
import { apiGet } from "@/lib/api";

// ─── Types ───────────────────────────────────────────────────────────────────

interface SalaryTable {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  locationName: string;
}

interface StaffInvoice {
  id: string;
  invoiceId: string;
  title: string;
  code: string;
  settleCode: string | null;
  label: string | null;
  type: string;
  category: string;
  amount: string;
  paidAmount: string;
  remainingAmount: string;
  status: "unpaid" | "partial" | "paid" | "debt" | "cancelled";
  dueDate: string | null;
  paidAt: string | null;
  paymentMethod: string | null;
  note: string | null;
  description: string | null;
  createdAt: string;
  isSchedule: boolean;
  salaryTable: SalaryTable | null;
}

interface StaffInvoiceResponse {
  invoices: StaffInvoice[];
  summary: {
    totalPaid: number;
    totalUnpaid: number;
    totalAmount: number;
  };
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  staff: {
    id: string;
    fullName: string;
    code: string;
  };
}

interface InvoiceStudent {
  id: string;
  name: string;
  code: string;
}

interface StudentInvoice {
  id: string;
  invoiceId: string;
  title: string;
  code: string;
  label: string | null;
  type: string;
  category: string;
  amount: string;
  paidAmount: string | null;
  remainingAmount: string | null;
  status: "unpaid" | "partial" | "paid" | "debt" | "cancelled";
  dueDate: string | null;
  paidAt: string | null;
  createdAt: string;
  isSchedule: boolean;
  student: InvoiceStudent | null;
  isParent: boolean;
  description: string | null;
}

interface StudentInvoiceResponse {
  isParent: boolean;
  summary: {
    totalPaid: number;
    totalUnpaid: number;
    totalAmount: number;
  };
  invoices: StudentInvoice[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  paid:      { label: "Đã thanh toán", bg: "#dcfce7", text: "#166534" },
  unpaid:    { label: "Chưa thanh toán", bg: "#fee2e2", text: "#991b1b" },
  partial:   { label: "Thanh toán một phần", bg: "#fff7ed", text: "#c2410c" },
  debt:      { label: "Nợ", bg: "#fef2f2", text: "#dc2626" },
  cancelled: { label: "Đã huỷ", bg: "#f3f4f6", text: "#6b7280" },
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  transfer: "Chuyển khoản",
  cash: "Tiền mặt",
  card: "Thẻ",
};

const STATUS_TABS = [
  { key: "all", label: "Tất cả" },
  { key: "unpaid", label: "Chưa thanh toán" },
  { key: "paid", label: "Đã thanh toán" },
];

const MONTH_NAMES = ["Tháng 1","Tháng 2","Tháng 3","Tháng 4","Tháng 5","Tháng 6","Tháng 7","Tháng 8","Tháng 9","Tháng 10","Tháng 11","Tháng 12"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(amount: string | number): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "0 đ";
  return num.toLocaleString("vi-VN") + " đ";
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("vi-VN", { day: "numeric", month: "numeric", year: "numeric" });
}

function isUnpaidLike(status: string) {
  return status === "unpaid" || status === "partial" || status === "debt";
}

function getInvoiceMonth(inv: StudentInvoice): string {
  const dateStr = inv.dueDate || inv.createdAt;
  return dateStr ? dateStr.slice(0, 7) : "";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CollapsibleDescription({ text, colors }: { text: string; colors: ReturnType<typeof useColors> }) {
  const [expanded, setExpanded] = useState(false);
  const [measured, setMeasured] = useState(false);
  const [lineCount, setLineCount] = useState(0);
  const isTruncated = lineCount > 3;

  return (
    <View style={{ gap: 2 }}>
      <View style={[styles.dateItem, { alignSelf: "stretch" }]}>
        <Text
          style={[styles.dateText, { color: colors.mutedForeground, flex: 1 }]}
          numberOfLines={measured && isTruncated && !expanded ? 3 : undefined}
          onTextLayout={(e) => {
            if (!measured) {
              setLineCount(e.nativeEvent.lines.length);
              setMeasured(true);
            }
          }}
        >
          {text}
        </Text>
      </View>
      {measured && isTruncated && (
        <TouchableOpacity
          onPress={() => setExpanded((v) => !v)}
          style={{ paddingLeft: 15 }}
          hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
        >
          <Text style={{ color: colors.primary, fontSize: 11, fontFamily: "Inter_500Medium" }}>
            {expanded ? "Thu gọn ▲" : "Xem thêm ▼"}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || { label: status, bg: "#f3f4f6", text: "#6b7280" };
  return (
    <View style={{ backgroundColor: cfg.bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, alignSelf: "flex-start" }}>
      <Text style={{ color: cfg.text, fontSize: 11, fontFamily: "Inter_600SemiBold" }}>{cfg.label}</Text>
    </View>
  );
}

// ─── Staff Invoice Card ───────────────────────────────────────────────────────

function StaffInvoiceCard({ inv, colors }: { inv: StaffInvoice; colors: ReturnType<typeof useColors> }) {
  return (
    <View
      style={[styles.card, {
        backgroundColor: colors.card,
        borderColor: isUnpaidLike(inv.status) ? colors.destructive + "40" : colors.border,
        borderRadius: colors.radius,
      }]}
    >
      {inv.salaryTable && (
        <View style={[styles.studentRow, { backgroundColor: colors.primary + "10" }]}>
          <Feather name="briefcase" size={11} color={colors.primary} />
          <Text style={[styles.studentName, { color: colors.primary }]} numberOfLines={1}>
            {inv.salaryTable.name}
            {inv.salaryTable.locationName ? ` · ${inv.salaryTable.locationName}` : ""}
            {inv.salaryTable.startDate && inv.salaryTable.endDate
              ? `  ${formatDate(inv.salaryTable.startDate)} – ${formatDate(inv.salaryTable.endDate)}`
              : ""}
          </Text>
        </View>
      )}

      <View style={styles.cardBody}>
        <View style={{ flex: 1, gap: 4 }}>
          <View style={styles.cardTitleRow}>
            <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={1}>
              {inv.title}
            </Text>
            {inv.label && (
              <View style={[styles.labelPill, { backgroundColor: colors.primary + "15" }]}>
                <Text style={[styles.labelPillText, { color: colors.primary }]}>{inv.label}</Text>
              </View>
            )}
          </View>

          <Text style={[styles.cardCode, { color: colors.mutedForeground }]}>
            {[inv.code, inv.settleCode, inv.type, inv.category].filter(Boolean).join(" · ")}
          </Text>

          <View style={styles.amountRow}>
            <Text style={[styles.amountMain, { color: colors.foreground }]}>
              {formatCurrency(inv.amount)}
            </Text>
            {parseFloat(inv.paidAmount) > 0 && parseFloat(inv.paidAmount) < parseFloat(inv.amount) && (
              <Text style={[styles.amountPaid, { color: colors.success }]}>
                Đã trả {formatCurrency(inv.paidAmount)}
              </Text>
            )}
          </View>

          {parseFloat(inv.remainingAmount) > 0 && (
            <Text style={[styles.amountRemaining, { color: colors.destructive }]}>
              Còn lại: {formatCurrency(inv.remainingAmount)}
            </Text>
          )}

          <View style={styles.datesRow}>
            {inv.dueDate && (
              <View style={styles.dateItem}>
                <Feather name="clock" size={11} color={colors.mutedForeground} />
                <Text style={[styles.dateText, { color: colors.mutedForeground }]}>
                  Hạn: {formatDate(inv.dueDate)}
                </Text>
              </View>
            )}
            {inv.paidAt && (
              <View style={styles.dateItem}>
                <Feather name="check-circle" size={11} color={colors.success} />
                <Text style={[styles.dateText, { color: colors.mutedForeground }]}>
                  {formatDate(inv.paidAt)}
                </Text>
              </View>
            )}
            {inv.paymentMethod && (
              <View style={styles.dateItem}>
                <Feather name="credit-card" size={11} color={colors.mutedForeground} />
                <Text style={[styles.dateText, { color: colors.mutedForeground }]}>
                  {PAYMENT_METHOD_LABELS[inv.paymentMethod] ?? inv.paymentMethod}
                </Text>
              </View>
            )}
          </View>

          {inv.note ? (
            <View style={styles.dateItem}>
              <Feather name="message-square" size={11} color={colors.mutedForeground} />
              <Text style={[styles.dateText, { color: colors.mutedForeground, flexShrink: 1 }]}>
                {inv.note}
              </Text>
            </View>
          ) : null}
        </View>

        <StatusBadge status={inv.status} />
      </View>

      {inv.description ? (
        <View style={styles.descriptionSection}>
          <CollapsibleDescription text={inv.description} colors={colors} />
        </View>
      ) : null}
    </View>
  );
}

// ─── Student Invoice Card ─────────────────────────────────────────────────────

function StudentInvoiceCard({
  inv,
  isParent,
  colors,
  highlighted,
  onLayout,
}: {
  inv: StudentInvoice;
  isParent: boolean;
  colors: ReturnType<typeof useColors>;
  highlighted?: boolean;
  onLayout?: (y: number) => void;
}) {
  return (
    <View
      onLayout={highlighted && onLayout ? (e) => onLayout(e.nativeEvent.layout.y) : undefined}
      style={[styles.card, {
        backgroundColor: highlighted ? colors.primary + "12" : colors.card,
        borderColor: highlighted
          ? colors.primary
          : isUnpaidLike(inv.status)
            ? colors.destructive + "40"
            : colors.border,
        borderWidth: highlighted ? 2 : 1,
        borderRadius: colors.radius,
      }]}
    >
      {inv.student && isParent && (
        <View style={[styles.studentRow, { backgroundColor: colors.primary + "10" }]}>
          <Feather name="user" size={11} color={colors.primary} />
          <Text style={[styles.studentName, { color: colors.primary }]}>
            {inv.student.name} · {inv.student.code}
          </Text>
        </View>
      )}

      <View style={styles.cardBody}>
        <View style={{ flex: 1, gap: 4 }}>
          <View style={styles.cardTitleRow}>
            <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={1}>
              {inv.title}
            </Text>
            {inv.label && (
              <View style={[styles.labelPill, { backgroundColor: colors.primary + "15" }]}>
                <Text style={[styles.labelPillText, { color: colors.primary }]}>{inv.label}</Text>
              </View>
            )}
          </View>

          <Text style={[styles.cardCode, { color: colors.mutedForeground }]}>
            {inv.code} · {inv.category}
          </Text>

          <View style={styles.amountRow}>
            <Text style={[styles.amountMain, { color: colors.foreground }]}>
              {formatCurrency(inv.amount)}
            </Text>
            {parseFloat(inv.paidAmount ?? "0") > 0 && parseFloat(inv.paidAmount ?? "0") < parseFloat(inv.amount) && (
              <Text style={[styles.amountPaid, { color: colors.success }]}>
                Đã trả {formatCurrency(inv.paidAmount ?? "0")}
              </Text>
            )}
          </View>

          {parseFloat(inv.remainingAmount ?? "0") > 0 && (
            <Text style={[styles.amountRemaining, { color: colors.destructive }]}>
              Còn lại: {formatCurrency(inv.remainingAmount ?? "0")}
            </Text>
          )}

          <View style={styles.datesRow}>
            {inv.dueDate && (
              <View style={styles.dateItem}>
                <Feather name="clock" size={11} color={colors.mutedForeground} />
                <Text style={[styles.dateText, { color: colors.mutedForeground }]}>
                  Hạn: {formatDate(inv.dueDate)}
                </Text>
              </View>
            )}
            {inv.paidAt && (
              <View style={styles.dateItem}>
                <Feather name="check-circle" size={11} color={colors.success} />
                <Text style={[styles.dateText, { color: colors.mutedForeground }]}>
                  {formatDate(inv.paidAt)}
                </Text>
              </View>
            )}
          </View>

        </View>

        <StatusBadge status={inv.status} />
      </View>

      {inv.description ? (
        <View style={styles.descriptionSection}>
          <CollapsibleDescription text={inv.description} colors={colors} />
        </View>
      ) : null}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function InvoicesScreen() {
  const colors = useColors();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const { invoiceId: highlightInvoiceId } = useLocalSearchParams<{ invoiceId?: string }>();
  const isStaff = user?.role === "staff" || user?.role === "teacher" || user?.role === "admin";

  const scrollRef = useRef<ScrollView>(null);
  const isAutoScrollingRef = useRef(false);
  const [activeHighlightId, setActiveHighlightId] = useState<string | null>(highlightInvoiceId ?? null);

  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const [staffData, setStaffData] = useState<StaffInvoiceResponse | null>(null);
  const [studentData, setStudentData] = useState<StudentInvoiceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeStatus, setActiveStatus] = useState<string>("all");
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);

  const monthKey = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}`;

  const handleHighlightLayout = useCallback((y: number) => {
    isAutoScrollingRef.current = true;
    setTimeout(() => {
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 80), animated: true });
      setTimeout(() => { isAutoScrollingRef.current = false; }, 800);
    }, 300);
  }, []);

  const fetchInvoices = useCallback(async (silent = false, newPage = 1) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      if (isStaff) {
        const params = new URLSearchParams({ page: String(newPage), limit: "20" });
        if (activeStatus !== "all") params.set("status", activeStatus);
        const res = await apiGet<StaffInvoiceResponse>(`/api/mobile/staff/invoices?${params}`);
        if (newPage === 1) {
          setStaffData(res);
        } else {
          setStaffData((prev) =>
            prev ? { ...res, invoices: [...prev.invoices, ...res.invoices] } : res
          );
        }
        setPage(newPage);
      } else {
        const res = await apiGet<StudentInvoiceResponse>("/api/mobile/student/invoices");
        setStudentData(res);
      }
    } catch (e: any) {
      setError(e?.message || "Không thể tải hoá đơn");
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [isStaff, activeStatus]);

  useEffect(() => {
    if (highlightInvoiceId) setActiveHighlightId(highlightInvoiceId);
  }, [highlightInvoiceId]);

  useFocusEffect(useCallback(() => {
    setPage(1);
    fetchInvoices(false, 1);
    return () => { setActiveHighlightId(null); };
  }, [fetchInvoices]));

  const onRefresh = () => {
    setRefreshing(true);
    setPage(1);
    fetchInvoices(true, 1);
  };

  const loadMore = () => {
    if (!staffData) return;
    const { page: p, totalPages } = staffData.pagination;
    if (p >= totalPages || loadingMore) return;
    setLoadingMore(true);
    fetchInvoices(true, p + 1);
  };

  const goMonth = (delta: number) => {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    setViewMonth(m);
    setViewYear(y);
    setSelectedStudentId(null);
  };

  const allStudentInvoices = studentData?.invoices ?? [];

  // Deduplicate students from invoice list (for parent)
  const allStudents = Array.from(
    new Map(
      allStudentInvoices
        .filter(inv => inv.student)
        .map(inv => [inv.student!.id, inv.student!])
    ).entries()
  ).map(([, student]) => student);

  // Filter student invoices by month (client-side via dueDate or createdAt)
  const byMonth = allStudentInvoices.filter(inv => getInvoiceMonth(inv) === monthKey);

  // Then filter by selected student
  const byStudent = selectedStudentId
    ? byMonth.filter(inv => inv.student?.id === selectedStudentId)
    : byMonth;

  // Then filter by status
  const filteredStudent =
    activeStatus === "all"     ? byStudent :
    activeStatus === "unpaid"  ? byStudent.filter(i => isUnpaidLike(i.status)) :
                                  byStudent.filter(i => i.status === "paid");

  // Compute summary from month+student filtered data (before status filter)
  const studentMonthSummary = byStudent.length > 0 ? {
    totalPaid: byStudent.reduce((s, i) => s + (parseFloat(i.paidAmount ?? "0") || 0), 0),
    totalUnpaid: byStudent.reduce((s, i) => s + (isUnpaidLike(i.status) ? (parseFloat(i.remainingAmount ?? i.amount) || 0) : 0), 0),
    totalAmount: byStudent.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0),
  } : null;

  // Staff filter
  const staffInvoices = staffData?.invoices ?? [];
  const filteredStaff =
    activeStatus === "all"    ? staffInvoices :
    activeStatus === "unpaid" ? staffInvoices.filter(i => isUnpaidLike(i.status)) :
                                 staffInvoices.filter(i => i.status === "paid");

  const staffTabCount = (key: string) => {
    if (key === "all") return staffInvoices.length;
    if (key === "unpaid") return staffInvoices.filter(i => isUnpaidLike(i.status)).length;
    return staffInvoices.filter(i => i.status === "paid").length;
  };

  const studentTabCount = (key: string) => {
    if (key === "all") return byStudent.length;
    if (key === "unpaid") return byStudent.filter(i => isUnpaidLike(i.status)).length;
    return byStudent.filter(i => i.status === "paid").length;
  };

  const summary = isStaff ? staffData?.summary : studentMonthSummary;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={[styles.header, { paddingTop: topPad + 4, backgroundColor: colors.gradientStart }]}
      >
        {/* Top row: back + title or month nav */}
        {isStaff ? (
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} style={styles.backBtn}>
              <Feather name="arrow-left" size={20} color="#1e1b4b" />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>Hoá đơn</Text>
              {staffData?.staff && (
                <Text style={styles.headerSub}>
                  {staffData.staff.fullName} · {staffData.staff.code}
                </Text>
              )}
            </View>
          </View>
        ) : (
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} style={styles.backBtn}>
              <Feather name="arrow-left" size={20} color="#1e1b4b" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => goMonth(-1)} style={styles.navBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="chevron-left" size={20} color="#fff" />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { flex: 1, textAlign: "center" }]}>
              {MONTH_NAMES[viewMonth]}, {viewYear}
            </Text>
            <TouchableOpacity onPress={() => goMonth(1)} style={styles.navBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="chevron-right" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        )}

        {/* Status filter tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {STATUS_TABS.map((tab) => {
            const isActive = activeStatus === tab.key;
            const count = isStaff ? staffTabCount(tab.key) : studentTabCount(tab.key);
            return (
              <TouchableOpacity
                key={tab.key}
                onPress={() => setActiveStatus(tab.key)}
                activeOpacity={0.75}
                style={[
                  styles.filterPill,
                  {
                    backgroundColor: isActive ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.18)",
                    borderColor: isActive ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.3)",
                  },
                ]}
              >
                <Text style={[styles.filterPillText, { color: isActive ? colors.primary : colors.foreground }]}>
                  {tab.label}
                </Text>
                <View style={[styles.filterBadge, { backgroundColor: isActive ? colors.primary : "rgba(255,255,255,0.35)" }]}>
                  <Text style={styles.filterBadgeText}>{count}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Student filter by student name (parent only) */}
      {!isStaff && !loading && allStudents.length > 1 && (
        <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.card }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 10 }}
          >
            <TouchableOpacity
              onPress={() => setSelectedStudentId(null)}
              style={{
                paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1,
                backgroundColor: selectedStudentId === null ? colors.primary : colors.card,
                borderColor: selectedStudentId === null ? colors.primary : colors.border,
              }}
            >
              <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: selectedStudentId === null ? "#fff" : colors.mutedForeground }}>
                Tất cả
              </Text>
            </TouchableOpacity>
            {allStudents.map(student => (
              <TouchableOpacity
                key={student.id}
                onPress={() => setSelectedStudentId(student.id === selectedStudentId ? null : student.id)}
                style={{
                  paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1,
                  backgroundColor: selectedStudentId === student.id ? colors.primary : colors.card,
                  borderColor: selectedStudentId === student.id ? colors.primary : colors.border,
                }}
              >
                <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: selectedStudentId === student.id ? "#fff" : colors.mutedForeground }}>
                  {student.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.centerText, { color: colors.mutedForeground }]}>Đang tải hoá đơn...</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Feather name="alert-circle" size={36} color={colors.destructive} />
          <Text style={[styles.centerText, { color: colors.destructive }]}>{error}</Text>
          <TouchableOpacity
            onPress={() => fetchInvoices()}
            style={[styles.retryBtn, { backgroundColor: colors.primary }]}
          >
            <Text style={styles.retryText}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 80 + bottomPad }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} progressBackgroundColor={colors.card} />}
          onScroll={({ nativeEvent }) => {
            if (activeHighlightId && !isAutoScrollingRef.current) setActiveHighlightId(null);
            if (!isStaff) return;
            const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
            if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 80) loadMore();
          }}
          scrollEventThrottle={400}
        >
          {/* ── Phiếu thu / Phiếu chi summary cards — always visible, totals across ALL months ── */}
          {(() => {
            // Student: sum across all invoices (not month-filtered) so the cards stay stable
            const allPaid   = allStudentInvoices.reduce((s, i) => s + (parseFloat(i.paidAmount   ?? "0") || 0), 0);
            const allUnpaid = allStudentInvoices.reduce((s, i) => s + (isUnpaidLike(i.status) ? (parseFloat(i.remainingAmount ?? i.amount) || 0) : 0), 0);
            const phuThuPaid   = isStaff ? 0 : allPaid;
            const phuThuUnpaid = isStaff ? 0 : allUnpaid;
            const phuChiPaid   = isStaff ? (staffData?.summary?.totalPaid   ?? 0) : 0;
            const phuChiUnpaid = isStaff ? (staffData?.summary?.totalUnpaid ?? 0) : 0;
            return (
              <View style={styles.summaryCardsRow}>
                {/* Phiếu thu */}
                <View style={[styles.summaryPaper, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
                  <View style={styles.summaryPaperHeader}>
                    <View style={[styles.summaryPaperIconWrap, { backgroundColor: "#eff6ff" }]}>
                      <Feather name="dollar-sign" size={14} color="#2563eb" />
                    </View>
                    <Text style={[styles.summaryPaperTitle, { color: colors.foreground }]}>Phiếu thu</Text>
                  </View>
                  <View style={styles.summaryPaperRow}>
                    <View style={[styles.summaryPaperDot, { backgroundColor: "#dcfce7" }]}>
                      <Feather name="check-circle" size={13} color="#16a34a" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.summaryPaperRowLabel, { color: colors.mutedForeground }]}>Đã thanh toán</Text>
                      <Text style={[styles.summaryPaperRowAmount, { color: "#16a34a" }]}>{formatCurrency(phuThuPaid)}</Text>
                    </View>
                  </View>
                  <View style={styles.summaryPaperRow}>
                    <View style={[styles.summaryPaperDot, { backgroundColor: "#fff7ed" }]}>
                      <Feather name="clock" size={13} color="#ea580c" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.summaryPaperRowLabel, { color: colors.mutedForeground }]}>Chưa thanh toán</Text>
                      <Text style={[styles.summaryPaperRowAmount, { color: "#ea580c" }]}>{formatCurrency(phuThuUnpaid)}</Text>
                    </View>
                  </View>
                </View>

                {/* Phiếu chi */}
                <View style={[styles.summaryPaper, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
                  <View style={styles.summaryPaperHeader}>
                    <View style={[styles.summaryPaperIconWrap, { backgroundColor: "#fdf4ff" }]}>
                      <Feather name="trending-down" size={14} color="#9333ea" />
                    </View>
                    <Text style={[styles.summaryPaperTitle, { color: colors.foreground }]}>Phiếu chi</Text>
                  </View>
                  <View style={styles.summaryPaperRow}>
                    <View style={[styles.summaryPaperDot, { backgroundColor: "#eff6ff" }]}>
                      <Feather name="check-circle" size={13} color="#2563eb" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.summaryPaperRowLabel, { color: colors.mutedForeground }]}>Đã nhận</Text>
                      <Text style={[styles.summaryPaperRowAmount, { color: "#2563eb" }]}>{formatCurrency(phuChiPaid)}</Text>
                    </View>
                  </View>
                  <View style={styles.summaryPaperRow}>
                    <View style={[styles.summaryPaperDot, { backgroundColor: "#fee2e2" }]}>
                      <Feather name="alert-circle" size={13} color="#dc2626" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.summaryPaperRowLabel, { color: colors.mutedForeground }]}>Chưa nhận</Text>
                      <Text style={[styles.summaryPaperRowAmount, { color: "#dc2626" }]}>{formatCurrency(phuChiUnpaid)}</Text>
                    </View>
                  </View>
                </View>
              </View>
            );
          })()}

          {isStaff ? (
            filteredStaff.length === 0 ? (
              <View style={[styles.emptyBox, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
                <Feather name="file-text" size={36} color={colors.mutedForeground} />
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Không có hoá đơn</Text>
                <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
                  {activeStatus === "all" ? "Chưa có hoá đơn nào" : `Không có hoá đơn "${STATUS_TABS.find(t => t.key === activeStatus)?.label}"`}
                </Text>
              </View>
            ) : (
              <>
                {filteredStaff.map(inv => (
                  <StaffInvoiceCard key={inv.id} inv={inv} colors={colors} />
                ))}
                {staffData && staffData.pagination.page < staffData.pagination.totalPages && (
                  <View style={styles.center}>
                    {loadingMore
                      ? <ActivityIndicator size="small" color={colors.primary} />
                      : <TouchableOpacity onPress={loadMore} style={[styles.retryBtn, { backgroundColor: colors.primary }]}>
                          <Text style={styles.retryText}>Tải thêm</Text>
                        </TouchableOpacity>
                    }
                  </View>
                )}
                {staffData && (
                  <Text style={[styles.paginationInfo, { color: colors.mutedForeground }]}>
                    Hiển thị {staffInvoices.length}/{staffData.pagination.total} hoá đơn
                  </Text>
                )}
              </>
            )
          ) : (
            filteredStudent.length === 0 ? (
              <View style={[styles.emptyBox, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
                <Feather name="file-text" size={36} color={colors.mutedForeground} />
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Không có hoá đơn</Text>
                <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
                  {allStudentInvoices.length === 0
                    ? "Chưa có hoá đơn nào"
                    : byMonth.length === 0
                      ? `Không có hoá đơn trong ${MONTH_NAMES[viewMonth]}`
                      : `Không có hoá đơn "${STATUS_TABS.find(t => t.key === activeStatus)?.label}"`}
                </Text>
              </View>
            ) : (
              <>
                {filteredStudent.map(inv => {
                  const isHighlighted = !!activeHighlightId && (
                    inv.id === activeHighlightId || inv.invoiceId === activeHighlightId
                  );
                  return (
                    <StudentInvoiceCard
                      key={inv.id}
                      inv={inv}
                      isParent={studentData?.isParent ?? false}
                      colors={colors}
                      highlighted={isHighlighted}
                      onLayout={isHighlighted ? handleHighlightLayout : undefined}
                    />
                  );
                })}
                <Text style={[styles.paginationInfo, { color: colors.mutedForeground }]}>
                  Hiển thị {filteredStudent.length} hoá đơn
                </Text>
              </>
            )
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
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  navBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    color: "#1e1b4b",
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  headerSub: {
    color: "rgba(30,27,75,0.6)",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  // ── Phiếu thu / Phiếu chi summary cards ──
  summaryCardsRow: {
    flexDirection: "row",
    gap: 10,
  },
  summaryPaper: {
    flex: 1,
    borderWidth: 1,
    padding: 12,
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  summaryPaperHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 2,
  },
  summaryPaperIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryPaperTitle: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  summaryPaperRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  summaryPaperDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  summaryPaperRowLabel: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    lineHeight: 14,
  },
  summaryPaperRowAmount: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    lineHeight: 18,
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
    color: "#fff",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 32,
  },
  centerText: {
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
  emptySub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    opacity: 0.7,
  },
  card: {
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 2,
  },
  studentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  studentName: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
  },
  cardBody: {
    padding: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  cardTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    flexShrink: 1,
  },
  labelPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  labelPillText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  cardCode: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  amountRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
    flexWrap: "wrap",
    marginTop: 2,
  },
  amountMain: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  amountPaid: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  amountRemaining: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  datesRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 4,
    flexWrap: "wrap",
  },
  descriptionSection: {
    paddingHorizontal: 14,
    paddingBottom: 12,
    paddingTop: 0,
  },
  dateItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  dateText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  paginationInfo: {
    textAlign: "center",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 8,
  },
});
