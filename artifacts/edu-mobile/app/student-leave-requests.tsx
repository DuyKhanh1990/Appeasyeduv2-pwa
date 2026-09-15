import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
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

interface LeaveLocation {
  id: string;
  name: string;
}

interface ContextStudent {
  id: string;
  code: string;
  fullName: string;
  locations: LeaveLocation[];
}

interface LeaveContextResponse {
  viewerType: "student" | "parent";
  students: ContextStudent[];
}

interface Schedule {
  id: string;
  classSessionId: string;
  studentId: string;
  className: string;
  classCode?: string;
  date: string;
  time: string;
  shiftName?: string;
  teachers?: string;
  locationId: string;
  locationName: string;
}

interface LeaveRequest {
  id: string;
  studentId: string;
  studentName?: string;
  studentCode?: string;
  locationId?: string;
  locationName?: string;
  scheduleIds: string[];
  scheduleSnapshot?: Array<{
    className?: string;
    classCode?: string;
    date?: string;
    time?: string;
    locationName?: string;
  }>;
  startDate: string;
  endDate: string;
  description: string;
  status: "pending" | "approved" | "rejected" | string;
  rejectionReason?: string | null;
  createdAt: string;
  updatedAt?: string;
}

const STATUS_META: Record<string, { label: string; color: string; background: string }> = {
  pending: { label: "Chờ duyệt", color: "#b45309", background: "#fef3c7" },
  approved: { label: "Đã duyệt", color: "#15803d", background: "#dcfce7" },
  rejected: { label: "Từ chối", color: "#b91c1c", background: "#fee2e2" },
};

const MONTH_NAMES = [
  "Tháng 1", "Tháng 2", "Tháng 3", "Tháng 4", "Tháng 5", "Tháng 6",
  "Tháng 7", "Tháng 8", "Tháng 9", "Tháng 10", "Tháng 11", "Tháng 12",
];
const WEEKDAY_NAMES = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

