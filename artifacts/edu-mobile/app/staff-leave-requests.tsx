import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { useSafeAreaInsets } from "@/hooks/useSafeAreaInsets";
import { apiGet, apiPost } from "@/lib/api";

type LeaveType = "nghi_phep" | "nghi_co_luong" | "tang_ca";

interface StaffLeaveRequest {
  id: string;
  staffId: string;
  locationId?: string | null;
  type: LeaveType | string;
  fromDate: string;
  toDate: string;
  hours?: string | null;
  overtimeFrom?: string | null;
  overtimeTo?: string | null;
  reason?: string | null;
  status: "pending" | "approved" | "rejected" | string;
  adminNote?: string | null;
  createdAt: string;
  updatedAt?: string;
}

const MONTH_NAMES = [
  "Tháng 1", "Tháng 2", "Tháng 3", "Tháng 4", "Tháng 5", "Tháng 6",
  "Tháng 7", "Tháng 8", "Tháng 9", "Tháng 10", "Tháng 11", "Tháng 12",
];
const WEEKDAY_NAMES = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

const TYPE_META: Record<LeaveType, { label: string; icon: React.ComponentProps<typeof Feather>["name"] }> = {
  nghi_phep: { label: "Nghỉ phép", icon: "calendar" },
  nghi_co_luong: { label: "Nghỉ phép năm", icon: "briefcase" },
  tang_ca: { label: "Tăng ca", icon: "clock" },
};

const STATUS_META: Record<string, { label: string; color: string; background: string }> = {
  pending: { label: "Chờ duyệt", color: "#b45309", background: "#fef3c7" },
  approved: { label: "Đã duyệt", color: "#15803d", background: "#dcfce7" },
  rejected: { label: "Từ chối", color: "#b91c1c", background: "#fee2e2" },
};

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return (
    !Number.isNaN(date.getTime()) &&
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

function formatDate(value?: string) {
  if (!value) return "";
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("vi-VN");
}

function dateDaysInclusive(fromDate: string, toDate: string) {
  const from = new Date(`${fromDate}T00:00:00`);
  const to = new Date(`${toDate}T00:00:00`);
  return Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
}

function isTime(value: string) {
  if (!/^\d{2}:\d{2}$/.test(value)) return false;
  const [hour, minute] = value.split(":").map(Number);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

function timeToMinutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function extractRequests(data: any): StaffLeaveRequest[] {
  return Array.isArray(data?.leaveRequests) ? data.leaveRequests : [];
}

function Header({
  title,
  subtitle,
  colors,
  topInset,
  onBack,
  action,
}: {
  title: string;
  subtitle?: string;
  colors: ReturnType<typeof useColors>;
  topInset: number;
  onBack: () => void;
  action?: React.ReactNode;
}) {
  return (
    <View style={[styles.header, { paddingTop: topInset + 10, backgroundColor: colors.gradientStart }]}>
      <TouchableOpacity onPress={onBack} style={styles.backButton} activeOpacity={0.75}>
        <Feather name="arrow-left" size={21} color="#1e1b4b" />
      </TouchableOpacity>
      <View style={styles.headerCopy}>
        <Text style={styles.headerTitle}>{title}</Text>
        {subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}
      </View>
      {action}
    </View>
  );
}

function SectionTitle({
  icon,
  title,
  colors,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  title: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.sectionTitleRow}>
      <View style={[styles.sectionIcon, { backgroundColor: colors.primary + "18" }]}>
        <Feather name={icon} size={16} color={colors.primary} />
      </View>
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{title}</Text>
    </View>
  );
}

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? {
    label: status || "Chưa xác định",
    color: "#6b7280",
    background: "#f3f4f6",
  };
  return (
    <View style={[styles.statusBadge, { backgroundColor: meta.background }]}>
      <Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text>
    </View>
  );
}

