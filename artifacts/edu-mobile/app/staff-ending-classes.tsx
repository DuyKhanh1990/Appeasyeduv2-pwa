import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useSafeAreaInsets } from "@/hooks/useSafeAreaInsets";

import { useColors } from "@/hooks/useColors";
import { apiGet } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ClassItem {
  id: string;
  classCode: string;
  className: string;
  weekdays: number[];
  teacherIds: string[];
  teacherNames: string;
  endDate: string;
  locationName: string;
  remainingSessions: number;
}
interface ApiResponse {
  data: ClassItem[];
  total: number;
  page: number;
  pageSize: number;
  availableClasses: { code: string; label: string }[];
}
interface Filters {
  classes: string[];
  maxRemaining: string;
  dateFrom: string;
  dateTo: string;
}
const EMPTY_FILTERS: Filters = { classes: [], maxRemaining: "", dateFrom: "", dateTo: "" };
const STATUS_TABS = [
  { key: "", label: "Tất cả" },
  { key: "ending-soon", label: "Sắp kết thúc" },
  { key: "active", label: "Đang học" },
  { key: "ended", label: "Đã kết thúc" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const WEEKDAY_LABELS: Record<number, string> = {
  1: "CN", 2: "T2", 3: "T3", 4: "T4", 5: "T5", 6: "T6", 7: "T7",
};
function fmtWeekdays(days: number[]): string {
  if (!days || days.length === 0) return "";
  return days.map((d) => WEEKDAY_LABELS[d] ?? `?${d}`).join(", ");
}
function fmtDate(d: string) { return d ? d.split("-").reverse().join("/") : ""; }
function countActiveFilters(f: Filters): number {
  return (f.classes.length > 0 ? 1 : 0) + (f.maxRemaining ? 1 : 0) + (f.dateFrom || f.dateTo ? 1 : 0);
}
function getRemainingColor(r: number) {
  return r <= 2 ? "#ef4444" : r <= 5 ? "#f97316" : r <= 10 ? "#eab308" : "#16a34a";
}
function getRemainingBg(r: number) {
  return r <= 2 ? "#fef2f2" : r <= 5 ? "#fff7ed" : r <= 10 ? "#fefce8" : "#f0fdf4";
}
function computeStatus(item: ClassItem): "ending-soon" | "active" | "ended" {
  const today = new Date().toISOString().slice(0, 10);
  if (!item.endDate || item.endDate < today) return "ended";
  if (item.remainingSessions < 5) return "ending-soon";
  return "active";
}

// Calendar helpers
const WEEKDAYS_CAL = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const MONTHS_VN = ["Tháng 1","Tháng 2","Tháng 3","Tháng 4","Tháng 5","Tháng 6",
  "Tháng 7","Tháng 8","Tháng 9","Tháng 10","Tháng 11","Tháng 12"];
function isoToDate(iso: string): Date | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}
function dateToIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
function fmtDisplayDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// ─── Calendar Picker ──────────────────────────────────────────────────────────
function CalendarPicker({ label, value, onChange, colors, accentColor }: {
  label: string; value: string; onChange: (v: string) => void;
  colors: ReturnType<typeof useColors>; accentColor: string;
}) {
  const [open, setOpen] = useState(false);
  const today = new Date();
  const initial = isoToDate(value) ?? today;
  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth());
  const selected = isoToDate(value);
  const hasValue = !!value;

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  };
  const handleSelect = (day: number) => {
    onChange(dateToIso(new Date(viewYear, viewMonth, day)));
    Haptics.selectionAsync();
    setOpen(false);
  };
  const handleOpen = () => {
    const base = isoToDate(value) ?? today;
    setViewYear(base.getFullYear());
    setViewMonth(base.getMonth());
    setOpen(true);
    Haptics.selectionAsync();
  };

  const firstDay = new Date(viewYear, viewMonth, 1);
  const lastDay = new Date(viewYear, viewMonth + 1, 0);
  let startOffset = firstDay.getDay() - 1;
  if (startOffset < 0) startOffset = 6;
  const totalDays = lastDay.getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= totalDays; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const isSelected = (day: number) =>
    selected && selected.getFullYear() === viewYear && selected.getMonth() === viewMonth && selected.getDate() === day;
  const isToday = (day: number) =>
    today.getFullYear() === viewYear && today.getMonth() === viewMonth && today.getDate() === day;

  return (
    <View style={{ gap: 4 }}>
      <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: colors.mutedForeground }}>{label}</Text>
      <TouchableOpacity onPress={open ? () => setOpen(false) : handleOpen}
        style={{ flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1.5,
          borderColor: hasValue ? accentColor : open ? colors.primary : colors.border,
          borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
          backgroundColor: hasValue ? accentColor + "10" : colors.background }}>
        <Feather name="calendar" size={15} color={hasValue ? accentColor : colors.mutedForeground} />
        <Text style={{ flex: 1, fontSize: 14, fontFamily: hasValue ? "Inter_600SemiBold" : "Inter_400Regular", color: hasValue ? accentColor : colors.mutedForeground }}>
          {hasValue ? fmtDisplayDate(value) : "Chọn ngày"}
        </Text>
        {hasValue ? (
          <TouchableOpacity onPress={(e) => { e.stopPropagation(); onChange(""); Haptics.selectionAsync(); }} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
            <Feather name="x" size={15} color={accentColor} />
          </TouchableOpacity>
        ) : (
          <Feather name={open ? "chevron-up" : "chevron-down"} size={15} color={colors.mutedForeground} />
        )}
      </TouchableOpacity>

      {open && (
        <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: colors.card, overflow: "hidden", marginTop: 4,
          shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <TouchableOpacity onPress={prevMonth} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" }}>
              <Feather name="chevron-left" size={16} color={colors.foreground} />
            </TouchableOpacity>
            <Text style={{ flex: 1, textAlign: "center", fontSize: 15, fontFamily: "Inter_700Bold", color: colors.foreground }}>
              {MONTHS_VN[viewMonth]} {viewYear}
            </Text>
            <TouchableOpacity onPress={nextMonth} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" }}>
              <Feather name="chevron-right" size={16} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          <View style={{ flexDirection: "row", paddingHorizontal: 8, paddingTop: 10, paddingBottom: 4 }}>
            {WEEKDAYS_CAL.map((wd) => (
              <View key={wd} style={{ flex: 1, alignItems: "center" }}>
                <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground }}>{wd}</Text>
              </View>
            ))}
          </View>

          <View style={{ paddingHorizontal: 8, paddingBottom: 12 }}>
            {Array.from({ length: cells.length / 7 }, (_, row) => (
              <View key={row} style={{ flexDirection: "row" }}>
                {cells.slice(row * 7, row * 7 + 7).map((day, col) => {
                  const sel = day !== null && isSelected(day);
                  const tod = day !== null && isToday(day);
                  return (
                    <TouchableOpacity key={col} onPress={() => day !== null && handleSelect(day)} disabled={day === null}
                      style={{ flex: 1, alignItems: "center", justifyContent: "center", height: 38, borderRadius: 10,
                        backgroundColor: sel ? accentColor : "transparent", marginVertical: 1 }}>
                      {day !== null && (
                        <Text style={{ fontSize: 14, fontFamily: sel ? "Inter_700Bold" : tod ? "Inter_600SemiBold" : "Inter_400Regular",
                          color: sel ? "#fff" : tod ? accentColor : colors.foreground }}>{day}</Text>
                      )}
                      {tod && !sel && <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: accentColor, marginTop: 2 }} />}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

// ─── Class Multi-Select Dropdown ──────────────────────────────────────────────
function ClassDropdown({ selected, options, onChange, colors }: {
  selected: string[]; options: { code: string; label: string }[];
  onChange: (v: string[]) => void; colors: ReturnType<typeof useColors>;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (code: string) => {
    Haptics.selectionAsync();
    onChange(selected.includes(code) ? selected.filter((c) => c !== code) : [...selected, code]);
  };
  const label = selected.length === 0 ? "Tất cả lớp" : selected.length === 1
    ? (options.find((o) => o.code === selected[0])?.label ?? selected[0])
    : `${selected.length} lớp đã chọn`;

  return (
    <View style={{ gap: 4 }}>
      <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.5 }}>
        Lớp học
      </Text>
      <TouchableOpacity onPress={() => setOpen(!open)}
        style={{ flexDirection: "row", alignItems: "center", borderWidth: 1,
          borderColor: selected.length > 0 ? colors.primary : colors.border,
          borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, backgroundColor: colors.background, gap: 8 }}>
        <Feather name="layers" size={14} color={selected.length > 0 ? colors.primary : colors.mutedForeground} />
        <Text style={{ flex: 1, fontSize: 14, fontFamily: selected.length > 0 ? "Inter_600SemiBold" : "Inter_400Regular",
          color: selected.length > 0 ? colors.primary : colors.mutedForeground }}>{label}</Text>
        {selected.length > 0 && (
          <TouchableOpacity onPress={(e) => { e.stopPropagation(); onChange([]); }} hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}>
            <Feather name="x" size={14} color={colors.primary} />
          </TouchableOpacity>
        )}
        <Feather name={open ? "chevron-up" : "chevron-down"} size={15} color={colors.mutedForeground} />
      </TouchableOpacity>

      {open && options.length > 0 && (
        <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.card, overflow: "hidden", marginTop: 2 }}>
          {options.map((opt, i) => {
            const checked = selected.includes(opt.code);
            return (
              <TouchableOpacity key={opt.code} onPress={() => toggle(opt.code)}
                style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, gap: 10, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colors.border }}>
                <View style={{ width: 20, height: 20, borderRadius: 5, borderWidth: 1.5,
                  borderColor: checked ? colors.primary : colors.border,
                  backgroundColor: checked ? colors.primary : "transparent", alignItems: "center", justifyContent: "center" }}>
                  {checked && <Feather name="check" size={12} color="#fff" />}
                </View>
                <Text style={{ flex: 1, fontSize: 14, fontFamily: checked ? "Inter_600SemiBold" : "Inter_400Regular", color: colors.foreground }}>
                  {opt.label || opt.code}
                </Text>
                {checked && <Feather name="check-circle" size={14} color={colors.primary} />}
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

// ─── Filter Sheet ─────────────────────────────────────────────────────────────
function FilterSheet({ visible, onClose, filters, onApply, availableClasses, colors, insets }: {
  visible: boolean; onClose: () => void; filters: Filters;
  onApply: (f: Filters) => void; availableClasses: { code: string; label: string }[];
  colors: ReturnType<typeof useColors>; insets: { bottom: number };
}) {
  const slideAnim = useRef(new Animated.Value(0)).current;
  const [draft, setDraft] = useState<Filters>(filters);
  const screenH = Dimensions.get("window").height;

  useEffect(() => {
    if (visible) {
      setDraft(filters);
      Animated.spring(slideAnim, { toValue: 1, useNativeDriver: true, tension: 65, friction: 11 }).start();
    } else {
      Animated.timing(slideAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    }
  }, [visible, filters]);

  const translateY = slideAnim.interpolate({ inputRange: [0, 1], outputRange: [screenH, 0] });
  if (!visible) return null;

  return (
    <Modal transparent animationType="none" visible={visible} onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)" }} />
      </TouchableWithoutFeedback>

      <Animated.View style={[styles.sheet, { backgroundColor: colors.card, transform: [{ translateY }], paddingBottom: insets.bottom + 8 }]}>
        <View style={{ alignItems: "center", paddingTop: 10, paddingBottom: 4 }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <Text style={{ flex: 1, fontSize: 17, fontFamily: "Inter_700Bold", color: colors.foreground }}>Bộ lọc</Text>
          <TouchableOpacity onPress={() => setDraft(EMPTY_FILTERS)} style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: colors.muted }}>
            <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: colors.mutedForeground }}>Đặt lại</Text>
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 16, paddingBottom: 12, gap: 20 }}>

          <ClassDropdown
            selected={draft.classes}
            options={availableClasses}
            onChange={(v) => setDraft((d) => ({ ...d, classes: v }))}
            colors={colors}
          />

          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.5 }}>
              Còn lại ≤ N buổi
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1,
              borderColor: draft.maxRemaining ? colors.primary : colors.border,
              borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: colors.background, gap: 8 }}>
              <Feather name="clock" size={14} color={draft.maxRemaining ? colors.primary : colors.mutedForeground} />
              <TextInput
                style={{ flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", color: colors.foreground }}
                placeholder="Ví dụ: 5"
                placeholderTextColor={colors.mutedForeground}
                value={draft.maxRemaining}
                onChangeText={(v) => setDraft((d) => ({ ...d, maxRemaining: v.replace(/[^0-9]/g, "") }))}
                keyboardType="numeric"
                returnKeyType="done"
              />
              {draft.maxRemaining ? (
                <TouchableOpacity onPress={() => setDraft((d) => ({ ...d, maxRemaining: "" }))} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                  <Feather name="x" size={14} color={colors.mutedForeground} />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          <View style={{ gap: 10 }}>
            <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.5 }}>
              Khoảng ngày kết thúc
            </Text>
            <CalendarPicker label="Từ ngày" value={draft.dateFrom} onChange={(v) => setDraft((d) => ({ ...d, dateFrom: v }))}
              colors={colors} accentColor="#9333ea" />
            <CalendarPicker label="Đến ngày" value={draft.dateTo} onChange={(v) => setDraft((d) => ({ ...d, dateTo: v }))}
              colors={colors} accentColor="#ea580c" />
          </View>
        </ScrollView>

        <View style={{ paddingHorizontal: 18, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border }}>
          <TouchableOpacity onPress={() => { onApply(draft); onClose(); }} style={{ borderRadius: 12, overflow: "hidden" }}>
            <View
              style={{ backgroundColor: colors.gradientStart, paddingVertical: 14, alignItems: "center" }}>
              <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: "#1e1b4b" }}>Áp dụng</Text>
            </View>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Modal>
  );
}

