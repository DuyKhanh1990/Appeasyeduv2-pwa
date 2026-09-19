import { CameraView, useCameraPermissions } from "expo-camera";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { apiGet, apiPost } from "@/lib/api";
import { useSafeAreaInsets } from "@/hooks/useSafeAreaInsets";
import { QrScanIcon } from "@/components/QrScanIcon";

interface QrScanResponse {
  student: {
    id: string;
    code: string;
    fullName: string;
  };
  session: {
    studentSessionId: string;
    classSessionId: string;
    classId?: string;
    className: string;
    classCode?: string;
    sessionDate: string;
    sessionIndex?: number;
    startTime: string;
    endTime: string;
    teacherName?: string;
    attendanceStatus: string;
  };
  attendance: {
    canAttend: boolean;
    displayFrom?: string;
    openAt?: string;
    latestAt?: string;
  };
}

function extractTokenFromUrl(value: string): string | null {
  try {
    const url = new URL(value);
    for (const key of ["token", "qrToken", "attendanceToken"]) {
      const token = url.searchParams.get(key)?.trim();
      if (token) return token;
    }
  } catch {
    // Some QR payloads contain a relative query string rather than a full URL.
  }
  const query = value.split(/[?#]/)[1];
  if (query) {
    for (const part of query.split("&")) {
      const [key, ...rest] = part.split("=");
      if (["token", "qrToken", "attendanceToken"].includes(key)) {
        const token = decodeURIComponent(rest.join("=")).trim();
        if (token) return token;
      }
    }
  }
  return null;
}

function findTokenInPayload(value: unknown): string | null {
  if (typeof value === "string") {
    const raw = value.trim();
    return extractTokenFromUrl(raw) || (raw || null);
  }
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  for (const key of ["token", "qrToken", "attendanceToken"]) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  for (const candidate of Object.values(record)) {
    const token = findTokenInPayload(candidate);
    if (token) return token;
  }
  return null;
}

function extractQrToken(value: string): string {
  const raw = value.trim();
  if (!raw) return "";
  const urlToken = extractTokenFromUrl(raw);
  if (urlToken) return urlToken;
  try {
    return findTokenInPayload(JSON.parse(raw)) || raw;
  } catch {
    return raw;
  }
}

function formatTime(value?: string): string {
  if (!value) return "--:--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(11, 16) || value;
  return date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}

export function StaffQrScannerScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const [manualToken, setManualToken] = useState("");
  const [scanResult, setScanResult] = useState<QrScanResponse | null>(null);
  const [scanError, setScanError] = useState("");
  const [busy, setBusy] = useState(false);
  const [scannerActive, setScannerActive] = useState(true);
  const [attended, setAttended] = useState(false);
  const closeAfterSuccessRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isStaff = user?.role === "staff" || user?.role === "teacher" || user?.role === "admin";
  const permissionLabel = useMemo(() => {
    if (!permission?.granted) return "Cho phép camera để quét mã QR";
    return "Đưa mã QR vào khung quét";
  }, [permission?.granted]);

  useEffect(() => {
    return () => {
      if (closeAfterSuccessRef.current) clearTimeout(closeAfterSuccessRef.current);
    };
  }, []);

  const scanToken = async (rawValue: string) => {
    const token = extractQrToken(rawValue);
    if (!token || busy) return;

    setBusy(true);
    setScannerActive(false);
    setScanError("");
    setScanResult(null);
    setAttended(false);

    try {
      const result = await apiGet<QrScanResponse>(`/api/attendance-qr/scan/${encodeURIComponent(token)}`);
      setScanResult(result);
    } catch (error) {
      const status = (error as { status?: number })?.status;
      const serverMessage = (error as { serverMessage?: string })?.serverMessage?.trim();
      setScanError(
        status === 404
          ? "Camera đã đọc mã QR, nhưng hiện chưa có lịch điểm danh phù hợp cho học viên này. Hãy kiểm tra đúng trung tâm và thời gian buổi học."
          : status === 409
            ? "Có nhiều lịch trùng thời gian. Vui lòng chọn điểm danh trong Lịch."
            : serverMessage || "Không thể đọc mã QR. Vui lòng thử lại.",
      );
      setScannerActive(true);
    } finally {
      setBusy(false);
    }
  };

  const isAlreadyAttended =
    scanResult?.session.attendanceStatus?.toLowerCase() === "present";

  const markAttendance = async () => {
    if (!scanResult?.attendance.canAttend || isAlreadyAttended || busy) return;
    setBusy(true);
    setScanError("");
    try {
      await apiPost(
        `/api/mobile/staff/calendar/session/${encodeURIComponent(scanResult.session.classSessionId)}/attendance`,
        {
          studentSessionId: scanResult.session.studentSessionId,
          attendanceStatus: "present",
          attendanceNote: "Điểm danh QR",
        },
      );
      setAttended(true);
      closeAfterSuccessRef.current = setTimeout(() => {
        closeAfterSuccessRef.current = null;
        reset();
      }, 900);
    } catch (error) {
      const status = (error as { status?: number })?.status;
      setScanError(status === 403 ? "Chưa đến giờ mở điểm danh cho buổi học này." : "Điểm danh chưa thành công. Vui lòng thử lại.");
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    if (closeAfterSuccessRef.current) {
      clearTimeout(closeAfterSuccessRef.current);
      closeAfterSuccessRef.current = null;
    }
    setManualToken("");
    setScanResult(null);
    setScanError("");
    setAttended(false);
    setScannerActive(true);
  };

  if (!isStaff) {
    return (
      <View style={[styles.centerState, { backgroundColor: colors.background }]}>
        <Feather name="lock" size={38} color={colors.mutedForeground} />
        <Text style={[styles.centerTitle, { color: colors.foreground }]}>Tính năng dành cho Staff</Text>
        <Text style={[styles.centerText, { color: colors.mutedForeground }]}>Tài khoản này không có quyền quét QR.</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.topBar, { paddingTop: insets.top + 12, backgroundColor: colors.gradientStart }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backButton}>
          <Feather name="arrow-left" size={21} color="#fff" />
        </Pressable>
        <View style={styles.topBarCopy}>
          <Text style={styles.topBarTitle}>Quét QR điểm danh</Text>
          <Text style={styles.topBarSubtitle}>Quét mã học viên để điểm danh nhanh</Text>
        </View>
        <View style={styles.topBarIcon}>
          <QrScanIcon size={24} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 110 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.cameraCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.cameraHeader}>
            <View>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Camera quét mã</Text>
              <Text style={[styles.sectionSubtitle, { color: colors.mutedForeground }]}>{permissionLabel}</Text>
            </View>
            <View style={[styles.livePill, { backgroundColor: scannerActive ? colors.success + "16" : colors.muted }]}>
              <View style={[styles.liveDot, { backgroundColor: scannerActive ? colors.success : colors.mutedForeground }]} />
              <Text style={[styles.liveText, { color: scannerActive ? colors.success : colors.mutedForeground }]}>
                {scannerActive ? "Sẵn sàng" : "Đã dừng"}
              </Text>
            </View>
          </View>

          <View style={styles.cameraFrame}>
            {permission?.granted && scannerActive ? (
              <CameraView
                style={StyleSheet.absoluteFill}
                facing="back"
                autofocus="on"
                barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                onBarcodeScanned={busy ? undefined : ({ data }) => scanToken(data)}
              />
            ) : (
              <View style={styles.cameraPlaceholder}>
                <View style={styles.cameraPlaceholderIcon}>
                  <Feather name={permission?.granted ? "pause-circle" : "camera"} size={34} color="#fff" />
                </View>
                <Text style={styles.cameraPlaceholderTitle}>
                  {permission?.granted ? "Camera đang tạm dừng" : "Camera chưa được cấp quyền"}
                </Text>
                <Text style={styles.cameraPlaceholderText}>
                  {permission?.granted ? "Bấm quét lại để tiếp tục" : "Cấp quyền camera để bắt đầu quét"}
                </Text>
              </View>
            )}
            <View pointerEvents="none" style={styles.scanOverlay}>
              <View style={styles.scanCornerTopLeft} />
              <View style={styles.scanCornerTopRight} />
              <View style={styles.scanCornerBottomLeft} />
              <View style={styles.scanCornerBottomRight} />
            </View>
          </View>

          {!permission?.granted ? (
            <TouchableOpacity
              activeOpacity={0.84}
              onPress={() => requestPermission()}
              style={[styles.primaryButton, { backgroundColor: colors.primary }]}
            >
              <Feather name="camera" size={18} color="#fff" />
              <Text style={styles.primaryButtonText}>Cho phép camera</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              activeOpacity={0.84}
              onPress={() => setScannerActive((value) => !value)}
              style={[styles.secondaryButton, { borderColor: colors.border, backgroundColor: colors.background }]}
            >
              <Feather name={scannerActive ? "pause" : "camera"} size={17} color={colors.primary} />
              <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>
                {scannerActive ? "Tạm dừng camera" : "Quét lại"}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.manualSection}>
          <View style={styles.dividerRow}>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <Text style={[styles.dividerText, { color: colors.mutedForeground }]}>hoặc nhập token</Text>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
          </View>
          <View style={styles.manualRow}>
            <TextInput
              value={manualToken}
              onChangeText={setManualToken}
              placeholder="Dán token QR tại đây"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.manualInput, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]}
            />
            <TouchableOpacity
              activeOpacity={0.82}
              disabled={!manualToken.trim() || busy}
              onPress={() => scanToken(manualToken)}
              style={[styles.manualButton, { backgroundColor: manualToken.trim() ? colors.primary : colors.muted }]}
            >
              {busy ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="arrow-right" size={19} color="#fff" />}
            </TouchableOpacity>
          </View>
        </View>

        {scanError ? (
          <View style={[styles.errorBox, { backgroundColor: colors.destructive + "12", borderColor: colors.destructive + "35" }]}>
            <Feather name="alert-circle" size={17} color={colors.destructive} />
            <Text style={[styles.errorText, { color: colors.destructive }]}>{scanError}</Text>
          </View>
        ) : null}

        {scanResult ? (
          <Modal
            visible
            transparent
            animationType="fade"
            onRequestClose={reset}
            statusBarTranslucent
          >
            <Pressable style={styles.resultModalBackdrop} onPress={reset}>
              <View
                style={[styles.resultModalSheet, { backgroundColor: colors.background }]}
                onStartShouldSetResponder={() => true}
              >
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.resultModalContent}
                >
          <View style={[styles.resultCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.resultHeader}>
              <View>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Thông tin học viên</Text>
                <Text style={[styles.sectionSubtitle, { color: colors.mutedForeground }]}>Kết quả từ mã QR vừa quét</Text>
              </View>
              {attended ? (
                <View style={[styles.statusPill, { backgroundColor: colors.success + "16" }]}>
                  <Feather name="check" size={13} color={colors.success} />
                  <Text style={[styles.statusPillText, { color: colors.success }]}>Đã điểm danh</Text>
                </View>
              ) : null}
            </View>

            <View style={[styles.studentResult, { backgroundColor: colors.primary + "0b" }]}>
              <View style={[styles.resultAvatar, { backgroundColor: colors.primary }]}>
                <Text style={styles.resultAvatarText}>{scanResult.student.fullName[0]?.toUpperCase() || "H"}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.resultStudentName, { color: colors.foreground }]}>{scanResult.student.fullName}</Text>
                <Text style={[styles.resultStudentCode, { color: colors.primary }]}>{scanResult.student.code}</Text>
              </View>
            </View>

            <View style={styles.detailGrid}>
              <View style={styles.detailCell}>
                <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>Lớp học</Text>
                <Text style={[styles.detailValue, { color: colors.foreground }]} numberOfLines={2}>
                  {scanResult.session.classCode || scanResult.session.className}
                </Text>
              </View>
              <View style={styles.detailCell}>
                <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>Khung giờ</Text>
                <Text style={[styles.detailValue, { color: colors.foreground }]}>
                  {scanResult.session.startTime} – {scanResult.session.endTime}
                </Text>
              </View>
            </View>

             <View
               style={[
                 styles.attendanceState,
                 {
                   backgroundColor:
                     isAlreadyAttended || scanResult.attendance.canAttend
                       ? colors.success + "12"
                       : colors.warning + "16",
                 },
               ]}
             >
              <Feather
                 name={isAlreadyAttended || scanResult.attendance.canAttend ? "check-circle" : "clock"}
                size={18}
                 color={isAlreadyAttended || scanResult.attendance.canAttend ? colors.success : colors.warning}
              />
               <Text
                 style={[
                   styles.attendanceStateText,
                   { color: isAlreadyAttended || scanResult.attendance.canAttend ? colors.success : colors.warning },
                 ]}
               >
                 {attended
                  ? "Đã ghi nhận điểm danh thành công."
                   : isAlreadyAttended
                     ? "Học viên đã được điểm danh trước đó."
                  : scanResult.attendance.canAttend
                    ? "Đang trong thời gian được phép điểm danh."
                    : `Điểm danh mở lúc ${formatTime(scanResult.attendance.openAt)}.`}
              </Text>
            </View>

             {!attended && !isAlreadyAttended ? (
              <TouchableOpacity
                activeOpacity={0.84}
                disabled={!scanResult.attendance.canAttend || busy}
                onPress={markAttendance}
                style={[styles.primaryButton, { backgroundColor: scanResult.attendance.canAttend ? colors.primary : colors.muted }]}
              >
                {busy ? <ActivityIndicator color="#fff" /> : <Feather name="check-circle" size={18} color="#fff" />}
                <Text style={styles.primaryButtonText}>
                  {scanResult.attendance.canAttend ? "Điểm danh học viên" : "Chưa đến giờ điểm danh"}
                </Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity activeOpacity={0.82} onPress={reset} style={styles.scanAnotherButton}>
              <Feather name="refresh-cw" size={16} color={colors.primary} />
              <Text style={[styles.scanAnotherText, { color: colors.primary }]}>Quét học viên khác</Text>
            </TouchableOpacity>
          </View>
                </ScrollView>
              </View>
            </Pressable>
          </Modal>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 12,
  },
  backButton: { padding: 4 },
  topBarCopy: { flex: 1 },
  topBarTitle: { color: "#fff", fontSize: 18, fontFamily: "Inter_700Bold" },
  topBarSubtitle: { color: "rgba(255,255,255,0.78)", fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 3 },
  topBarIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.17)",
  },
  content: { padding: 16, gap: 16 },
  cameraCard: { borderRadius: 22, borderWidth: 1, padding: 14 },
  cameraHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 13 },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  sectionSubtitle: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 4 },
  livePill: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5 },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  liveText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  cameraFrame: { height: 290, borderRadius: 18, overflow: "hidden", backgroundColor: "#101827", position: "relative" },
  cameraPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 28 },
  cameraPlaceholderIcon: { width: 66, height: 66, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.14)", marginBottom: 14 },
  cameraPlaceholderTitle: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold", textAlign: "center" },
  cameraPlaceholderText: { color: "rgba(255,255,255,0.68)", fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 6 },
  scanOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  scanCornerTopLeft: { position: "absolute", top: "27%", left: "19%", width: 38, height: 38, borderTopWidth: 3, borderLeftWidth: 3, borderColor: "#fff", borderTopLeftRadius: 8 },
  scanCornerTopRight: { position: "absolute", top: "27%", right: "19%", width: 38, height: 38, borderTopWidth: 3, borderRightWidth: 3, borderColor: "#fff", borderTopRightRadius: 8 },
  scanCornerBottomLeft: { position: "absolute", bottom: "27%", left: "19%", width: 38, height: 38, borderBottomWidth: 3, borderLeftWidth: 3, borderColor: "#fff", borderBottomLeftRadius: 8 },
  scanCornerBottomRight: { position: "absolute", bottom: "27%", right: "19%", width: 38, height: 38, borderBottomWidth: 3, borderRightWidth: 3, borderColor: "#fff", borderBottomRightRadius: 8 },
  primaryButton: { minHeight: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, paddingHorizontal: 16, marginTop: 14 },
  primaryButtonText: { color: "#fff", fontSize: 14, fontFamily: "Inter_700Bold" },
  secondaryButton: { minHeight: 45, borderRadius: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, paddingHorizontal: 16, borderWidth: 1, marginTop: 14 },
  secondaryButtonText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  manualSection: { gap: 12 },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  divider: { height: 1, flex: 1 },
  dividerText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  manualRow: { flexDirection: "row", gap: 8 },
  manualInput: { flex: 1, minHeight: 47, borderRadius: 13, borderWidth: 1, paddingHorizontal: 13, fontSize: 13, fontFamily: "Inter_400Regular" },
  manualButton: { width: 48, minHeight: 47, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 13, padding: 12 },
  errorText: { flex: 1, fontSize: 12, lineHeight: 17, fontFamily: "Inter_500Medium" },
  resultModalBackdrop: {
    flex: 1,
    justifyContent: "center",
    padding: 16,
    backgroundColor: "rgba(15,23,42,0.58)",
  },
  resultModalSheet: {
    width: "100%",
    maxHeight: "88%",
    borderRadius: 24,
    overflow: "hidden",
    shadowColor: "#0f172a",
    shadowOpacity: 0.25,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  resultModalContent: { padding: 10 },
  resultCard: { borderRadius: 22, borderWidth: 1, padding: 15 },
  resultHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 6 },
  statusPillText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  studentResult: { flexDirection: "row", alignItems: "center", gap: 11, borderRadius: 15, padding: 12, marginTop: 15 },
  resultAvatar: { width: 42, height: 42, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  resultAvatarText: { color: "#fff", fontSize: 19, fontFamily: "Inter_700Bold" },
  resultStudentName: { fontSize: 15, fontFamily: "Inter_700Bold" },
  resultStudentCode: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginTop: 4 },
  detailGrid: { flexDirection: "row", gap: 10, marginTop: 12 },
  detailCell: { flex: 1, backgroundColor: "rgba(148,163,184,0.08)", borderRadius: 12, padding: 10 },
  detailLabel: { fontSize: 10, fontFamily: "Inter_500Medium" },
  detailValue: { fontSize: 12, fontFamily: "Inter_700Bold", marginTop: 5 },
  attendanceState: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, padding: 11, marginTop: 12 },
  attendanceStateText: { flex: 1, fontSize: 12, lineHeight: 17, fontFamily: "Inter_600SemiBold" },
  scanAnotherButton: { minHeight: 42, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7, marginTop: 8 },
  scanAnotherText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  centerState: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 10 },
  centerTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  centerText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
});