function RequestCard({
  request,
  colors,
}: {
  request: StaffLeaveRequest;
  colors: ReturnType<typeof useColors>;
}) {
  const typeMeta = TYPE_META[request.type as LeaveType];
  const isOvertime = request.type === "tang_ca";
  return (
    <View style={[styles.requestCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.requestCardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.requestDate, { color: colors.foreground }]}>
            {formatDate(request.fromDate)}
            {!isOvertime && request.toDate !== request.fromDate ? ` – ${formatDate(request.toDate)}` : ""}
          </Text>
          <View style={styles.typeRow}>
            <Feather name={typeMeta?.icon ?? "file-text"} size={14} color={colors.primary} />
            <Text style={[styles.typeText, { color: colors.primary }]}>{typeMeta?.label ?? request.type}</Text>
          </View>
        </View>
        <StatusBadge status={request.status} />
      </View>

      <View style={styles.requestMetaRow}>
        <Feather name="clock" size={14} color={colors.mutedForeground} />
        <Text style={[styles.requestMetaText, { color: colors.mutedForeground }]}>
          {request.hours ? `${request.hours} giờ` : "Chưa nhập số giờ"}
          {isOvertime && request.overtimeFrom && request.overtimeTo
            ? ` · ${request.overtimeFrom} – ${request.overtimeTo}`
            : ""}
        </Text>
      </View>

      <Text style={[styles.reasonLabel, { color: colors.mutedForeground }]}>Lý do</Text>
      <Text style={[styles.reasonText, { color: colors.foreground }]}>
        {request.reason?.trim() || "Không có lý do"}
      </Text>

      {request.status === "rejected" && request.adminNote ? (
        <View style={styles.rejectionBox}>
          <Text style={styles.rejectionLabel}>Lý do từ chối</Text>
          <Text style={styles.rejectionText}>{request.adminNote}</Text>
        </View>
      ) : null}
    </View>
  );
}

