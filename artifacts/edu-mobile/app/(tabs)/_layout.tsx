import { BlurView } from "expo-blur";
import { Redirect, Tabs } from "expo-router";
import { Feather } from "@expo/vector-icons";
import React from "react";
import { Platform, StyleSheet, TouchableOpacity, View, useColorScheme } from "react-native";
import { useSafeAreaInsets } from "@/hooks/useSafeAreaInsets";

import { useAuth } from "@/context/AuthContext";
import { ChatUnreadProvider, useChatUnread } from "@/context/ChatUnreadContext";
import { useColors } from "@/hooks/useColors";
import { usePermissions } from "@/hooks/usePermissions";

const TAB_BAR_CONTENT_HEIGHT = 64;
const WEB_BOTTOM_INSET_FALLBACK = 16;

/** Renders a tab that is visible but dimmed and non-interactive. */
function disabledTabButton(props: any) {
  return (
    <TouchableOpacity
      {...(props as React.ComponentProps<typeof TouchableOpacity>)}
      disabled
      onPress={() => {}}
      activeOpacity={1}
      style={[props.style as any, { opacity: 0.35 }]}
    />
  );
}

function TabLayoutInner() {
  const { user, isLoading } = useAuth();
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(
    insets.bottom,
    isWeb ? WEB_BOTTOM_INSET_FALLBACK : 0,
  );
  const { totalUnread } = useChatUnread();
  const perms = usePermissions();

  if (!isLoading && !user) {
    return <Redirect href="/login" />;
  }

  const isStudent = !user || user.role === "student" || user.role === "parent";

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: false,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : colors.background,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
          elevation: 0,
          height: TAB_BAR_CONTENT_HEIGHT + bottomInset,
          paddingBottom: bottomInset,
          paddingTop: 6,
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView
              intensity={100}
              tint={isDark ? "dark" : "light"}
              style={StyleSheet.absoluteFill}
            />
          ) : (
            <View
              style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]}
            />
          ),
        tabBarLabelStyle: {
          fontSize: 10,
          lineHeight: 14,
          fontFamily: "Inter_500Medium",
          marginBottom: 2,
        },
        tabBarIconStyle: {
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Trang chủ",
          tabBarIcon: ({ color }) => <Feather name="home" size={22} color={color} />,
        }}
      />

      {/* Lịch — dim nếu staff không có quyền calendar; student/parent luôn được xem */}
      <Tabs.Screen
        name="schedule"
        options={{
          title: "Lịch",
          tabBarIcon: ({ color }) => <Feather name="calendar" size={22} color={color} />,
          ...(!isStudent && !perms.canViewSchedule
            ? { tabBarButton: disabledTabButton }
            : {}),
        }}
      />

      <Tabs.Screen
        name="homework"
        options={{
          title: "BTVN",
          href: isStudent ? undefined : null,
          tabBarIcon: ({ color }) => <Feather name="book" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="grades"
        options={{
          title: "Bảng điểm",
          href: isStudent ? undefined : null,
          tabBarIcon: ({ color }) => <Feather name="bar-chart-2" size={22} color={color} />,
        }}
      />

      <Tabs.Screen
        name="academic"
        options={{
          title: "Học vụ - HC",
          href: isStudent ? null : undefined,
          tabBarIcon: ({ color }) => <Feather name="book-open" size={22} color={color} />,
        }}
      />
      {/* Bảng tin — không hiển thị trên thanh tab, truy cập qua trang chủ */}
      <Tabs.Screen
        name="newsfeed"
        options={{
          title: "Bảng tin",
          href: null,
          tabBarIcon: ({ color }) => <Feather name="rss" size={22} color={color} />,
        }}
      />

      {/* Công việc — dim nếu không có quyền tasks */}
      <Tabs.Screen
        name="tasks"
        options={{
          title: "Công việc",
          href: isStudent ? null : undefined,
          tabBarIcon: ({ color }) => <Feather name="briefcase" size={22} color={color} />,
          ...(!isStudent && !perms.canViewTasks
            ? { tabBarButton: disabledTabButton }
            : {}),
        }}
      />

      <Tabs.Screen
        name="chat"
        options={{
          title: "Chat",
          tabBarIcon: ({ color }) => <Feather name="message-circle" size={22} color={color} />,
          tabBarBadge: totalUnread > 0 ? (totalUnread > 99 ? "99+" : totalUnread) : undefined,
          tabBarBadgeStyle: { fontSize: 10, minWidth: 18, height: 18, lineHeight: 18 },
        }}
      />
      <Tabs.Screen
        name="menu"
        options={{
          title: "Menu",
          tabBarIcon: ({ color }) => <Feather name="menu" size={22} color={color} />,
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  return (
    <ChatUnreadProvider>
      <TabLayoutInner />
    </ChatUnreadProvider>
  );
}
