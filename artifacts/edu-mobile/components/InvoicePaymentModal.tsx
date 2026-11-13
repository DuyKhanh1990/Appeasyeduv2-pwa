import { Feather } from "@expo/vector-icons";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

import { useColors } from "@/hooks/useColors";
import { apiGet } from "@/lib/api";

export interface InvoicePaymentItem {
  id: string;
  invoiceId: string;
  title: string;
  code: string;
  amount: string | number;
  description: string | null;
  isSchedule: boolean;
  locationId?: string | null;
  canShowPaymentQr?: boolean;
  isBidvQrEnabled?: boolean;
  student?: { id: string; name: string; code: string } | null;
}

interface BankAccount {
  bankName?: string;
  bankAccount?: string;
  accountHolder?: string;
}

interface LocationPaymentConfig {
  id: string;
  paymentQrUrl?: string | null;
  bankAccounts?: string | null;
}

interface BidvVirtualAccount {
  vaCode?: string;
  accountName?: string;
  isEnabled?: boolean;
}

function unwrapLocations(response: unknown): LocationPaymentConfig[] {
  if (Array.isArray(response)) return response as LocationPaymentConfig[];
  if (response && typeof response === "object") {
    const object = response as { locations?: unknown; data?: unknown };
    if (Array.isArray(object.locations)) return object.locations as LocationPaymentConfig[];
    if (Array.isArray(object.data)) return object.data as LocationPaymentConfig[];
  }
  return [];
}

function parseBankAccounts(value?: string | null): BankAccount[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed as BankAccount[] : [];
  } catch {
    return [];
  }
}

function getBankCode(bankName: string): string {
  const normalized = bankName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .trim();

  const knownBanks: Record<string, string> = {
    vietcombank: "VCB",
    "ngan hang tmcp ngoai thuong viet nam": "VCB",
    techcombank: "TCB",
    "ngan hang tmcp ky thuong viet nam": "TCB",
    bidv: "BIDV",
    "ngan hang tmcp dau tu va phat trien viet nam": "BIDV",
    vietinbank: "ICB",
    "vietin bank": "ICB",
    "ngan hang tmcp cong thuong viet nam": "ICB",
  };
  if (knownBanks[normalized]) return knownBanks[normalized];
  if (normalized.includes("vietcombank") || normalized.includes("ngoai thuong viet nam")) return "VCB";
  if (normalized.includes("techcombank") || normalized.includes("ky thuong viet nam")) return "TCB";
  if (normalized.includes("bidv") || normalized.includes("dau tu va phat trien viet nam")) return "BIDV";
  if (normalized.includes("vietinbank") || normalized.includes("cong thuong viet nam")) return "ICB";

  return bankName.toUpperCase().replace(/\s+/g, "");
}