function todayIso() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  // Compare local date parts so the user's timezone does not turn midnight
  // into the previous UTC date.
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
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("vi-VN");
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function extractRequests(data: any): LeaveRequest[] {
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
  isParent,
}: {
  request: LeaveRequest;
  colors: ReturnType<typeof useColors>;
  isParent: boolean;
}) {
  const snapshot = Array.isArray(request.scheduleSnapshot) ? request.scheduleSnapshot : [];
  return (
    <View style={[styles.requestCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.requestCardHeader}>
        <View style={{ flex: 1 }}>
          {isParent && request.studentName ? (
            <Text style={[styles.requestStudent, { color: colors.foreground }]} numberOfLines={1}>
              {request.studentName}
              {request.studentCode ? ` · ${request.studentCode}` : ""}
            </Text>
          ) : null}
          <Text style={[styles.requestDate, { color: colors.foreground }]}>
            {formatDate(request.startDate)}
            {request.endDate !== request.startDate ? ` – ${formatDate(request.endDate)}` : ""}
          </Text>
        </View>
        <StatusBadge status={request.status} />
      </View>

      <View style={styles.requestMetaRow}>
        <Feather name="map-pin" size={14} color={colors.mutedForeground} />
        <Text style={[styles.requestMetaText, { color: colors.mutedForeground }]} numberOfLines={1}>
          {request.locationName || "Cơ sở được phân công"}
        </Text>
      </View>

      {snapshot.length > 0 ? (
        <View style={[styles.snapshotBox, { backgroundColor: colors.muted }]}>
          {snapshot.slice(0, 3).map((item, index) => (
            <View key={`${item.className}-${item.date}-${index}`} style={styles.snapshotRow}>
              <Feather name="book-open" size={13} color={colors.primary} />
              <Text style={[styles.snapshotText, { color: colors.foreground }]} numberOfLines={1}>
                {item.className || "Buổi học"}
                {item.date ? ` · ${formatDate(item.date)}` : ""}
                {item.time ? ` · ${item.time}` : ""}
              </Text>
            </View>
          ))}
          {snapshot.length > 3 ? (
            <Text style={[styles.moreText, { color: colors.mutedForeground }]}>
              +{snapshot.length - 3} buổi học khác
            </Text>
          ) : null}
        </View>
      ) : (
        <View style={[styles.snapshotBox, { backgroundColor: colors.muted }]}>
          <Text style={[styles.snapshotText, { color: colors.mutedForeground }]}>
            Đơn không gắn với buổi học cụ thể
          </Text>
        </View>
      )}

      <Text style={[styles.reasonLabel, { color: colors.mutedForeground }]}>Lý do</Text>
      <Text style={[styles.reasonText, { color: colors.foreground }]}>{request.description}</Text>

      {request.status === "rejected" && request.rejectionReason ? (
        <View style={[styles.rejectionBox, { backgroundColor: "#fff1f2" }]}>
          <Text style={styles.rejectionLabel}>Lý do từ chối</Text>
          <Text style={styles.rejectionText}>{request.rejectionReason}</Text>
        </View>
      ) : null}
    </View>
  );
}

export default function StudentLeaveRequestsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [context, setContext] = useState<LeaveContextResponse | null>(null);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formVisible, setFormVisible] = useState(false);

  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(todayIso);
  const [endDate, setEndDate] = useState(todayIso);
  const [description, setDescription] = useState("");
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [selectedScheduleIds, setSelectedScheduleIds] = useState<Set<string>>(new Set());
  const [loadingSchedules, setLoadingSchedules] = useState(false);
  const [creating, setCreating] = useState(false);
  const [datePickerTarget, setDatePickerTarget] = useState<"from" | "to" | null>(null);
  const now = new Date();
  const [pickerYear, setPickerYear] = useState(now.getFullYear());
  const [pickerMonth, setPickerMonth] = useState(now.getMonth());

  const isParent = context?.viewerType === "parent" || user?.role === "parent";
  const students = context?.students ?? [];
  const selectedStudent = students.find((student) => student.id === selectedStudentId) ?? null;
  const dateRangeValid = isIsoDate(startDate) && isIsoDate(endDate) && startDate <= endDate;

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const [contextResponse, requestResponse] = await Promise.all([
        apiGet<LeaveContextResponse>("/api/student-leave-requests/self/context"),
        apiGet<any>("/api/my-space/don-tu"),
      ]);
      setContext(contextResponse);
      setRequests(extractRequests(requestResponse));
      setSelectedStudentId((current) =>
        current && contextResponse.students.some((student) => student.id === current)
          ? current
          : contextResponse.students[0]?.id ?? null,
      );
    } catch (err: unknown) {
      setError(errorMessage(err, "Không thể tải thông tin đơn xin nghỉ"));
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

  useEffect(() => {
    if (!formVisible || !selectedStudentId || !dateRangeValid) {
      setSchedules([]);
      setSelectedScheduleIds(new Set());
      return;
    }

    let cancelled = false;
    setLoadingSchedules(true);
    setSelectedScheduleIds(new Set());
    const params = new URLSearchParams({
      studentId: selectedStudentId,
      startDate,
      endDate,
    });

    apiGet<Schedule[]>(`/api/student-leave-requests/self/schedules?${params.toString()}`)
      .then((data) => {
        if (!cancelled) setSchedules(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setSchedules([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingSchedules(false);
      });

    return () => {
      cancelled = true;
    };
  }, [dateRangeValid, endDate, formVisible, selectedStudentId, startDate]);

  const locationNames = useMemo(() => {
    const names = selectedStudent?.locations.map((location) => location.name).filter(Boolean) ?? [];
    return names.join(" · ");
  }, [selectedStudent]);

  const resetForm = useCallback(() => {
    setFormVisible(false);
    setStartDate(todayIso());
    setEndDate(todayIso());
    setDescription("");
    setSchedules([]);
    setSelectedScheduleIds(new Set());
  }, []);

  const submitRequest = async () => {
    if (!selectedStudentId) {
      Alert.alert("Chưa có học viên", "Tài khoản hiện chưa có học viên được phép tạo đơn.");
      return;
    }
    if (!dateRangeValid) {
      Alert.alert("Kiểm tra ngày", "Vui lòng nhập ngày theo dạng YYYY-MM-DD và bảo đảm ngày bắt đầu không sau ngày kết thúc.");
      return;
    }
    if (!description.trim()) {
      Alert.alert("Thiếu lý do", "Vui lòng nhập lý do xin nghỉ.");
      return;
    }

    setCreating(true);
    try {
      const body: Record<string, unknown> = {
        scheduleIds: Array.from(selectedScheduleIds),
        startDate,
        endDate,
        description: description.trim(),
      };
      if (isParent) body.studentId = selectedStudentId;

      const response = await apiPost<LeaveRequest[]>("/api/student-leave-requests/self", body);
      const createdCount = Array.isArray(response.data) ? response.data.length : 1;
      await loadData(true);
      resetForm();
      Alert.alert("Đã gửi đơn", `Đơn xin nghỉ${createdCount > 1 ? ` (${createdCount} đơn)` : ""} đã được gửi và đang chờ duyệt.`);
    } catch (err: unknown) {
      Alert.alert("Không thể gửi đơn", errorMessage(err, "Vui lòng thử lại sau."));
    } finally {
      setCreating(false);
    }
  };

  const toggleSchedule = (scheduleId: string) => {
    setSelectedScheduleIds((current) => {
      const next = new Set(current);
      if (next.has(scheduleId)) next.delete(scheduleId);
      else next.add(scheduleId);
      return next;
    });
  };

  const openDatePicker = (target: "from" | "to") => {
    const value = target === "from" ? startDate : endDate;
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
    if (datePickerTarget === "from") setStartDate(date);
    if (datePickerTarget === "to") setEndDate(date);
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

  if (user && user.role !== "student" && user.role !== "parent") {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <Header title="Xin nghỉ" colors={colors} topInset={insets.top} onBack={() => router.back()} />
        <View style={styles.centerState}>
          <Feather name="lock" size={38} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Tính năng dành cho học viên/phụ huynh</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Header
        title="Xin nghỉ"
        subtitle={isParent ? "Tạo đơn cho học viên liên kết" : "Gửi đơn xin nghỉ học"}
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
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(true); }} tintColor={colors.primary} />
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

                {isParent && students.length > 1 ? (
                  <View style={styles.fieldGroup}>
                    <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Học viên</Text>
                    <View style={styles.studentOptions}>
                      {students.map((student) => {
                        const active = student.id === selectedStudentId;
                        return (
                          <TouchableOpacity
                            key={student.id}
                            onPress={() => setSelectedStudentId(student.id)}
                            style={[
                              styles.studentOption,
                              {
                                backgroundColor: active ? colors.primary : colors.muted,
                                borderColor: active ? colors.primary : colors.border,
                              },
                            ]}
                            activeOpacity={0.75}
                          >
                            <Feather name={active ? "check-circle" : "user"} size={16} color={active ? "#fff" : colors.mutedForeground} />
                            <Text style={[styles.studentOptionText, { color: active ? "#fff" : colors.foreground }]} numberOfLines={1}>
                              {student.fullName}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                ) : (
                  <View style={[styles.selectedStudentBox, { backgroundColor: colors.muted }]}>
                    <Feather name="user" size={17} color={colors.primary} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.selectedStudentName, { color: colors.foreground }]}>
                        {selectedStudent?.fullName || "Chưa có học viên"}
                      </Text>
                      {selectedStudent?.code ? (
                        <Text style={[styles.selectedStudentCode, { color: colors.mutedForeground }]}>
                          Mã học viên: {selectedStudent.code}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                )}

                {isParent && students.length > 1 && !selectedStudentId ? (
                  <Text style={styles.inlineError}>Vui lòng chọn học viên.</Text>
                ) : null}

                {locationNames ? (
                  <View style={styles.locationHint}>
                    <Feather name="map-pin" size={14} color={colors.primary} />
                    <Text style={[styles.locationHintText, { color: colors.mutedForeground }]}>
                      Cơ sở được phép: {locationNames}
                    </Text>
                  </View>
                ) : null}

                <View style={styles.dateRow}>
                  <View style={styles.dateField}>
                    <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Từ ngày</Text>
                    <TouchableOpacity
                      onPress={() => openDatePicker("from")}
                      style={[styles.dateButton, { borderColor: colors.border, backgroundColor: colors.muted }]}
                      activeOpacity={0.75}
                    >
                      <Text style={[styles.dateButtonText, { color: colors.foreground }]}>{formatDate(startDate)}</Text>
                      <Feather name="calendar" size={16} color={colors.primary} />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.dateField}>
                    <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Đến ngày</Text>
                    <TouchableOpacity
                      onPress={() => openDatePicker("to")}
                      style={[styles.dateButton, { borderColor: colors.border, backgroundColor: colors.muted }]}
                      activeOpacity={0.75}
                    >
                      <Text style={[styles.dateButtonText, { color: colors.foreground }]}>{formatDate(endDate)}</Text>
                      <Feather name="calendar" size={16} color={colors.primary} />
                    </TouchableOpacity>
                  </View>
                </View>

                {!dateRangeValid && (startDate.length > 0 || endDate.length > 0) ? (
                  <Text style={styles.inlineError}>Ngày không hợp lệ hoặc ngày bắt đầu đang sau ngày kết thúc.</Text>
                ) : null}

                <View style={styles.fieldGroup}>
                  <View style={styles.scheduleHeader}>
                    <Text style={[styles.fieldLabel, { color: colors.foreground, marginBottom: 0 }]}>Buổi học muốn nghỉ</Text>
                    {selectedScheduleIds.size > 0 ? (
                      <Text style={[styles.selectedCount, { color: colors.primary }]}>{selectedScheduleIds.size} đã chọn</Text>
                    ) : null}
                  </View>
                  {loadingSchedules ? (
                    <View style={styles.scheduleLoading}>
                      <ActivityIndicator size="small" color={colors.primary} />
                      <Text style={[styles.mutedText, { color: colors.mutedForeground }]}>Đang tải lịch học...</Text>
                    </View>
                  ) : schedules.length > 0 ? (
                    <View style={styles.scheduleList}>
                      {schedules.map((schedule) => {
                        const selected = selectedScheduleIds.has(schedule.id);
                        return (
                          <TouchableOpacity
                            key={schedule.id}
                            onPress={() => toggleSchedule(schedule.id)}
                            style={[
                              styles.scheduleRow,
                              {
                                backgroundColor: selected ? colors.primary + "12" : colors.muted,
                                borderColor: selected ? colors.primary : colors.border,
                              },
                            ]}
                            activeOpacity={0.75}
                          >
                            <View style={[styles.checkbox, { borderColor: selected ? colors.primary : colors.mutedForeground, backgroundColor: selected ? colors.primary : "transparent" }]}>
                              {selected ? <Feather name="check" size={13} color="#fff" /> : null}
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.scheduleClass, { color: colors.foreground }]} numberOfLines={1}>
                                {schedule.className}
                              </Text>
                              <Text style={[styles.scheduleDetail, { color: colors.mutedForeground }]} numberOfLines={2}>
                                {formatDate(schedule.date)} · {schedule.time}
                                {schedule.locationName ? ` · ${schedule.locationName}` : ""}
                              </Text>
                              {schedule.teachers ? (
                                <Text style={[styles.scheduleTeacher, { color: colors.mutedForeground }]} numberOfLines={1}>
                                  GV: {schedule.teachers}
                                </Text>
                              ) : null}
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ) : (
                    <View style={[styles.noScheduleBox, { backgroundColor: colors.muted }]}>
                      <Feather name="calendar" size={18} color={colors.mutedForeground} />
                      <Text style={[styles.mutedText, { color: colors.mutedForeground }]}>
                        Không có buổi học trong khoảng ngày này. Bạn vẫn có thể gửi đơn.
                      </Text>
                    </View>
                  )}
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Lý do xin nghỉ</Text>
                  <TextInput
                    value={description}
                    onChangeText={setDescription}
                    placeholder="Ví dụ: Em bị ốm ạ."
                    placeholderTextColor={colors.mutedForeground}
                    multiline
                    textAlignVertical="top"
                    maxLength={500}
                    style={[styles.reasonInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.muted }]}
                  />
                </View>

                <TouchableOpacity
                  onPress={submitRequest}
                  disabled={creating || !selectedStudentId}
                  style={[styles.submitButton, { backgroundColor: colors.primary, opacity: creating || !selectedStudentId ? 0.5 : 1 }]}
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
                      Nhấn “Tạo đơn” để gửi thông tin xin nghỉ học.
                    </Text>
                  </View>
                ) : (
                  requests.map((request) => (
                    <RequestCard key={request.id} request={request} colors={colors} isParent={!!isParent} />
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
        <TouchableOpacity
          style={styles.calendarOverlay}
          activeOpacity={1}
          onPress={() => setDatePickerTarget(null)}
        />
        <View style={[styles.calendarSheet, { backgroundColor: colors.card, borderColor: colors.border, paddingBottom: insets.bottom + 16 }]}>
          <View style={[styles.calendarHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.calendarTitle, { color: colors.foreground }]}>
              {datePickerTarget === "from" ? "Chọn từ ngày" : "Chọn đến ngày"}
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
              const activeDate = datePickerTarget === "from" ? startDate : endDate;
              const selected = date !== null && date === activeDate;
              return date ? (
                <TouchableOpacity
                  key={date}
                  onPress={() => selectPickerDate(date)}
                  style={styles.calendarDayCell}
                  activeOpacity={0.75}
                >
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 14,
    gap: 10,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(30,27,75,0.1)",
  },
  headerCopy: { flex: 1 },
  headerTitle: { color: "#1e1b4b", fontSize: 20, fontFamily: "Inter_700Bold" },
  headerSubtitle: { color: "rgba(30,27,75,0.65)", fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  headerAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 18,
  },
  headerActionText: { color: "#1e1b4b", fontSize: 12, fontFamily: "Inter_600SemiBold" },
  scroll: { flex: 1 },
  content: { padding: 16, gap: 18 },
  centerState: { flex: 1, minHeight: 260, alignItems: "center", justifyContent: "center", gap: 10, padding: 28 },
  centerText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  errorCard: { borderWidth: 1, borderRadius: 16, padding: 18, alignItems: "center", gap: 10 },
  errorText: { fontSize: 14, fontFamily: "Inter_500Medium", textAlign: "center" },
  retryButton: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  retryText: { color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  formCard: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 14 },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionIcon: { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  fieldGroup: { gap: 7 },
  fieldLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  selectedStudentBox: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 12 },
  selectedStudentName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  selectedStudentCode: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  studentOptions: { gap: 8 },
  studentOption: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  studentOptionText: { flex: 1, fontSize: 13, fontFamily: "Inter_600SemiBold" },
  locationHint: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  locationHintText: { flex: 1, fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 16 },
  dateRow: { flexDirection: "row", gap: 10 },
  dateField: { flex: 1, gap: 7 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 10, fontSize: 16, fontFamily: "Inter_400Regular" },
  dateButton: { minHeight: 45, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderRadius: 10, paddingHorizontal: 11 },
  dateButtonText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  inlineError: { color: "#dc2626", fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 16 },
  scheduleHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  selectedCount: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  scheduleLoading: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 15 },
  scheduleList: { gap: 8 },
  scheduleRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderWidth: 1, borderRadius: 12, padding: 11 },
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, alignItems: "center", justifyContent: "center", marginTop: 1 },
  scheduleClass: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  scheduleDetail: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 3, lineHeight: 16 },
  scheduleTeacher: { fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 1 },
  noScheduleBox: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 10 },
  mutedText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  reasonInput: { minHeight: 92, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, fontFamily: "Inter_400Regular" },
  submitButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, paddingVertical: 13 },
  submitText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  listSection: { gap: 12 },
  listHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  listCount: { fontSize: 12, fontFamily: "Inter_500Medium" },
  emptyCard: { borderWidth: 1, borderRadius: 16, alignItems: "center", padding: 24, gap: 7 },
  emptyIcon: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center", marginBottom: 3 },
  emptyTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  emptyText: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 18 },
  requestCard: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 9 },
  requestCardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  requestStudent: { fontSize: 13, fontFamily: "Inter_600SemiBold", marginBottom: 4 },
  requestDate: { fontSize: 15, fontFamily: "Inter_700Bold" },
  statusBadge: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 10 },
  statusText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  requestMetaRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  requestMetaText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular" },
  snapshotBox: { borderRadius: 10, padding: 9, gap: 6 },
  snapshotRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  snapshotText: { flex: 1, fontSize: 11, fontFamily: "Inter_400Regular" },
  moreText: { fontSize: 10, fontFamily: "Inter_400Regular", marginLeft: 19 },
  reasonLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.4 },
  reasonText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  rejectionBox: { borderRadius: 10, padding: 10, gap: 3 },
  rejectionLabel: { color: "#b91c1c", fontSize: 10, fontFamily: "Inter_700Bold" },
  rejectionText: { color: "#991b1b", fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
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