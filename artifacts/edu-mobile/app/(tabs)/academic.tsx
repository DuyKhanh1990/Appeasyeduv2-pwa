import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "@/hooks/useSafeAreaInsets";

import { useColors } from "@/hooks/useColors";
import { usePermissions } from "@/hooks/usePermissions";
import { apiGet } from "@/lib/api";

interface FeatureCard {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  iconBg: string;
  iconColor: string;
  accentColor: string;
  disabled?: boolean;
  badge?: number;
}

interface LearningOverviewSummary {
  studentsEndingSoon: number;
  classesEndingSoon: number;
}

const HOC_VU_CARDS: FeatureCard[] = [
  {
    id: "homework-exam",
    title: "Bài tập - Bài kiểm tra",
    subtitle: "Quản lý bài tập và lịch kiểm tra của học viên",
    icon: "edit-3",
    iconBg: "#eff6ff",
    iconColor: "#2563eb",
    accentColor: "#2563eb",
  },
  {
    id: "grades",
    title: "Bảng điểm",
    subtitle: "Theo dõi điểm số và kết quả học tập",
    icon: "bar-chart-2",
    iconBg: "#f0fdf4",
    iconColor: "#16a34a",
    accentColor: "#16a34a",
  },
  {
    id: "expiring-students",
    title: "Học viên sắp hết lịch",
    subtitle: "Học viên sắp hết buổi cần gia hạn",
    icon: "clock",
    iconBg: "#fff7ed",
    iconColor: "#ea580c",
    accentColor: "#ea580c",
  },
  {
    id: "ending-classes",
    title: "Lớp học sắp kết thúc",
    subtitle: "Các lớp học sắp hoàn thành chương trình",
    icon: "flag",
    iconBg: "#fdf4ff",
    iconColor: "#9333ea",
    accentColor: "#9333ea",
  },
];

const HANH_CHINH_CARDS: FeatureCard[] = [
  {
    id: "salary-summary",
    title: "Bảng tổng lương",
    subtitle: "Tổng hợp lương nhân sự theo tháng",
    icon: "dollar-sign",
    iconBg: "#f0fdf4",
    iconColor: "#16a34a",
    accentColor: "#16a34a",
  },
  {
    id: "class-salary",
    title: "Lương đứng lớp",
    subtitle: "Chi tiết lương theo từng buổi dạy",
    icon: "briefcase",
    iconBg: "#eff6ff",
    iconColor: "#2563eb",
    accentColor: "#2563eb",
  },
  {
    id: "leave-request",
    title: "Xin nghỉ",
    subtitle: "Quản lý đơn xin nghỉ phép",
    icon: "calendar",
    iconBg: "#fff7ed",
    iconColor: "#ea580c",
    accentColor: "#ea580c",
    disabled: true,
  },
  {
    id: "invoices",
    title: "Hoá đơn",
    subtitle: "Danh sách hoá đơn học phí",
    icon: "file-text",
    iconBg: "#fef9c3",
    iconColor: "#d97706",
    accentColor: "#d97706",
  },
];

function SectionTitle({ title, color, colors }: { title: string; color?: string; colors: ReturnType<typeof useColors> }) {
  const textColor = color ?? colors.mutedForeground;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 14, gap: 10 }}>
      <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
      <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: textColor, letterSpacing: 0.5 }}>
        {title}
      </Text>
      <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
    </View>
  );
}

function CardGrid({ cards, colors, onPress }: {
  cards: FeatureCard[];
  colors: ReturnType<typeof useColors>;
  onPress: (id: string) => void;
}) {
  return (
    <View style={styles.grid}>
      {cards.map((card) => (
        <TouchableOpacity
          key={card.id}
          activeOpacity={card.disabled ? 1 : 0.75}
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
            card.disabled && { opacity: 0.45 },
          ]}
          onPress={() => !card.disabled && onPress(card.id)}
        >
          <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
            <View style={[styles.iconWrap, { backgroundColor: card.iconBg }]}>
              <Feather name={card.icon as any} size={24} color={card.iconColor} />
            </View>
            {card.badge !== undefined && card.badge > 0 && (
              <View style={[styles.badge, { backgroundColor: card.accentColor }]}>
                <Text style={styles.badgeText}>{card.badge > 99 ? "99+" : card.badge}</Text>
              </View>
            )}
          </View>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>{card.title}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function AcademicScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : 0;
  const perms = usePermissions();

  const [summary, setSummary] = useState<LearningOverviewSummary | null>(null);

  useEffect(() => {
    apiGet<LearningOverviewSummary>("/api/mobile/learning-overview/summary")
      .then(setSummary)
      .catch(() => {});
  }, []);

  const hocVuCards = HOC_VU_CARDS.map((card) => {
    if (card.id === "homework-exam") {
      return { ...card, disabled: !perms.mySpaceAssignments };
    }
    if (card.id === "grades") {
      return { ...card, disabled: !perms.mySpaceScoreSheet };
    }
    if (card.id === "expiring-students") {
      return {
        ...card,
        badge: summary ? summary.studentsEndingSoon : undefined,
        disabled: !perms.canViewLearningOverview,
      };
    }
    if (card.id === "ending-classes") {
      return {
        ...card,
        badge: summary ? summary.classesEndingSoon : undefined,
        disabled: !perms.canViewLearningOverview,
      };
    }
    return card;
  });

  const hanhChinhCards = HANH_CHINH_CARDS.map((card) => {
    if (card.id === "salary-summary") return { ...card, disabled: !perms.mySpacePayroll };
    if (card.id === "class-salary")   return { ...card, disabled: !perms.mySpacePayroll };
    if (card.id === "invoices")       return { ...card, disabled: !perms.mySpaceInvoices };
    return card;
  });

  const handlePress = (id: string) => {
    if (id === "homework-exam") router.push("/staff-assignments");
    else if (id === "grades") router.push("/staff-grade-books" as any);
    else if (id === "expiring-students") router.push("/staff-expiring-students" as any);
    else if (id === "ending-classes") router.push("/staff-ending-classes" as any);
    else if (id === "salary-summary") router.push("/staff-salary-summary" as any);
    else if (id === "class-salary") router.push("/staff-class-salary" as any);
    else if (id === "invoices") router.push("/invoices" as any);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={{
          backgroundColor: colors.gradientStart,
          paddingTop: (Platform.OS === "web" ? topPad : insets.top) + 16,
          paddingBottom: 20,
          paddingHorizontal: 20,
        }}
      >
        <Text style={{ fontSize: 22, fontFamily: "Inter_700Bold", color: "#1e1b4b" }}>
          Học vụ - Hành chính
        </Text>
        <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: "rgba(30,27,75,0.65)", marginTop: 2 }}>
          Quản lý học vụ & hành chính
        </Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 + insets.bottom }}
        showsVerticalScrollIndicator={false}
      >
        <SectionTitle title="HỌC VỤ" color="#F97316" colors={colors} />
        <CardGrid cards={hocVuCards} colors={colors} onPress={handlePress} />

        <View style={{ height: 24 }} />

        <SectionTitle title="HÀNH CHÍNH" color="#8B5CF6" colors={colors} />
        <CardGrid cards={hanhChinhCards} colors={colors} onPress={handlePress} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  card: {
    width: "47.5%",
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    paddingBottom: 16,
    overflow: "hidden",
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  badgeText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    lineHeight: 14,
  },
  cardTitle: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    marginBottom: 6,
    lineHeight: 20,
  },
  cardSubtitle: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 17,
    marginBottom: 12,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    paddingVertical: 10,
    marginHorizontal: -16,
    paddingHorizontal: 16,
  },
  cardAction: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
});
