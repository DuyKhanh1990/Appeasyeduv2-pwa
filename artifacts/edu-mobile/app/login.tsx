import { Feather, Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "@/hooks/useSafeAreaInsets";

import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { getLastCredentials } from "@/lib/api";

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { login } = useAuth();

  const [centerUrl, setCenterUrl] = useState("");
  const [username, setUsername] = useState("");

  React.useEffect(() => {
    getLastCredentials().then(({ centerUrl: c, username: u }) => {
      if (c) setCenterUrl(c.replace(/^https?:\/\//i, "").replace(/\/$/, ""));
      if (u) setUsername(u);
    });
  }, []);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async () => {
    if (!centerUrl.trim() || !username.trim() || !password.trim()) {
      setError("Vui lòng điền đầy đủ thông tin");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const rawDomain = centerUrl.trim().replace(/^https?:\/\//i, "").replace(/\/$/, "");
      const fullUrl = `https://${rawDomain}`;
      await login(fullUrl, username.trim(), password.trim());
      router.replace("/(tabs)");
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      if (status === 401) {
        setError("Sai tài khoản hoặc mật khẩu");
      } else if (status === 0 || err instanceof TypeError) {
        setError("Không kết nối được tới trung tâm. Kiểm tra lại link.");
      } else {
        setError("Đăng nhập thất bại. Vui lòng thử lại.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#ffffff" }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.logoSection}>
            <Image
              source={require("../assets/images/logo.png")}
              style={styles.logoImage}
              resizeMode="contain"
            />
            <Text style={styles.tagline}>Nền tảng giáo dục thông minh</Text>
          </View>

          <View style={[styles.card, { backgroundColor: "#ffffff", borderRadius: colors.radius + 4, borderWidth: 1, borderColor: "#f1f0f5" }]}>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>Đăng nhập</Text>
            <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>Nhập thông tin để tiếp tục</Text>

            <View style={styles.fields}>
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.foreground }]}>Link trung tâm</Text>
                <View style={[styles.inputRow, { borderColor: colors.border, borderRadius: colors.radius, backgroundColor: colors.muted }]}>
                  <Ionicons name="link" size={18} color={colors.mutedForeground} />
                  <TextInput
                    style={[styles.input, { color: colors.foreground }]}
                    placeholder="trungtam.edu.vn"
                    placeholderTextColor={colors.mutedForeground}
                    value={centerUrl}
                    onChangeText={setCenterUrl}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    returnKeyType="next"
                  />
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.foreground }]}>Tài khoản</Text>
                <View style={[styles.inputRow, { borderColor: colors.border, borderRadius: colors.radius, backgroundColor: colors.muted }]}>
                  <Feather name="user" size={18} color={colors.mutedForeground} />
                  <TextInput
                    style={[styles.input, { color: colors.foreground }]}
                    placeholder="Nhập tài khoản"
                    placeholderTextColor={colors.mutedForeground}
                    value={username}
                    onChangeText={setUsername}
                    autoCapitalize="none"
                    returnKeyType="next"
                  />
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.foreground }]}>Mật khẩu</Text>
                <View style={[styles.inputRow, { borderColor: colors.border, borderRadius: colors.radius, backgroundColor: colors.muted }]}>
                  <Feather name="lock" size={18} color={colors.mutedForeground} />
                  <TextInput
                    style={[styles.input, { color: colors.foreground }]}
                    placeholder="Nhập mật khẩu"
                    placeholderTextColor={colors.mutedForeground}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    returnKeyType="done"
                    onSubmitEditing={handleLogin}
                  />
                  <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                    <Feather name={showPassword ? "eye-off" : "eye"} size={18} color={colors.mutedForeground} />
                  </TouchableOpacity>
                </View>
              </View>

              {error ? (
                <View style={[styles.errorBox, { backgroundColor: colors.destructive + "15", borderColor: colors.destructive, borderRadius: colors.radius }]}>
                  <Feather name="alert-circle" size={14} color={colors.destructive} />
                  <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
                </View>
              ) : null}

              <TouchableOpacity
                style={[styles.loginBtn, { borderRadius: colors.radius, opacity: loading ? 0.8 : 1 }]}
                onPress={handleLogin}
                disabled={loading}
                activeOpacity={0.85}
              >
                <View
                  style={[styles.loginBtnGrad, { borderRadius: colors.radius, backgroundColor: "#fb923c" }]}
                >
                  {loading ? (
                    <ActivityIndicator color="#ffffff" size="small" />
                  ) : (
                    <Text style={styles.loginBtnText}>Đăng nhập</Text>
                  )}
                </View>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.forgotRow}>
              <Text style={[styles.forgotText, { color: "#ea580c" }]}>Quên mật khẩu?</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.footer}>© 2026 EduCenter. Tất cả quyền được bảo lưu.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 24,
    gap: 28,
  },
  logoSection: {
    alignItems: "center",
    gap: 8,
  },
  logoImage: {
    width: 110,
    height: 110,
  },
  tagline: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "#9ca3af",
  },
  card: {
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 8,
  },
  cardTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    marginBottom: 4,
  },
  cardSub: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    marginBottom: 24,
  },
  fields: {
    gap: 16,
  },
  fieldGroup: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    padding: 0,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderWidth: 1,
    gap: 8,
  },
  errorText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    flex: 1,
  },
  loginBtn: {
    overflow: "hidden",
    marginTop: 4,
  },
  loginBtnGrad: {
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  loginBtnText: {
    color: "#ffffff",
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.3,
  },
  forgotRow: {
    alignItems: "center",
    marginTop: 16,
  },
  forgotText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  footer: {
    textAlign: "center",
    fontSize: 11,
    color: "rgba(255,255,255,0.5)",
    fontFamily: "Inter_400Regular",
  },
});