function cleanTransferContent(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .replace(/[^a-zA-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

function buildVietQrUrl(
  bankCode: string,
  bankAccount: string,
  amount: string | number,
  addInfo: string,
  accountName: string,
): string {
  const query = new URLSearchParams({
    amount: String(amount),
    addInfo,
    accountName,
  });
  return `https://img.vietqr.io/image/${encodeURIComponent(bankCode)}-${encodeURIComponent(bankAccount)}-compact2.png?${query.toString()}`;
}

function formatAmount(amount: string | number): string {
  const parsed = typeof amount === "number" ? amount : Number.parseFloat(amount);
  return Number.isFinite(parsed) ? `${parsed.toLocaleString("vi-VN")} đ` : `${amount} đ`;
}

export function InvoicePaymentModal({
  invoice,
  visible,
  fallbackStudentName,
  fallbackStudentCode,
  onClose,
}: {
  invoice: InvoicePaymentItem | null;
  visible: boolean;
  fallbackStudentName?: string;
  fallbackStudentCode?: string;
  onClose: () => void;
}) {
  const colors = useColors();
  const [activeTab, setActiveTab] = useState<"transfer" | "bidv">("transfer");
  const [location, setLocation] = useState<LocationPaymentConfig | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [bidv, setBidv] = useState<BidvVirtualAccount | null>(null);
  const [bidvLoading, setBidvLoading] = useState(false);
  const [bidvError, setBidvError] = useState("");
  const [imageError, setImageError] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadMessage, setDownloadMessage] = useState("");
  const [downloadError, setDownloadError] = useState(false);

  useEffect(() => {
    if (!visible || !invoice) return;
    let active = true;
    setActiveTab("transfer");
    setLocation(null);
    setLocationError("");
    setLocationLoading(true);
    setBidv(null);
    setBidvError("");
    setImageError(false);
    setDownloadMessage("");
    setDownloadError(false);

    apiGet<unknown>("/api/locations")
      .then((response) => {
        if (!active) return;
        const match = unwrapLocations(response).find((item) => item.id === invoice.locationId);
        if (match) setLocation(match);
        else setLocationError("Không lấy được cấu hình thanh toán của cơ sở này.");
      })
      .catch(() => {
        if (active) setLocationError("Tài khoản chưa lấy được cấu hình cơ sở để tạo QR chuyển khoản.");
      })
      .finally(() => {
        if (active) setLocationLoading(false);
      });

    return () => {
      active = false;
    };
  }, [visible, invoice?.id, invoice?.locationId]);

  useEffect(() => {
    setImageError(false);
    setDownloadMessage("");
    setDownloadError(false);
  }, [activeTab]);

  useEffect(() => {
    if (!visible || !invoice || activeTab !== "bidv" || invoice.isBidvQrEnabled !== true) return;
    let active = true;
    setBidv(null);
    setBidvError("");
    setBidvLoading(true);
    const parameter = invoice.isSchedule
      ? `scheduleId=${encodeURIComponent(invoice.id)}`
      : `invoiceId=${encodeURIComponent(invoice.invoiceId)}`;

    apiGet<BidvVirtualAccount>(`/api/bidv/virtual-account?${parameter}`)
      .then((response) => {
        if (!active) return;
        setBidv(response);
        if (response.isEnabled === false || !response.vaCode) {
          setBidvError("Chưa có tài khoản QR BIDV khả dụng cho hóa đơn này.");
        }
      })
      .catch(() => {
        if (active) setBidvError("Không thể tải thông tin QR BIDV.");
      })
      .finally(() => {
        if (active) setBidvLoading(false);
      });

    return () => {
      active = false;
    };
  }, [activeTab, invoice, visible]);

  const normalQrUrl = useMemo(() => {
    if (!invoice || !location) return "";
    if (location.paymentQrUrl?.trim()) return location.paymentQrUrl.trim();
    const account = parseBankAccounts(location.bankAccounts)[0];
    if (!account?.bankName || !account.bankAccount || !account.accountHolder) return "";
    const studentName = invoice.student?.name || fallbackStudentName || "";
    const studentCode = invoice.student?.code || fallbackStudentCode || "";
    const content = invoice.description
      ? [studentName, studentCode, invoice.description]
      : ["chuyen khoan tien hoa don", invoice.code];
    return buildVietQrUrl(
      getBankCode(account.bankName),
      account.bankAccount,
      invoice.amount,
      cleanTransferContent(content.filter(Boolean).join(" ")),
      account.accountHolder,
    );
  }, [fallbackStudentCode, fallbackStudentName, invoice, location]);

  const bidvQrUrl = useMemo(() => {
    if (!invoice || !bidv?.vaCode || bidv.isEnabled === false) return "";
    return buildVietQrUrl(
      "BIDV",
      bidv.vaCode,
      invoice.amount,
      cleanTransferContent(`${bidv.vaCode} ${invoice.code}`),
      bidv.accountName || "",
    );
  }, [bidv, invoice]);

  const downloadQr = async () => {
    if (!qrUrl || !invoice) return;
    setDownloading(true);
    setDownloadMessage("");
    setDownloadError(false);
    const suffix = isBidvTab ? "bidv" : "chuyen-khoan";
    const safeCode = invoice.code.replace(/[^a-zA-Z0-9-_]/g, "-") || invoice.id;
    const fileNameBase = `EasyEdu-QR-${safeCode}-${suffix}`;

    try {
      if (Platform.OS === "web") {
        let blob: Blob;
        try {
          const response = await fetch(qrUrl);
          if (!response.ok) throw new Error("Không tải được ảnh QR từ máy chủ.");
          blob = await response.blob();
        } catch {
          setDownloadError(true);
          setDownloadMessage("Trình duyệt không cho tải ảnh trực tiếp. Nhấn giữ mã QR đang hiển thị để lưu vào điện thoại.");
          return;
        }
        const mimeType = blob.type || "image/png";
        const extension = mimeType.includes("svg") ? "svg" : "png";
        const fileName = `${fileNameBase}.${extension}`;
        const file = new File([blob], fileName, { type: blob.type || "image/png" });
        const browserNavigator = window.navigator as Navigator & {
          canShare?: (data: ShareData) => boolean;
          share?: (data: ShareData) => Promise<void>;
        };

        if (browserNavigator.share && browserNavigator.canShare?.({ files: [file] })) {
          await browserNavigator.share({ files: [file], title: "Mã QR thanh toán EasyEdu" });
          setDownloadMessage("Chọn Lưu hình ảnh hoặc Lưu vào Tệp trong bảng chia sẻ.");
        } else {
          const objectUrl = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = objectUrl;
          link.download = fileName;
          document.body.appendChild(link);
          link.click();
          link.remove();
          URL.revokeObjectURL(objectUrl);
          setDownloadMessage("Đã tải mã QR xuống thiết bị.");
        }
      } else {
        const destinationDirectory = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
        if (!destinationDirectory) throw new Error("Thiết bị không có thư mục lưu tệp.");
        const uniqueFileName = `${fileNameBase}-${Date.now()}`;
        const tempFile = `${destinationDirectory}${uniqueFileName}.download`;
        const result = await FileSystem.downloadAsync(qrUrl, tempFile);
        const mimeType = result.headers["content-type"] ?? "image/png";
        const isSvg = mimeType.includes("svg");
        const localFile = `${destinationDirectory}${uniqueFileName}.${isSvg ? "svg" : "png"}`;
        await FileSystem.moveAsync({ from: result.uri, to: localFile });
        if (!(await Sharing.isAvailableAsync())) {
          throw new Error("Thiết bị không hỗ trợ chia sẻ tệp để lưu mã QR.");
        }
        await Sharing.shareAsync(localFile, {
          mimeType,
          dialogTitle: "Lưu mã QR thanh toán",
          UTI: isSvg ? "public.svg-image" : "public.png",
        });
        setDownloadMessage("Chọn Lưu hình ảnh hoặc Lưu vào Tệp trong bảng chia sẻ.");
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setDownloadError(true);
      setDownloadMessage(
        error instanceof Error
          ? `${error.message} Bạn có thể nhấn giữ ảnh QR để lưu.`
          : "Không tải được mã QR. Bạn có thể nhấn giữ ảnh QR để lưu.",
      );
    } finally {
      setDownloading(false);
    }
  };

  if (!invoice) return null;

  const isBidvTab = activeTab === "bidv";
  const loading = isBidvTab ? bidvLoading : locationLoading;
  const error = isBidvTab ? bidvError : locationError;
  const qrUrl = isBidvTab ? bidvQrUrl : normalQrUrl;
  const title = isBidvTab ? "QR BIDV" : "QR chuyển khoản";

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: colors.card }]}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
              <Text style={[styles.subtitle, { color: colors.mutedForeground }]} numberOfLines={2}>
                {invoice.title} · {formatAmount(invoice.amount)}
              </Text>
            </View>
            <TouchableOpacity accessibilityLabel="Đóng QR thanh toán" onPress={onClose} style={styles.closeButton}>
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          {invoice.isBidvQrEnabled === true && (
            <View style={[styles.tabs, { borderColor: colors.border }]}>
              {([
                ["transfer", "Chuyển khoản"],
                ["bidv", "BIDV"],
              ] as const).map(([tab, label]) => {
                const selected = activeTab === tab;
                return (
                  <TouchableOpacity
                    key={tab}
                    testID={`invoice-qr-tab-${tab}`}
                    accessibilityRole="tab"
                    accessibilityState={{ selected }}
                    onPress={() => setActiveTab(tab)}
                    style={[
                      styles.tab,
                      { backgroundColor: selected ? colors.primary : "transparent" },
                    ]}
                  >
                    <Text style={{ color: selected ? "#fff" : colors.mutedForeground, fontSize: 13, fontFamily: "Inter_600SemiBold" }}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          <ScrollView contentContainerStyle={styles.content}>
            {loading ? (
              <ActivityIndicator size="large" color={colors.primary} />
            ) : error ? (
              <Text style={[styles.message, { color: colors.destructive }]}>{error}</Text>
            ) : qrUrl && !imageError ? (
              <>
                <Image
                  source={{ uri: qrUrl }}
                  onError={() => setImageError(true)}
                  resizeMode="contain"
                  accessibilityLabel={title}
                  style={styles.qrImage}
                />
                <TouchableOpacity
                  testID="invoice-qr-download"
                  accessibilityRole="button"
                  accessibilityState={{ disabled: downloading }}
                  disabled={downloading}
                  onPress={downloadQr}
                  style={[styles.downloadButton, { backgroundColor: colors.primary }]}
                >
                  {downloading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Feather name="download" size={17} color="#fff" />
                  )}
                  <Text style={styles.downloadButtonText}>
                    {downloading ? "Đang tải mã QR..." : "Tải mã QR xuống"}
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <Text style={[styles.message, { color: colors.mutedForeground }]}>
                {imageError ? "Không tải được ảnh mã QR." : "Cơ sở chưa có đủ thông tin để tạo mã QR chuyển khoản."}
              </Text>
            )}
            <Text style={[styles.helper, { color: colors.mutedForeground }]}>
              Kiểm tra đúng số tiền và nội dung trước khi xác nhận chuyển khoản.
            </Text>
            {!!downloadMessage && (
              <Text style={[styles.downloadMessage, { color: downloadError ? colors.destructive : colors.success }]}>
                {downloadMessage}
              </Text>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "center",
    padding: 20,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
  },
  sheet: {
    width: "100%",
    maxWidth: 440,
    maxHeight: "90%",
    alignSelf: "center",
    borderRadius: 20,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 14,
  },
  title: { fontSize: 18, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 4 },
  closeButton: { padding: 5 },
  tabs: {
    flexDirection: "row",
    gap: 8,
    marginHorizontal: 18,
    padding: 4,
    borderWidth: 1,
    borderRadius: 12,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 38,
    borderRadius: 9,
  },
  content: { alignItems: "center", padding: 20, gap: 12 },
  qrImage: { width: 280, height: 280, maxWidth: "100%" },
  downloadButton: {
    alignSelf: "stretch",
    minHeight: 46,
    borderRadius: 11,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  downloadButtonText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  message: { textAlign: "center", fontSize: 14, lineHeight: 21, paddingVertical: 28 },
  helper: { textAlign: "center", fontSize: 12, lineHeight: 18 },
  downloadMessage: { textAlign: "center", fontSize: 12, lineHeight: 18 },
});
