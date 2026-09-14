import { Feather, Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React from "react";
import { Alert, Linking, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "@/hooks/useSafeAreaInsets";

import { useAuth, type UserRole } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

interface MenuItem {
  icon: React.ReactNode;
  label: string;
  sub?: string;
  onPress?: () => void;
  badge?: string;
  badgeColor?: string;
}

interface MenuSection {
  title: string;
  items: MenuItem[];
}

function getRoleLabel(role?: string) {
  switch (role) {
    case "teacher": return "Giáo viên";
    case "staff": return "Nhân viên";
    case "admin": return "Quản lý";
    case "parent": return "Phụ huynh";
    default: return "Học viên";
  }
}

export default function MenuScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, logout, setUserRole } = useAuth();
  const bottomPad = Platform.OS === "web" ? 34 : 0;

  const handleSwitchRole = () => {
    const options: { label: string; role: UserRole }[] = [
      { label: "Học viên", role: "student" },
      { label: "Giáo viên", role: "teacher" },
      { label: "Nhân viên", role: "staff" },
      { label: "Quản lý", role: "admin" },
      { label: "Phụ huynh", role: "parent" },
    ];

    if (Platform.OS === "web") {
      const choice = window.prompt(
        `Chọn loại tài khoản:\n${options.map((o, i) => `${i + 1}. ${o.label}`).join("\n")}\n\nNhập số (1-${options.length}):`
      );
      const idx = parseInt(choice ?? "", 10) - 1;
      if (idx >= 0 && idx < options.length) {
        setUserRole(options[idx].role);
      }
      return;
    }

    Alert.alert(
      "Loại tài khoản",
      "Chọn loại tài khoản phù hợp với bạn:",
      [
        ...options.map((o) => ({
          text: o.label + (user?.role === o.role ? " ✓" : ""),
          onPress: () => setUserRole(o.role),
        })),
        { text: "Hủy", style: "cancel" as const },
      ]
    );
  };

  const sections: MenuSection[] = [
    {
      title: "Hỗ trợ",
      items: [
        // Chỉ hiện với tài khoản admin
        ...(user?.role === "admin" ? [
          { icon: <Feather name="send" size={20} color={colors.warning} />, label: "Test Push Notification", sub: "Lấy token & thử thông báo", onPress: () => router.push("/push-test") },
        ] : []),
        { icon: <Feather name="info" size={20} color={colors.warning} />, label: "Về chúng tôi", sub: "easyedu.vn", onPress: () => Linking.openURL("https://easyedu.vn/") },
        { icon: <Feather name="file-text" size={20} color={colors.warning} />, label: "Điều khoản và dịch vụ", sub: "Chính sách sử dụng", onPress: () => Linking.openURL("https://easyedu.vn/dieu-khoan-dich-vu/") },
      ],
    },
    {
      title: "Tài khoản",
      items: [
        {
          icon: <Feather name="users" size={20} color={colors.primary} />,
          label: "Loại tài khoản",
          sub: `Hiện tại: ${getRoleLabel(user?.role)}`,
          onPress: handleSwitchRole,
        },
      ],
    },
  ];

  const doLogout = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await logout();
    router.replace("/login");
  };

  const handleLogout = () => {
    if (Platform.OS === "web") {
      if (window.confirm("Bạn có chắc muốn đăng xuất không?")) {
        doLogout();
      }
      return;
    }
    Alert.alert(
      "Đăng xuất",
      "Bạn có chắc muốn đăng xuất không?",
      [
        { text: "Hủy", style: "cancel" },
        { text: "Đăng xuất", style: "destructive", onPress: doLogout },
      ]
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Fixed purple header — not part of ScrollView */}
      <View
        style={[styles.profileHeader, { paddingTop: insets.top + 16, backgroundColor: colors.gradientStart }]}
      >
        <View style={styles.avatarLarge}>
          <Text style={styles.avatarLargeText}>{(user?.username || "H")[0].toUpperCase()}</Text>
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.profileName}>{user?.name || user?.username || "Học sinh"}</Text>
          {user?.username && (
            <Text style={styles.profileRole}>{user.username}</Text>
          )}
        </View>
      </View>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 100 + bottomPad }}
        showsVerticalScrollIndicator={false}
      >

        {sections.map((section, si) => (
          <View key={si} style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>{section.title.toUpperCase()}</Text>
            <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
              {section.items.map((item, ii) => (
                <TouchableOpacity
                  key={ii}
                  style={[
                    styles.menuItem,
                    ii < section.items.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                  ]}
                  activeOpacity={0.7}
                  onPress={item.onPress}
                >
                  <View style={[styles.menuIconBox, { backgroundColor: colors.background }]}>
                    {item.icon}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.menuLabel, { color: colors.foreground }]}>{item.label}</Text>
                    {item.sub && <Text style={[styles.menuSub, { color: colors.mutedForeground }]}>{item.sub}</Text>}
                  </View>
                  {item.badge && (
                    <View style={[styles.badge, { backgroundColor: item.badgeColor || colors.primary }]}>
                      <Text style={styles.badgeText}>{item.badge}</Text>
                    </View>
                  )}
                  <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        <View style={styles.section}>
          <TouchableOpacity
            style={[styles.logoutBtn, { backgroundColor: colors.destructive + "15", borderColor: colors.destructive, borderRadius: colors.radius }]}
            onPress={handleLogout}
            activeOpacity={0.8}
          >
            <Feather name="log-out" size={18} color={colors.destructive} />
            <Text style={[styles.logoutText, { color: colors.destructive }]}>Đăng xuất</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  profileHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 24,
    gap: 16,
  },
  avatarLarge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(30,27,75,0.12)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(30,27,75,0.2)",
  },
  avatarLargeText: {
    color: "#1e1b4b",
    fontSize: 26,
    fontFamily: "Inter_700Bold",
  },
  profileInfo: {
    flex: 1,
    gap: 2,
  },
  profileName: {
    color: "#1e1b4b",
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  profileRole: {
    color: "rgba(30,27,75,0.65)",
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  quickGrid: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 10,
  },
  quickTile: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderWidth: 1,
    gap: 8,
  },
  quickTileIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  quickTileLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
  },
  section: {
    paddingHorizontal: 16,
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  sectionCard: {
    borderWidth: 1,
    overflow: "hidden",
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
  },
  menuIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  menuLabel: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  menuSub: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    color: "#ffffff",
    fontSize: 10,
    fontFamily: "Inter_700Bold",
  },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    borderWidth: 1,
    gap: 10,
  },
  logoutText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
});
