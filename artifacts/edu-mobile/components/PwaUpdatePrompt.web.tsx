import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { registerWebServiceWorker } from "@/lib/pushNotifications";

const REMIND_AFTER_MS = 60 * 60 * 1000;

export function PwaUpdatePrompt() {
  const waitingWorker = useRef<ServiceWorker | null>(null);
  const deferredAt = useRef(0);
  const reloadRequested = useRef(false);
  const reloadTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [visible, setVisible] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const offerUpdate = useCallback((worker: ServiceWorker | null) => {
    if (!worker) return;
    waitingWorker.current = worker;
    if (Date.now() - deferredAt.current >= REMIND_AFTER_MS) {
      setVisible(true);
    }
  }, []);

  useEffect(() => {
    let disposed = false;
    let registration: ServiceWorkerRegistration | null = null;

    const handleControllerChange = () => {
      waitingWorker.current = null;
      setVisible(false);
      if (!reloadRequested.current) return;
      if (reloadTimeout.current) clearTimeout(reloadTimeout.current);
      window.location.reload();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;

      if (
        waitingWorker.current &&
        Date.now() - deferredAt.current >= REMIND_AFTER_MS
      ) {
        setVisible(true);
      }

      void registration?.update().catch((updateError) => {
        console.warn("[pwa-update] Không kiểm tra được bản cập nhật:", updateError);
      });
    };

    navigator.serviceWorker.addEventListener(
      "controllerchange",
      handleControllerChange,
    );
    document.addEventListener("visibilitychange", handleVisibilityChange);

    void registerWebServiceWorker()
      .then((nextRegistration) => {
        if (disposed || !nextRegistration) return;
        registration = nextRegistration;
        offerUpdate(nextRegistration.waiting);

        nextRegistration.addEventListener("updatefound", () => {
          const installingWorker = nextRegistration.installing;
          if (!installingWorker) return;

          installingWorker.addEventListener("statechange", () => {
            if (
              installingWorker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              offerUpdate(nextRegistration.waiting ?? installingWorker);
            }
          });
        });

        void nextRegistration.update().catch((updateError) => {
          console.warn("[pwa-update] Không kiểm tra được bản cập nhật:", updateError);
        });
      })
      .catch((registrationError) => {
        console.warn(
          "[pwa-update] Không đăng ký được Service Worker:",
          registrationError,
        );
      });

    return () => {
      disposed = true;
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        handleControllerChange,
      );
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (reloadTimeout.current) clearTimeout(reloadTimeout.current);
    };
  }, [offerUpdate]);

  const updateNow = () => {
    const worker = waitingWorker.current;
    if (!worker) {
      setError("Bản cập nhật chưa sẵn sàng. Vui lòng thử lại.");
      return;
    }

    reloadRequested.current = true;
    setUpdating(true);
    setError(null);
    worker.postMessage({ type: "SKIP_WAITING" });

    reloadTimeout.current = setTimeout(() => {
      reloadRequested.current = false;
      setUpdating(false);
      setError("Chưa thể cập nhật. Vui lòng kiểm tra kết nối và thử lại.");
    }, 15_000);
  };

  const deferUpdate = () => {
    deferredAt.current = Date.now();
    setVisible(false);
    setError(null);
  };

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={deferUpdate}
    >
      <View style={styles.backdrop}>
        <View
          accessibilityViewIsModal
          accessibilityLabel="EasyEdu có phiên bản mới"
          style={styles.card}
        >
          <Text style={styles.emoji}>🎉</Text>
          <Text style={styles.title}>Có phiên bản mới</Text>
          <Text style={styles.description}>
            EasyEdu đã có phiên bản cập nhật. Vui lòng cập nhật để sử dụng các
            tính năng và cải tiến mới nhất.
          </Text>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            accessibilityRole="button"
            disabled={updating}
            onPress={updateNow}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && !updating && styles.pressed,
              updating && styles.disabled,
            ]}
          >
            {updating ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>Cập nhật ngay</Text>
            )}
          </Pressable>

          <Pressable
            accessibilityRole="button"
            disabled={updating}
            onPress={deferUpdate}
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && !updating && styles.pressed,
            ]}
          >
            <Text style={styles.secondaryButtonText}>Để sau</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15, 23, 42, 0.46)",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 24,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 24,
    paddingBottom: 20,
    paddingTop: 26,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 28,
    elevation: 12,
  },
  emoji: {
    marginBottom: 10,
    fontSize: 38,
    lineHeight: 46,
    textAlign: "center",
  },
  title: {
    color: "#172033",
    fontFamily: "Inter_700Bold",
    fontSize: 22,
    lineHeight: 29,
    textAlign: "center",
  },
  description: {
    marginTop: 10,
    color: "#667085",
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    lineHeight: 23,
    textAlign: "center",
  },
  error: {
    marginTop: 10,
    color: "#B42318",
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
  },
  primaryButton: {
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 22,
    borderRadius: 14,
    backgroundColor: "#FF8F3D",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontFamily: "Inter_700Bold",
    fontSize: 16,
  },
  secondaryButton: {
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
    borderRadius: 14,
  },
  secondaryButtonText: {
    color: "#5E6B7A",
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
  },
  pressed: {
    opacity: 0.78,
  },
  disabled: {
    opacity: 0.72,
  },
});