import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as Font from "expo-font";
import { Stack, router } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { Platform } from "react-native";
import React, { useEffect, useRef, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import type { EventSubscription } from "expo-modules-core";

import * as Notifications from "expo-notifications";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider } from "@/context/AuthContext";
import {
  addNotificationReceivedListener,
  addNotificationResponseReceivedListener,
} from "@/lib/pushNotifications";
import { sendPushTokenToBackend } from "@/lib/api";
import { navigateDeeplink, deeplinkFromPushData } from "@/lib/deeplinkNavigator";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function useNotificationListeners() {
  const receivedSub = useRef<EventSubscription | null>(null);
  const responseSub = useRef<EventSubscription | null>(null);

  const tokenSub = useRef<ReturnType<typeof Notifications.addPushTokenListener> | null>(null);

  useEffect(() => {
    if (Platform.OS === "web") return;

    // App đang mở (foreground): notification vẫn hiện được nhờ setNotificationHandler
    // trong lib/pushNotifications.ts, ở đây chỉ log lại để debug/xử lý thêm nếu cần.
    receivedSub.current = addNotificationReceivedListener((notification) => {
      console.log("[push] Nhận thông báo khi app đang mở:", notification.request.content);
    });

    // App chạy nền hoặc bị tắt, người dùng bấm vào notification để mở app lại.
    responseSub.current = addNotificationResponseReceivedListener((response) => {
      const data = (response.notification.request.content.data ?? {}) as Record<string, any>;
      console.log("[push] Người dùng bấm vào thông báo:", data);

      // Màn hình dev — giữ lại để test
      if (data.screen === "push-test") {
        router.push("/push-test");
        return;
      }

      // Dùng deeplinkNavigator chung — hỗ trợ cả { screen, params } lẫn { type, referenceId }
      const deeplink = deeplinkFromPushData(data);
      if (deeplink) navigateDeeplink(deeplink);
    });

    // Push Token Refresh — khi OS cấp token mới (thiết bị reset, token expire...)
    // tự động gửi lại về backend mà không cần user login lại.
    tokenSub.current = Notifications.addPushTokenListener(({ data: newToken }) => {
      if (newToken) {
        console.log("[push] Token mới, cập nhật backend:", newToken.slice(0, 20) + "…");
        sendPushTokenToBackend(newToken);
      }
    });

    // Cold start: app bị kill hoàn toàn, user bấm notification để mở lại app.
    // addNotificationResponseReceivedListener ở trên thường không kịp bắt sự kiện
    // này vì listener được đăng ký sau khi app đã khởi động lại từ đầu.
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      const data = (response.notification.request.content.data ?? {}) as Record<string, any>;
      console.log("[push] Cold start từ thông báo:", data);

      if (data.screen === "push-test") {
        router.push("/push-test");
        return;
      }

      const deeplink = deeplinkFromPushData(data);
      if (deeplink) navigateDeeplink(deeplink);
    });

    return () => {
      receivedSub.current?.remove();
      responseSub.current?.remove();
      tokenSub.current?.remove();
    };
  }, []);
}

function RootLayoutNav() {
  useNotificationListeners();

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="session-detail/[id]" options={{ headerShown: false, animation: "slide_from_right" }} />
      <Stack.Screen name="news-post/[id]" options={{ headerShown: false, animation: "slide_from_right" }} />
      <Stack.Screen name="push-test" options={{ headerShown: false, presentation: "modal" }} />
    </Stack>
  );
}

function NativeRootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function prepare() {
      try {
        await Font.loadAsync({
          Inter_400Regular: require("../assets/fonts/Inter_400Regular.ttf"),
          Inter_500Medium: require("../assets/fonts/Inter_500Medium.ttf"),
          Inter_600SemiBold: require("../assets/fonts/Inter_600SemiBold.ttf"),
          Inter_700Bold: require("../assets/fonts/Inter_700Bold.ttf"),
          Feather: require("../assets/fonts/Feather.ttf"),
          Ionicons: require("../assets/fonts/Ionicons.ttf"),
          MaterialCommunityIcons: require("../assets/fonts/MaterialCommunityIcons.ttf"),
        });
      } catch {
        // timeout hoặc lỗi load — tiếp tục với system fonts
      }
      SplashScreen.hideAsync().catch(() => {});
      setReady(true);
    }
    prepare();
  }, []);

  if (!ready) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <GestureHandlerRootView>
              <KeyboardProvider>
                <RootLayoutNav />
              </KeyboardProvider>
            </GestureHandlerRootView>
          </AuthProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

function WebRootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function prepare() {
      try {
        // Preload icon/text fonts up-front on web too. Without this, each
        // <Feather>/<Ionicons>/<MaterialCommunityIcons> instance triggers its
        // own lazy font load with a fixed 6s timeout; under the proxied
        // Replit preview that timer can expire before the font arrives,
        // producing an uncaught "6000ms timeout exceeded" error. Loading once
        // here (and swallowing failures) means icons fall back gracefully
        // instead of crashing.
        await Font.loadAsync({
          Inter_400Regular: require("../assets/fonts/Inter_400Regular.ttf"),
          Inter_500Medium: require("../assets/fonts/Inter_500Medium.ttf"),
          Inter_600SemiBold: require("../assets/fonts/Inter_600SemiBold.ttf"),
          Inter_700Bold: require("../assets/fonts/Inter_700Bold.ttf"),
          Feather: require("../assets/fonts/Feather.ttf"),
          Ionicons: require("../assets/fonts/Ionicons.ttf"),
          MaterialCommunityIcons: require("../assets/fonts/MaterialCommunityIcons.ttf"),
        });
      } catch {
        // timeout hoặc lỗi load — tiếp tục với system fonts
      }
      SplashScreen.hideAsync().catch(() => {});
      setReady(true);
    }
    prepare();
  }, []);

  if (!ready) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <GestureHandlerRootView>
              <KeyboardProvider>
                <RootLayoutNav />
              </KeyboardProvider>
            </GestureHandlerRootView>
          </AuthProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

export default function RootLayout() {
  if (Platform.OS === "web") {
    return <WebRootLayout />;
  }
  return <NativeRootLayout />;
}