export default function StaffLeaveRequestsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [requests, setRequests] = useState<StaffLeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formVisible, setFormVisible] = useState(false);

  const [type, setType] = useState<LeaveType>("nghi_phep");
  const [fromDate, setFromDate] = useState(todayIso);
  const [toDate, setToDate] = useState(todayIso);
  const [reason, setReason] = useState("");
  const [overtimeFrom, setOvertimeFrom] = useState("17:00");
  const [overtimeTo, setOvertimeTo] = useState("19:00");
  const [creating, setCreating] = useState(false);
  const [datePickerTarget, setDatePickerTarget] = useState<"from" | "to" | null>(null);
  const now = new Date();
  const [pickerYear, setPickerYear] = useState(now.getFullYear());
  const [pickerMonth, setPickerMonth] = useState(now.getMonth());

  const dateRangeValid = isIsoDate(fromDate) && isIsoDate(toDate) && fromDate <= toDate;
  const isOvertime = type === "tang_ca";
  const overtimeValid = isTime(overtimeFrom) && isTime(overtimeTo) && timeToMinutes(overtimeTo) > timeToMinutes(overtimeFrom);
  const hours = isOvertime && overtimeValid
    ? String((timeToMinutes(overtimeTo) - timeToMinutes(overtimeFrom)) / 60)
    : dateRangeValid
      ? String(dateDaysInclusive(fromDate, toDate) * 8)
      : "0";

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const response = await apiGet<any>("/api/my-space/don-tu");
      setRequests(extractRequests(response));
    } catch (err: unknown) {
      setError(errorMessage(err, "Không thể tải đơn xin nghỉ của bạn"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  const resetForm = useCallback(() => {
    setFormVisible(false);
    setType("nghi_phep");
    setFromDate(todayIso());
    setToDate(todayIso());
    setReason("");
    setOvertimeFrom("17:00");
    setOvertimeTo("19:00");
    setDatePickerTarget(null);
  }, []);

  const selectType = (nextType: LeaveType) => {
    setType(nextType);
    if (nextType === "tang_ca") setToDate(fromDate);
  };

  const submitRequest = async () => {
    if (!dateRangeValid) {
      Alert.alert("Kiểm tra ngày", "Vui lòng chọn ngày hợp lệ và bảo đảm ngày bắt đầu không sau ngày kết thúc.");
      return;
    }
    if (isOvertime && !overtimeValid) {
      Alert.alert("Kiểm tra thời gian", "Giờ kết thúc tăng ca phải lớn hơn giờ bắt đầu.");
      return;
    }

    setCreating(true);
    try {
      const body = {
        type,
        fromDate,
        toDate: isOvertime ? fromDate : toDate,
        hours,
        overtimeFrom: isOvertime ? overtimeFrom : null,
        overtimeTo: isOvertime ? overtimeTo : null,
        reason: reason.trim() || null,
      };
      await apiPost<StaffLeaveRequest>("/api/leave-requests/self", body);
      await loadData(true);
      resetForm();
      Alert.alert("Đã gửi đơn", "Đơn của bạn đã được gửi và đang chờ duyệt.");
    } catch (err: unknown) {
      Alert.alert("Không thể gửi đơn", errorMessage(err, "Vui lòng thử lại sau."));
    } finally {
      setCreating(false);
    }
  };

  const openDatePicker = (target: "from" | "to") => {
    const value = target === "from" ? fromDate : toDate;
    if (isIsoDate(value)) {
      const [year, month] = value.split("-").map(Number);
      setPickerYear(year);
      setPickerMonth(month - 1);
    } else {
      const current = new Date();
      setPickerYear(current.getFullYear());
      setPickerMonth(current.getMonth());
    }
    setDatePickerTarget(target);
  };

  const goPickerMonth = (delta: number) => {
    setPickerMonth((currentMonth) => {
      let nextMonth = currentMonth + delta;
      if (nextMonth < 0) {
        setPickerYear((year) => year - 1);
        nextMonth = 11;
      } else if (nextMonth > 11) {
        setPickerYear((year) => year + 1);
        nextMonth = 0;
      }
      return nextMonth;
    });
  };

  const selectPickerDate = (date: string) => {
    if (datePickerTarget === "from") {
      setFromDate(date);
      if (isOvertime) setToDate(date);
    }
    if (datePickerTarget === "to") setToDate(date);
    setDatePickerTarget(null);
  };

  const pickerCells = useMemo(() => {
    const firstDay = new Date(pickerYear, pickerMonth, 1).getDay();
    const daysInMonth = new Date(pickerYear, pickerMonth + 1, 0).getDate();
    const cells: Array<string | null> = Array.from({ length: firstDay }, () => null);
    for (let day = 1; day <= daysInMonth; day += 1) {
      cells.push(`${pickerYear}-${String(pickerMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
    }
    return cells;
  }, [pickerMonth, pickerYear]);

  const isStaffUser = user?.role === "staff" || user?.role === "teacher" || user?.role === "admin";
  if (user && !isStaffUser) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <Header title="Xin nghỉ" colors={colors} topInset={insets.top} onBack={() => router.back()} />
        <View style={styles.centerState}>
          <Feather name="lock" size={38} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Tính năng dành cho nhân sự</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Header
        title="Xin nghỉ"
        subtitle="Tạo và theo dõi đơn của bạn"
        colors={colors}
        topInset={insets.top}
        onBack={() => router.back()}
        action={
          <TouchableOpacity
            onPress={() => setFormVisible((visible) => !visible)}
            style={[styles.headerAction, { backgroundColor: "rgba(30,27,75,0.1)" }]}
            activeOpacity={0.75}
          >
            <Feather name={formVisible ? "x" : "plus"} size={18} color="#1e1b4b" />
            <Text style={styles.headerActionText}>{formVisible ? "Đóng" : "Tạo đơn"}</Text>
          </TouchableOpacity>
        }
      />

      <KeyboardAwareScrollViewCompat
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadData(true);
            }}
            tintColor={colors.primary}
          />
        }
      >
        {loading ? (
          <View style={styles.centerState}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.centerText, { color: colors.mutedForeground }]}>Đang tải đơn xin nghỉ...</Text>
          </View>
        ) : error ? (
          <View style={[styles.errorCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="alert-circle" size={22} color={colors.destructive} />
            <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
            <TouchableOpacity onPress={() => loadData()} style={[styles.retryButton, { backgroundColor: colors.primary }]}>
              <Text style={styles.retryText}>Thử lại</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {formVisible ? (
              <View style={[styles.formCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <SectionTitle icon="edit-2" title="Tạo đơn xin nghỉ" colors={colors} />

                <View style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Loại đơn</Text>
                  <View style={styles.typeOptions}>
                    {(Object.keys(TYPE_META) as LeaveType[]).map((item) => {
                      const active = item === type;
                      return (
                        <TouchableOpacity
                          key={item}
                          onPress={() => selectType(item)}
                          style={[
                            styles.typeOption,
                            {
                              backgroundColor: active ? colors.primary : colors.muted,
                              borderColor: active ? colors.primary : colors.border,
                            },
                          ]}
                          activeOpacity={0.75}
                        >
                          <Feather name={TYPE_META[item].icon} size={15} color={active ? "#fff" : colors.mutedForeground} />
                          <Text style={[styles.typeOptionText, { color: active ? "#fff" : colors.foreground }]}>
                            {TYPE_META[item].label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                <View style={styles.dateRow}>
                  <View style={styles.dateField}>
                    <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{isOvertime ? "Ngày tăng ca" : "Từ ngày"}</Text>
                    <TouchableOpacity
                      onPress={() => openDatePicker("from")}
                      style={[styles.dateButton, { borderColor: colors.border, backgroundColor: colors.muted }]}
                      activeOpacity={0.75}
                    >
                      <Text style={[styles.dateButtonText, { color: colors.foreground }]}>{formatDate(fromDate)}</Text>
                      <Feather name="calendar" size={16} color={colors.primary} />
                    </TouchableOpacity>
                  </View>
                  {!isOvertime ? (
                    <View style={styles.dateField}>
                      <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Đến ngày</Text>
                      <TouchableOpacity
                        onPress={() => openDatePicker("to")}
                        style={[styles.dateButton, { borderColor: colors.border, backgroundColor: colors.muted }]}
                        activeOpacity={0.75}
                      >
                        <Text style={[styles.dateButtonText, { color: colors.foreground }]}>{formatDate(toDate)}</Text>
                        <Feather name="calendar" size={16} color={colors.primary} />
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>

                {!dateRangeValid ? (
                  <Text style={styles.inlineError}>Ngày không hợp lệ hoặc ngày bắt đầu đang sau ngày kết thúc.</Text>
                ) : null}

                {isOvertime ? (
                  <View style={styles.fieldGroup}>
                    <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Thời gian tăng ca</Text>
                    <View style={styles.timeRow}>
                      <TextInput
                        value={overtimeFrom}
                        onChangeText={setOvertimeFrom}
                        placeholder="17:00"
                        placeholderTextColor={colors.mutedForeground}
                        keyboardType="numbers-and-punctuation"
                        maxLength={5}
                        style={[styles.timeInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.muted }]}
                      />
                      <Text style={[styles.timeSeparator, { color: colors.mutedForeground }]}>đến</Text>
                      <TextInput
                        value={overtimeTo}
                        onChangeText={setOvertimeTo}
                        placeholder="19:00"
                        placeholderTextColor={colors.mutedForeground}
                        keyboardType="numbers-and-punctuation"
                        maxLength={5}
                        style={[styles.timeInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.muted }]}
                      />
                    </View>
                    {!overtimeValid ? (
                      <Text style={styles.inlineError}>Giờ kết thúc phải lớn hơn giờ bắt đầu, theo dạng HH:mm.</Text>
                    ) : null}
                  </View>
                ) : null}

                <View style={[styles.hoursHint, { backgroundColor: colors.muted }]}>
                  <Feather name="clock" size={15} color={colors.primary} />
                  <Text style={[styles.hoursText, { color: colors.mutedForeground }]}>
                    Tổng số giờ dự kiến: <Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold" }}>{hours} giờ</Text>
                  </Text>
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Lý do <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>(không bắt buộc)</Text></Text>
                  <TextInput
                    value={reason}
                    onChangeText={setReason}
                    placeholder="Ví dụ: Có việc gia đình."
                    placeholderTextColor={colors.mutedForeground}
                    multiline
                    textAlignVertical="top"
                    maxLength={5000}
                    style={[styles.reasonInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.muted }]}
                  />
                </View>

                <TouchableOpacity
                  onPress={submitRequest}
                  disabled={creating || !dateRangeValid || (isOvertime && !overtimeValid)}
                  style={[
                    styles.submitButton,
                    {
                      backgroundColor: colors.primary,
                      opacity: creating || !dateRangeValid || (isOvertime && !overtimeValid) ? 0.5 : 1,
                    },
                  ]}
                  activeOpacity={0.8}
                >
                  {creating ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="send" size={17} color="#fff" />}
                  <Text style={styles.submitText}>{creating ? "Đang gửi..." : "Gửi đơn xin nghỉ"}</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {!formVisible ? (
              <View style={styles.listSection}>
                <View style={styles.listHeader}>
                  <SectionTitle icon="file-text" title="Đơn đã gửi" colors={colors} />
                  <Text style={[styles.listCount, { color: colors.mutedForeground }]}>{requests.length} đơn</Text>
                </View>

                {requests.length === 0 ? (
                  <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <View style={[styles.emptyIcon, { backgroundColor: colors.muted }]}>
                      <Feather name="calendar" size={24} color={colors.mutedForeground} />
                    </View>
                    <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Chưa có đơn xin nghỉ</Text>
                    <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                      Nhấn “Tạo đơn” để gửi đơn nghỉ phép hoặc tăng ca.
                    </Text>
                  </View>
                ) : (
                  requests.map((request) => (
                    <RequestCard key={request.id} request={request} colors={colors} />
                  ))
                )}
              </View>
            ) : null}
          </>
        )}
      </KeyboardAwareScrollViewCompat>

      <Modal
        visible={datePickerTarget !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setDatePickerTarget(null)}
      >
        <TouchableOpacity style={styles.calendarOverlay} activeOpacity={1} onPress={() => setDatePickerTarget(null)} />
        <View style={[styles.calendarSheet, { backgroundColor: colors.card, borderColor: colors.border, paddingBottom: insets.bottom + 16 }]}>
          <View style={[styles.calendarHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.calendarTitle, { color: colors.foreground }]}>
              {datePickerTarget === "from" ? "Chọn ngày bắt đầu" : "Chọn ngày kết thúc"}
            </Text>
            <TouchableOpacity onPress={() => setDatePickerTarget(null)} hitSlop={8}>
              <Feather name="x" size={20} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
          <View style={styles.calendarMonthRow}>
            <TouchableOpacity onPress={() => goPickerMonth(-1)} hitSlop={8}>
              <Feather name="chevron-left" size={22} color={colors.foreground} />
            </TouchableOpacity>
            <Text style={[styles.calendarMonthTitle, { color: colors.foreground }]}>
              {MONTH_NAMES[pickerMonth]} {pickerYear}
            </Text>
            <TouchableOpacity onPress={() => goPickerMonth(1)} hitSlop={8}>
              <Feather name="chevron-right" size={22} color={colors.foreground} />
            </TouchableOpacity>
          </View>
          <View style={styles.calendarWeekRow}>
            {WEEKDAY_NAMES.map((day) => (
              <Text key={day} style={[styles.calendarWeekday, { color: colors.mutedForeground }]}>{day}</Text>
            ))}
          </View>
          <View style={styles.calendarGrid}>
            {pickerCells.map((date, index) => {
              const activeDate = datePickerTarget === "from" ? fromDate : toDate;
              const selected = date !== null && date === activeDate;
              return date ? (
                <TouchableOpacity key={date} onPress={() => selectPickerDate(date)} style={styles.calendarDayCell} activeOpacity={0.75}>
                  <View style={[styles.calendarDay, { backgroundColor: selected ? colors.primary : "transparent" }]}>
                    <Text style={[styles.calendarDayText, { color: selected ? "#fff" : colors.foreground }]}>
                      {Number(date.slice(-2))}
                    </Text>
                  </View>
                </TouchableOpacity>
              ) : (
                <View key={`blank-${index}`} style={styles.calendarDayCell} />
              );
            })}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 14, gap: 10 },
  backButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(30,27,75,0.1)", alignItems: "center", justifyContent: "center" },
  headerCopy: { flex: 1 },
  headerTitle: { color: "#1e1b4b", fontSize: 21, fontFamily: "Inter_700Bold" },
  headerSubtitle: { color: "rgba(30,27,75,0.62)", fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  headerAction: { flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 13, paddingVertical: 10, borderRadius: 22 },
  headerActionText: { color: "#1e1b4b", fontSize: 13, fontFamily: "Inter_700Bold" },
  scroll: { flex: 1 },
  content: { padding: 16, gap: 14 },
  formCard: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 14 },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  sectionIcon: { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  fieldGroup: { gap: 7 },
  fieldLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  typeOptions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  typeOption: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 9 },
  typeOptionText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  dateRow: { flexDirection: "row", gap: 10 },
  dateField: { flex: 1, gap: 7 },
  dateButton: { minHeight: 45, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderRadius: 10, paddingHorizontal: 11 },
  dateButtonText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  timeRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  timeInput: { flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 10, fontSize: 15, fontFamily: "Inter_500Medium", textAlign: "center" },
  timeSeparator: { fontSize: 13, fontFamily: "Inter_500Medium" },
  hoursHint: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 10, padding: 11 },
  hoursText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  reasonInput: { minHeight: 92, borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14, fontFamily: "Inter_400Regular" },
  submitButton: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12 },
  submitText: { color: "#fff", fontSize: 14, fontFamily: "Inter_700Bold" },
  inlineError: { color: "#dc2626", fontSize: 12, fontFamily: "Inter_400Regular" },
  listSection: { gap: 10 },
  listHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  listCount: { fontSize: 12, fontFamily: "Inter_500Medium" },
  requestCard: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 9 },
  requestCardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  requestDate: { fontSize: 16, fontFamily: "Inter_700Bold" },
  typeRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 5 },
  typeText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  statusBadge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  statusText: { fontSize: 11, fontFamily: "Inter_700Bold" },
  requestMetaRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  requestMetaText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  reasonLabel: { fontSize: 10, fontFamily: "Inter_700Bold", textTransform: "uppercase", marginTop: 2 },
  reasonText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  rejectionBox: { backgroundColor: "#fff1f2", borderRadius: 10, padding: 10, gap: 3 },
  rejectionLabel: { color: "#b91c1c", fontSize: 10, fontFamily: "Inter_700Bold" },
  rejectionText: { color: "#991b1b", fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  emptyCard: { borderWidth: 1, borderRadius: 16, padding: 22, alignItems: "center", gap: 8 },
  emptyIcon: { width: 52, height: 52, borderRadius: 18, alignItems: "center", justifyContent: "center", marginBottom: 2 },
  emptyTitle: { fontSize: 16, fontFamily: "Inter_700Bold", textAlign: "center" },
  emptyText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 19 },
  centerState: { flex: 1, minHeight: 260, alignItems: "center", justifyContent: "center", gap: 10, padding: 28 },
  centerText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  errorCard: { borderWidth: 1, borderRadius: 16, padding: 18, alignItems: "center", gap: 10 },
  errorText: { fontSize: 14, fontFamily: "Inter_500Medium", textAlign: "center" },
  retryButton: { borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10 },
  retryText: { color: "#fff", fontSize: 13, fontFamily: "Inter_700Bold" },
  calendarOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  calendarSheet: { position: "absolute", bottom: 0, left: 0, right: 0, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, paddingTop: 4 },
  calendarHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1 },
  calendarTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  calendarMonthRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 24, paddingVertical: 14 },
  calendarMonthTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  calendarWeekRow: { flexDirection: "row", paddingHorizontal: 12, marginBottom: 4 },
  calendarWeekday: { width: "14.28%", textAlign: "center", fontSize: 11, fontFamily: "Inter_600SemiBold" },
  calendarGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 12 },
  calendarDayCell: { width: "14.28%", aspectRatio: 1, alignItems: "center", justifyContent: "center", marginBottom: 2 },
  calendarDay: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  calendarDayText: { fontSize: 14, fontFamily: "Inter_500Medium" },
});