import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
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
import { type SalarySummary } from "@/lib/salaryStore";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(d: string) {
  if (!d) return "";
  return d.split("-").reverse().join("/");
}

function fmtCurrency(n: number | null | undefined) {
  if (n === null || n === undefined || isNaN(Number(n))) return "—";
  return Number(n).toLocaleString("vi-VN") + "đ";
}

// ─── Salary Table Card (list item) ────────────────────────────────────────────
function SalaryCard({
  table,
  onPress,
  colors,
}: {
  table: SalarySummary;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  const grandTotal = Number(table.grandTotal);
  const totalEligible = table.classes.reduce((sum, c) => sum + Number(c.totalEligibleSessions), 0);
  const withPackage = table.classes.filter((c) => c.packageId).length;
  const withoutPackage = table.classes.filter((c) => !c.packageId).length;

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={onPress}
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        {/* Left: name + meta */}
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: "#1e40af" }} numberOfLines={1}>
            {table.salaryTableName}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Feather name="calendar" size={12} color="#6b7280" />
            <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: "#6b7280" }}>
              {fmtDate(table.startDate)} – {fmtDate(table.endDate)}
            </Text>
          </View>
          {!!table.locationName && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Feather name="map-pin" size={12} color="#6b7280" />
              <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: "#6b7280" }}>
                {table.locationName}
              </Text>
            </View>
          )}
        </View>

        {/* Right: total + eligible badge */}
        <View style={{ alignItems: "flex-end", gap: 6 }}>
          <Text style={{ fontSize: 20, fontFamily: "Inter_700Bold", color: "#16a34a" }}>
            {fmtCurrency(grandTotal)}
          </Text>
          <View style={{ backgroundColor: "#dcfce7", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#15803d" }}>
              {totalEligible} buổi hợp lệ
            </Text>
          </View>
        </View>
      </View>

      {/* Divider */}
      <View style={{ height: 1, backgroundColor: colors.border, marginTop: 12, marginBottom: 10 }} />

      {/* Bottom pills */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
          <Feather name="layers" size={12} color="#2563eb" />
          <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: "#2563eb" }}>
            {table.classes.length} lớp
          </Text>
        </View>
        {withPackage > 0 && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <Feather name="check-square" size={12} color="#16a34a" />
            <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: "#16a34a" }}>
              {withPackage} có gói lương
            </Text>
          </View>
        )}
        {withoutPackage > 0 && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <Feather name="alert-circle" size={12} color="#7c3aed" />
            <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: "#7c3aed" }}>
              {withoutPackage} chưa gắn
            </Text>
          </View>
        )}
        <View style={{ flex: 1, alignItems: "flex-end" }}>
          <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function StaffClassSalaryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : 0;

  const [tables, setTables] = useState<SalarySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isEmpty, setIsEmpty] = useState(false);

  const fetchAll = async (silent = false) => {
    if (!silent) setLoading(true);
    setErrorMsg(null);
    setIsEmpty(false);
    try {
      const summaryData = await apiGet<SalarySummary[]>("/api/mobile/staff/payroll/salary-summary");
      if (!summaryData || summaryData.length === 0) {
        setTables([]);
        setIsEmpty(true);
        return;
      }
      setTables(summaryData);
    } catch (err: any) {
      if (err?.status === 401) setErrorMsg("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
      else if (err?.status === 403) setErrorMsg("Bạn không có quyền truy cập tính năng này.");
      else setErrorMsg("Không thể tải dữ liệu. Vui lòng thử lại.");
      setTables([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const onRefresh = () => { setRefreshing(true); fetchAll(true); };

  const overallTotal = tables.reduce((sum, t) => sum + Number(t.grandTotal), 0);

  const handleCardPress = (table: SalarySummary) => {
    router.push({ pathname: "/staff-class-salary-detail" as any, params: { id: table.salaryTableId } });
  };

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
            <Text style={{ fontSize: 20, fontFamily: "Inter_700Bold", color: "#1e1b4b" }}>Lương đứng lớp</Text>
            <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(30,27,75,0.65)", marginTop: 1 }}>
              Bảng lương đã công bố
            </Text>
          </View>
          {overallTotal > 0 && (
            <View style={{ backgroundColor: "rgba(30,27,75,0.1)", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6, alignItems: "flex-end" }}>
              <Text style={{ fontSize: 10, fontFamily: "Inter_500Medium", color: "rgba(30,27,75,0.65)" }}>Tổng nhận</Text>
              <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: "#1e1b4b" }}>
                {overallTotal.toLocaleString("vi-VN")}đ
              </Text>
            </View>
          )}
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ marginTop: 12, fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
            Đang tải dữ liệu lương...
          </Text>
        </View>
      ) : errorMsg ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, gap: 12 }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: "#fef2f2", alignItems: "center", justifyContent: "center" }}>
            <Feather name="alert-circle" size={28} color="#ef4444" />
          </View>
          <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.foreground, textAlign: "center" }}>
            Không thể tải dữ liệu
          </Text>
          <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center" }}>
            {errorMsg}
          </Text>
          <TouchableOpacity onPress={() => fetchAll()} style={{ marginTop: 4, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10, backgroundColor: colors.primary }}>
            <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" }}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      ) : isEmpty ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, gap: 12 }}>
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: "#eff6ff", alignItems: "center", justifyContent: "center" }}>
            <Feather name="file-text" size={32} color="#2563eb" />
          </View>
          <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: colors.foreground, textAlign: "center" }}>
            Bảng lương chưa được công bố
          </Text>
          <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center", lineHeight: 20 }}>
            Bộ phận kế toán chưa công bố bảng lương cho kỳ này. Vui lòng kiểm tra lại sau.
          </Text>
          <TouchableOpacity onPress={onRefresh} style={{ marginTop: 4, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: colors.primary }}>
            <Feather name="refresh-cw" size={14} color={colors.primary} />
            <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.primary }}>Kiểm tra lại</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 14, paddingBottom: 100, gap: 14 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} progressBackgroundColor={colors.card} />}
        >
          {tables.length > 1 && (
            <View style={{ backgroundColor: "#f0fdf4", borderRadius: 12, borderWidth: 1, borderColor: "#bbf7d0", padding: 14, flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 2 }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "#dcfce7", alignItems: "center", justifyContent: "center" }}>
                <Feather name="trending-up" size={18} color="#16a34a" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: "#15803d" }}>
                  Tổng tất cả ({tables.length} bảng lương)
                </Text>
                <Text style={{ fontSize: 20, fontFamily: "Inter_700Bold", color: "#16a34a" }}>
                  {overallTotal.toLocaleString("vi-VN")}đ
                </Text>
              </View>
            </View>
          )}

          {tables.map((table) => (
            <SalaryCard
              key={table.salaryTableId}
              table={table}
              onPress={() => handleCardPress(table)}
              colors={colors}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
  },
});
