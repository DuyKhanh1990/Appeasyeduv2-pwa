import { Feather, Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Linking, Platform, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "@/hooks/useSafeAreaInsets";

import { useAuth, type UserRole } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useColors } from "@/hooks/useColors";
import { registerWebServiceWorker } from "@/lib/pushNotifications";

interface MenuItem {
  icon: React.ReactNode;
  label: string;
  sub?: string;
  onPress?: () => void;
  badge?: string;
  badgeColor?: string;
  rightElement?: React.ReactNode;
}

interface MenuSection {
  title: string;
  items: MenuItem[];
}

function getRoleLabel(role: string | undefined, t: (text: string) => string) {
  switch (role) {
    case "teacher": return t("Giáo viên");
    case "staff": return t("Nhân viên");
    case "admin": return t("Quản lý");
    case "parent": return t("Phụ huynh");
    default: return t("Học viên");
  }
}

export default function MenuScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, logout, setUserRole } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const isEnglish = language === "en";
  const bottomPad = Platform.OS === "web" ? 34 : 0;
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateMessage, setUpdateMessage] = useState("");
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const appVersion = Constants.expoConfig?.version ?? "1.0.0";

  const checkForPwaUpdate = useCallback(async () => {
    if (Platform.OS !== "web" || !("serviceWorker" in navigator)) return null;
    setCheckingUpdate(true);
    try {
      const registration = registrationRef.current ?? await registerWebServiceWorker();
      if (!registration) return null;
      registrationRef.current = registration;
      await registration.update();
      const waitingWorker = registration.waiting;
      setUpdateAvailable(Boolean(waitingWorker));
      return { registration, waitingWorker };
    } catch (error) {
      console.warn("[pwa-update] Menu không kiểm tra được bản cập nhật:", error);
      setUpdateMessage(t("Không thể kiểm tra cập nhật. Vui lòng thử lại."));
      return null;
    } finally {
      setCheckingUpdate(false);
    }
  }, [t]);

  useEffect(() => {
    if (Platform.OS !== "web" || !("serviceWorker" in navigator)) return;
    let disposed = false;
    let registration: ServiceWorkerRegistration | null = null;

    const syncUpdateState = async () => {
      const result = await checkForPwaUpdate();
      if (!disposed && result) {
        registration = result.registration;
        registrationRef.current = registration;
        setUpdateAvailable(Boolean(registration.waiting));
      }
    };

    const handleUpdateFound = () => {
      const installing = registration?.installing;
      if (!installing) return;
      installing.addEventListener("statechange", () => {
        if (installing.state === "installed" && navigator.serviceWorker.controller) {
          setUpdateAvailable(Boolean(registration?.waiting));
        }
      });
    };

    void registerWebServiceWorker().then((nextRegistration) => {
      if (disposed || !nextRegistration) return;
      registration = nextRegistration;
      registrationRef.current = nextRegistration;
      setUpdateAvailable(Boolean(nextRegistration.waiting));
      nextRegistration.addEventListener("updatefound", handleUpdateFound);
      void syncUpdateState();
    });

    window.addEventListener("pageshow", syncUpdateState);
    window.addEventListener("focus", syncUpdateState);
    document.addEventListener("visibilitychange", syncUpdateState);
    return () => {
      disposed = true;
      window.removeEventListener("pageshow", syncUpdateState);
      window.removeEventListener("focus", syncUpdateState);
      document.removeEventListener("visibilitychange", syncUpdateState);
      registration?.removeEventListener("updatefound", handleUpdateFound);
    };
  }, [checkForPwaUpdate]);

  const handlePwaUpdatePress = async () => {
    if (checkingUpdate) return;
    setUpdateMessage("");
    const result = await checkForPwaUpdate();
    if (!result) return;

    const waitingWorker = result.registration.waiting;
    if (!waitingWorker) {
      if (result.registration.installing) {
        setUpdateMessage(t("Bản cập nhật đang được tải. Vui lòng chờ."));
        return;
      }
      setUpdateAvailable(false);
      setUpdateMessage(t("Bạn đang dùng phiên bản mới nhất."));
      return;
    }

    setUpdateAvailable(true);
    if (waitingWorker.state === "activated") {
      window.location.reload();
      return;
    }

    let reloaded = false;
    const reload = () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", reload, { once: true });
    waitingWorker.addEventListener("statechange", () => {
      if (waitingWorker.state === "activated") reload();
    });
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
    setUpdateMessage(t("Đang cập nhật ứng dụng..."));
  };

  const handleSwitchRole = () => {
    const options: { label: string; role: UserRole }[] = [
      { label: t("Học viên"), role: "student" },
      { label: t("Giáo viên"), role: "teacher" },
      { label: t("Nhân viên"), role: "staff" },
      { label: t("Quản lý"), role: "admin" },
      { label: t("Phụ huynh"), role: "parent" },
    ];

    if (Platform.OS === "web") {
      const choice = window.prompt(
        `${t("Chọn loại tài khoản")}:\n${options.map((o, i) => `${i + 1}. ${o.label}`).join("\n")}\n\n${t("Nhập số")}: 1-${options.length}`
      );
      const idx = parseInt(choice ?? "", 10) - 1;
      if (idx >= 0 && idx < options.length) {
        setUserRole(options[idx].role);
      }
      return;
    }

    Alert.alert(
      t("Loại tài khoản"),
      t("Chọn loại tài khoản phù hợp với bạn:"),
      [
        ...options.map((o) => ({
          text: o.label + (user?.role === o.role ? " ✓" : ""),
          onPress: () => setUserRole(o.role),
        })),
        { text: t("Hủy"), style: "cancel" as const },
      ]
    );
  };

  const sections: MenuSection[] = [
    {
      title: t("Hỗ trợ"),
      items: [
        // Chỉ hiện với tài khoản admin
        ...(user?.role === "admin" ? [
          { icon: <Feather name="send" size={20} color={colors.warning} />, label: t("Test Push Notification"), sub: t("Lấy token & thử thông báo"), onPress: () => router.push("/push-test") },
        ] : []),
        { icon: <Feather name="info" size={20} color={colors.warning} />, label: t("Về chúng tôi"), sub: "easyedu.vn", onPress: () => Linking.openURL("https://easyedu.vn/") },
        { icon: <Feather name="file-text" size={20} color={colors.warning} />, label: t("Điều khoản và dịch vụ"), sub: t("Chính sách sử dụng"), onPress: () => Linking.openURL("https://easyedu.vn/dieu-khoan-dich-vu/") },
      ],
    },
    {
      title: t("Tùy chọn"),
      items: [
        {
          icon: <Feather name="globe" size={20} color={colors.primary} />,
          label: t("Ngôn ngữ"),
          sub: t(isEnglish ? "English" : "Tiếng Việt"),
          rightElement: (
            <Switch
              value={isEnglish}
              onValueChange={(value) => {
                void setLanguage(value ? "en" : "vi");
              }}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={colors.card}
              ios_backgroundColor={colors.border}
              accessibilityLabel="Chuyển ngôn ngữ ứng dụng"
              testID="language-switch"
            />
          ),
        },
      ],
    },
    {
      title: t("Tài khoản"),
      items: [
        {
          icon: <Feather name="users" size={20} color={colors.primary} />,
          label: t("Loại tài khoản"),
          sub: `${t("Hiện tại")}: ${getRoleLabel(user?.role, t)}`,
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
      t("Đăng xuất"),
      t("Bạn có chắc muốn đăng xuất không?"),
      [
        { text: t("Hủy"), style: "cancel" },
        { text: t("Đăng xuất"), style: "destructive", onPress: doLogout },
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
          <Text style={styles.avatarLargeText}>{(user?.name || user?.profileCode || user?.username || "H")[0].toUpperCase()}</Text>
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.profileName}>{user?.name || user?.username || t("Học sinh")}</Text>
          {(user?.profileCode || user?.username) && (
            <Text style={styles.profileRole}>{user.profileCode || user.username}</Text>
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
                  {item.rightElement ?? <Feather name="chevron-right" size={16} color={colors.mutedForeground} />}
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
            <Text style={[styles.logoutText, { color: colors.destructive }]}>{t("Đăng xuất")}</Text>
          </TouchableOpacity>
          {Platform.OS === "web" ? (
            <View style={styles.pwaUpdateArea}>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={t(updateAvailable ? "Cập nhật phiên bản mới" : "Kiểm tra cập nhật")}
                disabled={checkingUpdate}
                onPress={handlePwaUpdatePress}
                style={[styles.pwaUpdateButton, { borderColor: colors.primary }]}
                activeOpacity={0.75}
              >
                <Feather
                  name={updateAvailable ? "download-cloud" : "refresh-cw"}
                  size={14}
                  color={colors.primary}
                />
                <Text style={[styles.pwaUpdateButtonText, { color: colors.primary }]}>
                  {checkingUpdate
                    ? t("Đang kiểm tra...")
                    : t(updateAvailable ? "Cập nhật phiên bản mới" : "Kiểm tra cập nhật")}
                </Text>
              </TouchableOpacity>
              {updateMessage ? (
                <Text style={[styles.pwaUpdateMessage, { color: colors.mutedForeground }]}>{updateMessage}</Text>
              ) : null}
              <Text style={[styles.appVersion, { color: colors.mutedForeground }]}>
                {t("Phiên bản")} {appVersion}
              </Text>
            </View>
          ) : null}
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
  pwaUpdateArea: {
    alignItems: "center",
    marginTop: 8,
    gap: 6,
  },
  pwaUpdateButton: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    gap: 7,
  },
  pwaUpdateButtonText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  pwaUpdateMessage: {
    fontSize: 11,
    textAlign: "center",
  },
  appVersion: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
});