// ─── Class Card ───────────────────────────────────────────────────────────────
function ClassCard({ item, colors }: { item: ClassItem; colors: ReturnType<typeof useColors> }) {
  const status = computeStatus(item);
  const isEnded = status === "ended";
  const rc = getRemainingColor(item.remainingSessions);
  const rb = getRemainingBg(item.remainingSessions);
  const wdStr = fmtWeekdays(item.weekdays);

  const statusLabel = isEnded ? "Đã kết thúc" : status === "ending-soon" ? "Sắp kết thúc" : "Đang học";
  const statusBg = isEnded ? colors.muted : status === "ending-soon" ? "#fff7ed" : "#f0fdf4";
  const statusColor = isEnded ? colors.mutedForeground : status === "ending-soon" ? "#ea580c" : "#16a34a";

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* Header row */}
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
        <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: "#fdf4ff", alignItems: "center", justifyContent: "center" }}>
          <Feather name="flag" size={20} color="#9333ea" />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold", color: colors.foreground }} numberOfLines={1}>
            {item.className}
          </Text>
          <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: "#9333ea" }}>
            {item.classCode}
          </Text>
          {item.locationName ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Feather name="map-pin" size={11} color={colors.mutedForeground} />
              <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground }} numberOfLines={1}>
                {item.locationName}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Remaining sessions badge */}
        <View style={{ alignItems: "center", backgroundColor: rb, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, minWidth: 52 }}>
          <Text style={{ fontSize: 18, fontFamily: "Inter_700Bold", color: rc, lineHeight: 22 }}>{item.remainingSessions}</Text>
          <Text style={{ fontSize: 10, fontFamily: "Inter_500Medium", color: rc }}>buổi còn</Text>
        </View>
      </View>

      {/* Info rows */}
      <View style={[styles.infoSection, { borderTopColor: colors.border }]}>
        {wdStr ? (
          <View style={styles.infoRow}>
            <Feather name="repeat" size={12} color={colors.mutedForeground} />
            <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: colors.foreground }}>{wdStr}</Text>
          </View>
        ) : null}

        {item.teacherNames ? (
          <View style={styles.infoRow}>
            <Feather name="user" size={12} color={colors.mutedForeground} />
            <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.foreground, flex: 1 }} numberOfLines={1}>
              {item.teacherNames}
            </Text>
          </View>
        ) : null}

        {item.endDate ? (
          <View style={styles.infoRow}>
            <Feather name="calendar" size={12} color={colors.mutedForeground} />
            <Text style={{ fontSize: 12, fontFamily: "Inter_700Bold", color: colors.foreground }}>
              Kết thúc: {fmtDate(item.endDate)}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Footer: status chip */}
      <View style={[styles.cardFooter, { borderTopColor: colors.border }]}>
        <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: statusBg }}>
          <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: statusColor }}>{statusLabel}</Text>
        </View>
        {/* Weekday pills */}
        {item.weekdays && item.weekdays.length > 0 && (
          <View style={{ flexDirection: "row", gap: 4, flexWrap: "wrap" }}>
            {item.weekdays.map((d) => (
              <View key={d} style={{ backgroundColor: "#9333ea15", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                <Text style={{ fontSize: 10, fontFamily: "Inter_700Bold", color: "#9333ea" }}>{WEEKDAY_LABELS[d] ?? d}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function StaffEndingClassesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : 0;

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [data, setData] = useState<ClassItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [availableClasses, setAvailableClasses] = useState<{ code: string; label: string }[]>([]);
  const PAGE_SIZE = 20;

  const buildUrl = useCallback((p: number, s: string, sf: string, f: Filters) => {
    let url = `/api/mobile/classes-ending-soon?page=${p}&pageSize=${PAGE_SIZE}`;
    if (s.trim()) url += `&search=${encodeURIComponent(s.trim())}`;
    if (sf) url += `&statusFilter=${encodeURIComponent(sf)}`;
    for (const cls of f.classes) url += `&classes=${encodeURIComponent(cls)}`;
    if (f.maxRemaining) url += `&maxRemaining=${encodeURIComponent(f.maxRemaining)}`;
    if (f.dateFrom) url += `&dateFrom=${encodeURIComponent(f.dateFrom)}`;
    if (f.dateTo) url += `&dateTo=${encodeURIComponent(f.dateTo)}`;
    return url;
  }, []);

  const fetchData = useCallback(async (opts: {
    page: number; search: string; statusFilter: string; filters: Filters; silent?: boolean; append?: boolean;
  }) => {
    const { page: p, search: s, statusFilter: sf, filters: f, silent, append } = opts;
    if (!silent) append ? setLoadingMore(true) : setLoading(true);
    setErrorMsg(null);
    try {
      const url = buildUrl(p, s, sf, f);
      const res = await apiGet<ApiResponse>(url);
      setTotal(res.total);
      if (res.availableClasses?.length) setAvailableClasses(res.availableClasses);
      if (append) setData((prev) => [...prev, ...res.data]);
      else setData(res.data);
    } catch (err: any) {
      if (!append) {
        setData([]); setTotal(0);
        if (err?.status === 401) setErrorMsg("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
        else if (err?.status === 403) setErrorMsg("Bạn không có quyền truy cập tính năng này.");
        else setErrorMsg(`Không thể tải dữ liệu. ${err?.message || "Vui lòng thử lại."}`);
      }
    } finally {
      setLoading(false); setLoadingMore(false); setRefreshing(false);
    }
  }, [buildUrl]);

  useEffect(() => {
    setPage(1); setData([]);
    fetchData({ page: 1, search, statusFilter, filters });
  }, [search, statusFilter, filters, fetchData]);

  const onRefresh = () => {
    setRefreshing(true); setPage(1);
    fetchData({ page: 1, search, statusFilter, filters, silent: true });
  };
  const loadMore = () => {
    if (loadingMore || data.length >= total) return;
    const next = page + 1; setPage(next);
    fetchData({ page: next, search, statusFilter, filters, append: true });
  };

  const activeFilterCount = countActiveFilters(filters);

  const renderEmpty = () => errorMsg ? (
    <View style={{ alignItems: "center", paddingTop: 60, gap: 12, paddingHorizontal: 24 }}>
      <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: "#fef2f2", alignItems: "center", justifyContent: "center" }}>
        <Feather name="alert-circle" size={28} color="#ef4444" />
      </View>
      <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.foreground, textAlign: "center" }}>Không thể tải dữ liệu</Text>
      <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center" }}>{errorMsg}</Text>
      <TouchableOpacity onPress={onRefresh} style={{ marginTop: 4, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.primary }}>
        <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" }}>Thử lại</Text>
      </TouchableOpacity>
    </View>
  ) : (
    <View style={{ alignItems: "center", paddingTop: 60, gap: 12 }}>
      <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: "#fdf4ff", alignItems: "center", justifyContent: "center" }}>
        <Feather name="flag" size={28} color="#9333ea" />
      </View>
      <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>Không có lớp học</Text>
      <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center", paddingHorizontal: 24 }}>
        Không tìm thấy lớp học phù hợp với bộ lọc đã chọn.
      </Text>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={{ backgroundColor: colors.gradientStart, paddingTop: (Platform.OS === "web" ? topPad : insets.top) + 12, paddingBottom: 14, paddingHorizontal: 16 }}>

        {/* Title */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="arrow-left" size={22} color="#1e1b4b" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 20, fontFamily: "Inter_700Bold", color: "#1e1b4b" }}>Lớp học sắp kết thúc</Text>
            {total > 0 && <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(30,27,75,0.65)" }}>{total} lớp học</Text>}
          </View>
        </View>

        {/* Search + Filter */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <View style={{ flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: "rgba(30,27,75,0.08)", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, gap: 8 }}>
            <Feather name="search" size={15} color="rgba(30,27,75,0.55)" />
            <TextInput
              style={{ flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", color: "#1e1b4b" }}
              placeholder="Tìm mã hoặc tên lớp..."
              placeholderTextColor="rgba(30,27,75,0.4)"
              value={search} onChangeText={setSearch} returnKeyType="search"
            />
            {search ? (
              <TouchableOpacity onPress={() => setSearch("")} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                <Feather name="x" size={15} color="rgba(30,27,75,0.55)" />
              </TouchableOpacity>
            ) : null}
          </View>

          <TouchableOpacity
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSheetVisible(true); }}
            style={{ width: 42, height: 42, borderRadius: 10, backgroundColor: activeFilterCount > 0 ? "#fff" : "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" }}>
            <Feather name="sliders" size={18} color={activeFilterCount > 0 ? "#9333ea" : "#fff"} />
            {activeFilterCount > 0 && (
              <View style={{ position: "absolute", top: -5, right: -5, width: 17, height: 17, borderRadius: 9, backgroundColor: "#ef4444", alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontSize: 10, fontFamily: "Inter_700Bold", color: "#fff" }}>{activeFilterCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Status tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {STATUS_TABS.map((tab) => (
            <TouchableOpacity key={tab.key}
              onPress={() => { Haptics.selectionAsync(); setStatusFilter(tab.key); }}
              style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: statusFilter === tab.key ? "#fff" : "rgba(255,255,255,0.18)" }}>
              <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: statusFilter === tab.key ? "#9333ea" : "rgba(255,255,255,0.85)" }}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Active filter chips */}
        {(filters.classes.length > 0 || filters.maxRemaining || filters.dateFrom || filters.dateTo) && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingTop: 8 }}>
            {filters.classes.map((c) => (
              <TouchableOpacity key={c} onPress={() => setFilters((f) => ({ ...f, classes: f.classes.filter((x) => x !== c) }))} style={styles.chip}>
                <Text style={styles.chipText}>{c}</Text>
                <Feather name="x" size={10} color="#fff" />
              </TouchableOpacity>
            ))}
            {filters.maxRemaining && (
              <TouchableOpacity onPress={() => setFilters((f) => ({ ...f, maxRemaining: "" }))} style={styles.chip}>
                <Text style={styles.chipText}>≤ {filters.maxRemaining} buổi</Text>
                <Feather name="x" size={10} color="#fff" />
              </TouchableOpacity>
            )}
            {(filters.dateFrom || filters.dateTo) && (
              <TouchableOpacity onPress={() => setFilters((f) => ({ ...f, dateFrom: "", dateTo: "" }))} style={styles.chip}>
                <Text style={styles.chipText}>{fmtDisplayDate(filters.dateFrom) || "..."} → {fmtDisplayDate(filters.dateTo) || "..."}</Text>
                <Feather name="x" size={10} color="#fff" />
              </TouchableOpacity>
            )}
          </ScrollView>
        )}
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, paddingBottom: 100 + insets.bottom, gap: 10 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} progressBackgroundColor={colors.card} />}
          onScroll={({ nativeEvent }) => {
            const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
            if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 100) loadMore();
          }}
          scrollEventThrottle={400}>
          {data.length === 0 ? renderEmpty() : (
            <>
              {data.map((item) => (
                <ClassCard key={item.id} item={item} colors={colors} />
              ))}
              {loadingMore && <View style={{ alignItems: "center", paddingVertical: 12 }}><ActivityIndicator size="small" color={colors.primary} /></View>}
              {!loadingMore && data.length < total && (
                <TouchableOpacity onPress={loadMore} style={{ alignItems: "center", paddingVertical: 12 }}>
                  <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: colors.primary }}>Xem thêm ({total - data.length} còn lại)</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </ScrollView>
      )}

      <FilterSheet visible={sheetVisible} onClose={() => setSheetVisible(false)}
        filters={filters} onApply={(f) => setFilters(f)}
        availableClasses={availableClasses} colors={colors} insets={insets} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 8 },
  infoSection: { borderTopWidth: 1, paddingTop: 8, gap: 5 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  cardFooter: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    borderTopWidth: 1, paddingTop: 8, gap: 8, flexWrap: "wrap",
  },
  sheet: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "82%",
    shadowColor: "#000", shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 20,
  },
  chip: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(255,255,255,0.25)", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { fontSize: 12, fontFamily: "Inter_500Medium", color: "#fff" },
});
