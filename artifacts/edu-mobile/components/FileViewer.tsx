import { Feather } from "@expo/vector-icons";
import { ResizeMode, Video } from "expo-av";
import { File, Paths } from "expo-file-system/next";
import * as FileSystem from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import * as Sharing from "expo-sharing";
import * as WebBrowser from "expo-web-browser";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Image,
  Linking,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Pdf from "react-native-pdf";
import { WebView } from "react-native-webview";

import { useSafeAreaInsets } from "@/hooks/useSafeAreaInsets";
import { useColors } from "@/hooks/useColors";
import { getCenterUrl, getAuthToken } from "@/lib/api";

/** Chuyển URL tương đối (/api/...) thành URL tuyệt đối.
 *  React Native fetch() không có base URL — relative URL sẽ throw ngay lập tức. */
function toAbsoluteUrl(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  const base = getCenterUrl() ?? "";
  return `${base}${url}`;
}

const { width: SW, height: SH } = Dimensions.get("window");

// ─── Types ─────────────────────────────────────────────────────────────────────
export interface FileItem {
  name: string;
  url: string;
  mimetype?: string;
  type?: string;
  size?: number;
}

type FileKind = "image" | "video" | "audio" | "pdf" | "doc" | "other";

function detectKind(file: FileItem): FileKind {
  const m = (file.mimetype || file.type || "").toLowerCase();
  const ext = (file.url || "").toLowerCase().split("?")[0].split(".").pop() || "";
  let kind: FileKind = "other";
  if (m.startsWith("image") || ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"].includes(ext)) kind = "image";
  else if (m.startsWith("video") || ["mp4", "mov", "avi", "webm", "mkv", "m4v"].includes(ext)) kind = "video";
  else if (m.startsWith("audio") || ["mp3", "wav", "m4a", "aac", "ogg", "flac"].includes(ext)) kind = "audio";
  else if (m.includes("pdf") || ext === "pdf") kind = "pdf";
  else if (m.includes("word") || m.includes("excel") || m.includes("powerpoint") || ["doc", "docx", "xls", "xlsx", "ppt", "pptx"].includes(ext)) kind = "doc";
  console.log(`[FileViewer] detectKind: name="${file.name}" ext="${ext}" mime="${m}" → kind="${kind}"`);
  return kind;
}

function fileIcon(kind: FileKind): { icon: string; color: string; bg: string } {
  switch (kind) {
    case "pdf":   return { icon: "file-text",  color: "#ef4444", bg: "#fef2f2" };
    case "doc":   return { icon: "file",        color: "#2563eb", bg: "#eff6ff" };
    case "audio": return { icon: "music",       color: "#8b5cf6", bg: "#f5f3ff" };
    case "video": return { icon: "film",        color: "#059669", bg: "#ecfdf5" };
    default:      return { icon: "paperclip",   color: "#6b7280", bg: "#f3f4f6" };
  }
}

// ─── Shared Modal Header ───────────────────────────────────────────────────────
function ModalHeader({
  name,
  onClose,
  rightSlot,
  paddingTop,
}: {
  name: string;
  onClose: () => void;
  rightSlot?: React.ReactNode;
  paddingTop: number;
}) {
  return (
    <View style={[dv.header, { paddingTop }]}>
      <TouchableOpacity onPress={onClose} style={dv.headerBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Feather name="x" size={20} color="#111" />
      </TouchableOpacity>
      <Text style={dv.headerTitle} numberOfLines={1}>{name}</Text>
      {rightSlot ?? (
        <TouchableOpacity
          onPress={() => Linking.openURL(name)}
          style={dv.headerBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Feather name="external-link" size={18} color="#111" />
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Error View ────────────────────────────────────────────────────────────────
function ErrorView({ url, onClose, detail }: { url: string; onClose: () => void; detail?: string }) {
  return (
    <View style={dv.errorBox}>
      <Feather name="alert-circle" size={36} color="#ef4444" />
      <Text style={dv.errorText}>Không thể tải xem trước</Text>
      {!!detail && (
        <Text style={dv.errorDetailText} selectable>{detail}</Text>
      )}
      <TouchableOpacity
        style={dv.openBtn}
        onPress={async () => {
          await WebBrowser.openBrowserAsync(url, {
            presentationStyle: Platform.OS === "ios"
              ? WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET
              : undefined,
          });
          onClose();
        }}
      >
        <Text style={dv.openBtnText}>Mở trình duyệt</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── PDF Viewer Modal ──────────────────────────────────────────────────────────
// Luồng mới — download-to-cache:
//   1. fetch(url) → lưu file vào Paths.cache  — fetch() JS xử lý auth/redirect/SSL đúng
//   2. react-native-pdf source={{ uri: "file://..." }}  — mở file local, không bao giờ fail vì mạng
//   3. WebView + Google Docs Viewer  — fallback nếu download thất bại
//   4. ErrorView  — fallback cuối cùng
//
// Lợi ích so với cách cũ (react-native-pdf trỏ thẳng vào URL mạng):
//   ✅  Xử lý S3 redirect, Bearer token, SSL tùy chỉnh — fetch() JS làm tốt hơn HTTP client native
//   ✅  Lần 2 mở cùng file: instant (đọc từ cache, không download lại)
//   ✅  Không còn "lúc nhanh lúc chậm" — chỉ có 1 spinner rõ ràng khi tải lần đầu
function PdfViewerModal({ file, onClose }: { file: FileItem; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [stage, setStage] = useState<"downloading" | "native" | "webview" | "error">("downloading");
  const [webViewReady, setWebViewReady] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [localUri, setLocalUri] = useState("");
  const [errorDetail, setErrorDetail] = useState("");
  const mountedRef = useRef(true);

  const absolutePdfUrl = toAbsoluteUrl(file.url);
  const googleViewerUrl = `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(absolutePdfUrl)}`;

  useEffect(() => {
    mountedRef.current = true;
    void downloadAndCache();
    return () => { mountedRef.current = false; };
  }, []);

  async function downloadAndCache() {
    try {
      // Tên file an toàn (ASCII, không ký tự đặc biệt)
      const safeName = file.name
        .replace(/[^\x20-\x7E]/g, "_")
        .replace(/[/\\:*?"<>|]/g, "_")
        .replace(/\s+/g, "_");
      const cacheFilename = safeName.toLowerCase().endsWith(".pdf") ? safeName : `${safeName}.pdf`;
      const localFile = new File(Paths.cache, cacheFilename);

      // Cache hit → mở ngay, không cần download
      if (localFile.exists) {
        console.log(`[FileViewer] PDF cache hit → "${localFile.uri}"`);
        if (mountedRef.current) { setLocalUri(localFile.uri); setStage("native"); }
        return;
      }

      // Download — fetch() JS xử lý đúng auth/redirect/SSL
      const token = getAuthToken();
      const isInternal = !file.url.startsWith("http://") && !file.url.startsWith("https://");
      const headers: Record<string, string> = {};
      if (token && isInternal) headers["Authorization"] = `Bearer ${token}`;

      console.log(`[FileViewer] PDF download: "${absolutePdfUrl}" isInternal=${isInternal}`);
      const res = await fetch(absolutePdfUrl, { headers });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} khi tải PDF.\nURL: ${absolutePdfUrl}\nBody: ${body.slice(0, 200)}`);
      }

      const ab = await res.arrayBuffer();
      if (ab.byteLength === 0) throw new Error("File PDF trống (0 bytes).");

      localFile.write(new Uint8Array(ab));
      console.log(`[FileViewer] PDF download xong — ${ab.byteLength} bytes → "${localFile.uri}"`);

      if (mountedRef.current) { setLocalUri(localFile.uri); setStage("native"); }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[FileViewer] PDF download thất bại → fallback Google Docs. err=`, err);
      if (mountedRef.current) { setErrorDetail(msg); setStage("webview"); }
    }
  }

  return (
    <Modal visible animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "#fff" }}>
        <ModalHeader
          name={file.name}
          onClose={onClose}
          paddingTop={insets.top + 8}
          rightSlot={
            total > 0 && stage === "native" ? (
              <View style={dv.pageChip}>
                <Text style={dv.pageChipText}>{page} / {total}</Text>
              </View>
            ) : (
              <View style={dv.headerBtn} />
            )
          }
        />

        {/* Tầng 1a: đang download */}
        {stage === "downloading" && (
          <View style={dv.loadingOverlay}>
            <ActivityIndicator size="large" color="#6366f1" />
            <Text style={dv.loadingText}>Đang tải PDF…</Text>
          </View>
        )}

        {/* Tầng 1b: mở file local — luôn ổn định vì không qua mạng */}
        {stage === "native" && localUri !== "" && (
          <Pdf
            source={{ uri: localUri, cache: false }}
            style={{ flex: 1, width: "100%" as any }}
            onLoadComplete={(n) => { console.log(`[FileViewer] PDF native OK: ${n} trang`); setTotal(n); }}
            onPageChanged={(p) => setPage(p)}
            onError={(err) => {
              const msg = err instanceof Error ? err.message : JSON.stringify(err);
              console.warn(`[FileViewer] PDF native lỗi → fallback Google Docs. err=`, err);
              setErrorDetail(prev => `${prev ? prev + "\n" : ""}PDF engine: ${msg}`);
              setStage("webview");
            }}
            enablePaging={false}
          />
        )}

        {/* Tầng 2: Google Docs Viewer — chỉ dùng khi download thất bại */}
        {stage === "webview" && (
          <>
            {!webViewReady && (
              <View style={dv.loadingOverlay}>
                <ActivityIndicator size="large" color="#6366f1" />
                <Text style={dv.loadingText}>Đang tải qua Google Docs…</Text>
              </View>
            )}
            <WebView
              key={googleViewerUrl}
              source={{ uri: googleViewerUrl }}
              style={{ flex: 1 }}
              onLoadEnd={() => { console.log("[FileViewer] Google Docs WebView onLoadEnd"); setWebViewReady(true); }}
              onError={(e) => {
                const desc = e.nativeEvent.description ?? e.nativeEvent.code ?? "unknown";
                console.warn("[FileViewer] Google Docs WebView onError → stage=error. event=", e.nativeEvent);
                setErrorDetail(prev => `${prev ? prev + "\n" : ""}Google Docs: ${desc}`);
                setStage("error");
              }}
              onHttpError={(e) => {
                if (e.nativeEvent.statusCode >= 400) {
                  console.warn(`[FileViewer] Google Docs WebView HTTP ${e.nativeEvent.statusCode}`);
                  setErrorDetail(prev => `${prev ? prev + "\n" : ""}Google Docs: HTTP ${e.nativeEvent.statusCode}`);
                  setStage("error");
                }
              }}
              javaScriptEnabled
              domStorageEnabled
              androidLayerType="hardware"
            />
          </>
        )}

        {/* Tầng 3: tất cả fallback thất bại */}
        {stage === "error" && (
          <ErrorView url={absolutePdfUrl} onClose={onClose} detail={errorDetail} />
        )}
      </View>
    </Modal>
  );
}

// ─── MIME map cho từng extension ──────────────────────────────────────────────
const MIME: Record<string, string> = {
  pdf:  "application/pdf",
  doc:  "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls:  "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt:  "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

// ─── Mở file bằng app có sẵn trên máy (Facebook-style) ───────────────────────
// Luồng:
//   1. fetch(url) → ArrayBuffer  (tránh các quirk của File.downloadFileAsync)
//   2. Ghi vào Paths.cache bằng File.write(Uint8Array)
//   3. Android: FileSystem.getContentUriAsync → content:// URI → ACTION_VIEW + MIME type chính xác
//      iOS:     Sharing.shareAsync → UIActivityViewController
async function openWithNativeApp(
  file: FileItem,
  onDone: (err?: string, detail?: string) => void,
) {
  // ⚠️  file.url có thể là đường dẫn tương đối (/api/storage/objects/...)
  //     React Native fetch() không có base URL — PHẢI chuyển sang URL tuyệt đối.
  const absoluteUrl = toAbsoluteUrl(file.url);
  console.log(`[FileViewer] openWithNativeApp START: name="${file.name}" url="${file.url}" → absoluteUrl="${absoluteUrl}"`);
  try {
    const ext = absoluteUrl.toLowerCase().split("?")[0].split(".").pop() || "bin";
    const mimeType = MIME[ext] ?? "application/octet-stream";
    console.log(`[FileViewer] openWithNativeApp: ext="${ext}" mimeType="${mimeType}"`);

    // Tên gốc để hiển thị trong dialogTitle
    const displayName = file.name.includes(".")
      ? file.name
      : `${file.name}.${ext}`;

    // Tên an toàn cho đường dẫn local (chỉ giữ ASCII printable, không có ký tự đặc biệt)
    const safeFilename = displayName
      .replace(/[^\x20-\x7E]/g, "_")      // thay ký tự non-ASCII (tiếng Việt, emoji…)
      .replace(/[/\\:*?"<>|]/g, "_")       // thay ký tự không hợp lệ trên FS
      .replace(/\s+/g, "_");               // thay khoảng trắng

    console.log(`[FileViewer] openWithNativeApp: displayName="${displayName}" safeFilename="${safeFilename}"`);

    const localFile = new File(Paths.cache, safeFilename);
    console.log(`[FileViewer] openWithNativeApp: localFile.uri="${localFile.uri}" exists=${localFile.exists}`);

    // Nếu chưa cache thì tải về; dùng fetch với URL tuyệt đối.
    // ⚠️  Chỉ gửi Bearer cho URL nội bộ (relative gốc như /api/storage/...).
    //     URL external (S3, CDN…) không chấp nhận Bearer → HTTP 400 InvalidArgument.
    if (!localFile.exists) {
      const token = getAuthToken();
      const fetchHeaders: Record<string, string> = {};
      const isInternalUrl = !file.url.startsWith("http://") && !file.url.startsWith("https://");
      if (token && isInternalUrl) fetchHeaders["Authorization"] = `Bearer ${token}`;
      console.log(`[FileViewer] openWithNativeApp: bắt đầu fetch absoluteUrl hasToken=${!!token}`);
      const response = await fetch(absoluteUrl, { headers: fetchHeaders });
      console.log(`[FileViewer] openWithNativeApp: fetch xong — status=${response.status} ok=${response.ok}`);
      if (!response.ok) {
        // Đọc thêm body để biết server trả về gì (tối đa 300 ký tự)
        let bodySnippet = "";
        try { bodySnippet = (await response.text()).slice(0, 300); } catch { /* ignore */ }
        throw new Error(
          `HTTP ${response.status} khi tải file.\nURL: ${absoluteUrl}\nHasToken: ${!!token}\nBody: ${bodySnippet || "(trống)"}`
        );
      }
      const ab = await response.arrayBuffer();
      console.log(`[FileViewer] openWithNativeApp: arrayBuffer xong — byteLength=${ab.byteLength}`);
      if (ab.byteLength === 0) {
        throw new Error(`File tải về rỗng (0 bytes).\nURL: ${absoluteUrl}\nServer có thể trả HTML lỗi thay vì file thật.`);
      }
      localFile.write(new Uint8Array(ab));
      console.log(`[FileViewer] openWithNativeApp: File.write xong — uri="${localFile.uri}" exists=${localFile.exists}`);
    } else {
      console.log(`[FileViewer] openWithNativeApp: dùng cache đã có`);
    }

    if (Platform.OS === "android") {
      // Android: ACTION_VIEW → chỉ hiện app có thể MỞ file (Drive, WPS, Mi Viewer…)
      // getContentUriAsync chuyển file:// nội bộ → content:// qua FileProvider (bắt buộc từ Android 7+)
      console.log(`[FileViewer] openWithNativeApp (Android): getContentUriAsync uri="${localFile.uri}"`);
      const contentUri = await FileSystem.getContentUriAsync(localFile.uri);
      console.log(`[FileViewer] openWithNativeApp (Android): contentUri="${contentUri}"`);
      await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
        data: contentUri,
        flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
        type: mimeType,
      });
    } else {
      // iOS: UIActivityViewController — hiện "Mở bằng…" / AirDrop / chia sẻ
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        console.warn(`[FileViewer] openWithNativeApp: Sharing KHÔNG khả dụng`);
        onDone("share_unavailable", "Thiết bị không hỗ trợ mở file.");
        return;
      }
      console.log(`[FileViewer] openWithNativeApp (iOS): shareAsync uri="${localFile.uri}"`);
      await Sharing.shareAsync(localFile.uri, {
        mimeType,
        dialogTitle: displayName,
        UTI: mimeType,
      });
    }

    console.log(`[FileViewer] openWithNativeApp: hoàn thành`);
    onDone();
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`[FileViewer] openWithNativeApp CATCH:`, err);
    onDone("error", detail);
  }
}

// ─── Office Online Viewer Modal (WebView) ─────────────────────────────────────
function OfficeViewerModal({ file, onClose }: { file: FileItem; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [errorDetail, setErrorDetail] = useState<string>("");
  // Dùng timestamp để tránh WebView cache trang Office Online → docx trắng lần sau
  const [webViewKey] = useState(() => `office-${Date.now()}`);
  // ⚠️ file.url có thể là relative URL — Office Online Viewer cần URL tuyệt đối và công khai
  const absoluteFileUrl = toAbsoluteUrl(file.url);
  const viewerUrl = `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(absoluteFileUrl)}`;

  return (
    <Modal visible animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "#fff" }}>
        <ModalHeader
          name={file.name}
          onClose={onClose}
          paddingTop={insets.top + 8}
          rightSlot={
            <TouchableOpacity
              onPress={() => Linking.openURL(absoluteFileUrl)}
              style={dv.headerBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Feather name="external-link" size={18} color="#111" />
            </TouchableOpacity>
          }
        />
        {loading && !error && (
          <View style={dv.loadingOverlay}>
            <ActivityIndicator size="large" color="#6366f1" />
            <Text style={dv.loadingText}>Đang tải…</Text>
          </View>
        )}
        {error ? (
          <ErrorView url={absoluteFileUrl} onClose={onClose} detail={errorDetail} />
        ) : (
          <WebView
            key={webViewKey}
            source={{ uri: viewerUrl }}
            style={{ flex: 1 }}
            cacheEnabled={false}
            onLoadStart={() => console.log(`[FileViewer] OfficeViewer WebView bắt đầu tải: ${viewerUrl}`)}
            onLoadEnd={() => { console.log("[FileViewer] OfficeViewer WebView onLoadEnd OK"); setLoading(false); }}
            onError={(e) => {
              const desc = e.nativeEvent.description ?? e.nativeEvent.code ?? "unknown";
              console.warn("[FileViewer] OfficeViewer WebView onError:", e.nativeEvent);
              setErrorDetail(`Office Viewer lỗi: ${desc}\nFile URL: ${absoluteFileUrl}`);
              setLoading(false);
              setError(true);
            }}
            onHttpError={(e) => {
              console.warn(`[FileViewer] OfficeViewer WebView HTTP ${e.nativeEvent.statusCode}`);
              if (e.nativeEvent.statusCode >= 400) {
                setErrorDetail(`Office Viewer: HTTP ${e.nativeEvent.statusCode}\nFile URL: ${absoluteFileUrl}`);
                setLoading(false);
                setError(true);
              }
            }}
            javaScriptEnabled
            domStorageEnabled
            androidLayerType="hardware"
          />
        )}
      </View>
    </Modal>
  );
}

// ─── Doc Action Sheet — bottom sheet 2 lựa chọn ───────────────────────────────
// "Mở bằng ứng dụng" → download cache + shareAsync (OS dialog chọn app)
// "Xem trực tiếp"    → gọi onOpenOffice() để DocViewerModal mở OfficeViewerModal ở tầng trên
//
// ⚠️  KHÔNG render OfficeViewerModal bên trong modal này.
//     Hai Modal chồng nhau trên Android khiến OS gửi onRequestClose cho modal bên dưới
//     → sheet tự đóng ngay sau khi Office viewer mở. Giải pháp: chuyển việc render
//     OfficeViewerModal lên DocViewerModal (tầng cha) qua callback onOpenOffice.
function DocActionSheet({
  file,
  onClose,
  onOpenOffice,
}: {
  file: FileItem;
  onClose: () => void;
  onOpenOffice: () => void;
}) {
  const insets = useSafeAreaInsets();
  const slideY = useRef(new Animated.Value(300)).current;
  const [openingWithApp, setOpeningWithApp] = useState(false);

  // Slide-up animation khi mount
  useEffect(() => {
    Animated.spring(slideY, {
      toValue: 0,
      useNativeDriver: true,
      bounciness: 4,
    }).start();
  }, []);

  function dismiss() {
    Animated.timing(slideY, {
      toValue: 300,
      duration: 220,
      useNativeDriver: true,
    }).start(onClose);
  }

  async function handleOpenWithApp() {
    console.log(`[FileViewer] DocActionSheet: người dùng chọn "Mở bằng ứng dụng" — name="${file.name}"`);
    setOpeningWithApp(true);
    await openWithNativeApp(file, (err, detail) => {
      setOpeningWithApp(false);
      if (err === "share_unavailable" || err === "error") {
        console.warn(`[FileViewer] DocActionSheet: openWithNativeApp callback err="${err}" detail="${detail}"`);
        Alert.alert(
          "Không mở được",
          err === "share_unavailable"
            ? `Thiết bị không có ứng dụng phù hợp. Hãy thử "Xem trực tiếp".\n\n${detail ?? ""}`
            : `Không tải được file.\n\n${detail ?? "Lỗi không xác định"}`,
          [{ text: "OK" }],
        );
      } else {
        console.log(`[FileViewer] DocActionSheet: openWithNativeApp thành công, đóng sheet`);
        dismiss();
      }
    });
  }

  function handleOpenOffice() {
    console.log(`[FileViewer] DocActionSheet: người dùng chọn "Xem trực tiếp" — name="${file.name}"`);
    // Đóng sheet trước, rồi DocViewerModal sẽ mở OfficeViewerModal (tránh 2 modal chồng nhau)
    Animated.timing(slideY, {
      toValue: 300,
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      onOpenOffice();
    });
  }

  const ext = file.url.toLowerCase().split("?")[0].split(".").pop()?.toUpperCase() ?? "FILE";

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={dismiss}
    >
      {/* Overlay mờ — tap để đóng */}
      <TouchableOpacity
        style={bs.overlay}
        activeOpacity={1}
        onPress={dismiss}
      />

      {/* Bottom sheet */}
      <Animated.View
        style={[bs.sheet, { paddingBottom: insets.bottom + 16, transform: [{ translateY: slideY }] }]}
      >
        {/* File info */}
        <View style={bs.fileRow}>
          <View style={[bs.fileIcon, { backgroundColor: "#eff6ff" }]}>
            <Feather name="file" size={20} color="#2563eb" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={bs.fileName} numberOfLines={1}>{file.name}</Text>
            <Text style={bs.fileExt}>{ext}</Text>
          </View>
        </View>

        <View style={bs.divider} />

        {/* Lựa chọn 1: Mở bằng ứng dụng */}
        <TouchableOpacity
          style={bs.option}
          activeOpacity={0.7}
          onPress={handleOpenWithApp}
          disabled={openingWithApp}
        >
          <View style={[bs.optionIcon, { backgroundColor: "#f0fdf4" }]}>
            {openingWithApp ? (
              <ActivityIndicator size="small" color="#16a34a" />
            ) : (
              <Feather name="smartphone" size={18} color="#16a34a" />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={bs.optionTitle}>Mở bằng ứng dụng</Text>
            <Text style={bs.optionSub}>Excel, WPS, Google Sheets…</Text>
          </View>
          <Feather name="chevron-right" size={16} color="#9ca3af" />
        </TouchableOpacity>

        {/* Lựa chọn 2: Xem trực tiếp */}
        <TouchableOpacity
          style={bs.option}
          activeOpacity={0.7}
          onPress={handleOpenOffice}
        >
          <View style={[bs.optionIcon, { backgroundColor: "#eff6ff" }]}>
            <Feather name="eye" size={18} color="#2563eb" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={bs.optionTitle}>Xem trực tiếp</Text>
            <Text style={bs.optionSub}>Xem trong app, không cần cài thêm</Text>
          </View>
          <Feather name="chevron-right" size={16} color="#9ca3af" />
        </TouchableOpacity>

        {/* Huỷ */}
        <TouchableOpacity style={bs.cancel} onPress={dismiss} activeOpacity={0.7}>
          <Text style={bs.cancelText}>Huỷ</Text>
        </TouchableOpacity>
      </Animated.View>
    </Modal>
  );
}

// ─── Video Viewer Modal ────────────────────────────────────────────────────────
function VideoViewerModal({ file, onClose }: { file: FileItem; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const absoluteUrl = toAbsoluteUrl(file.url);
  return (
    <Modal visible animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        <ModalHeader
          name={file.name}
          onClose={onClose}
          paddingTop={insets.top + 8}
        />
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <Video
            source={{ uri: absoluteUrl }}
            useNativeControls
            resizeMode={ResizeMode.CONTAIN}
            style={{ width: "100%", height: 300 }}
            shouldPlay={false}
          />
        </View>
      </View>
    </Modal>
  );
}

// ─── DocViewerModal (exported — dùng bởi các màn hình khác) ───────────────────
// image → ImageFullscreen
// video → VideoViewerModal (inline player)
// audio / other → mở trình duyệt
// pdf  → PdfViewerModal (react-native-pdf, inline)
// doc  → DocActionSheet (bottom sheet) → nếu user chọn "Xem trực tiếp" → OfficeViewerModal
//
// OfficeViewerModal được render TẠI ĐÂY (không trong DocActionSheet) để tránh 2 modal chồng nhau.
export function DocViewerModal({ file, onClose }: { file: FileItem; onClose: () => void }) {
  const [showOffice, setShowOffice] = useState(false);
  const kind = detectKind(file);
  const absoluteUrl = toAbsoluteUrl(file.url);

  if (showOffice) {
    return (
      <OfficeViewerModal
        file={file}
        onClose={() => { setShowOffice(false); onClose(); }}
      />
    );
  }
  if (kind === "image") {
    return <ImageFullscreen url={absoluteUrl} name={file.name} onClose={onClose} />;
  }
  if (kind === "video") {
    return <VideoViewerModal file={file} onClose={onClose} />;
  }
  if (kind === "audio" || kind === "other") {
    // Open in system browser — same as FileViewer fallback
    WebBrowser.openBrowserAsync(absoluteUrl, {
      presentationStyle: Platform.OS === "ios"
        ? WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET
        : undefined,
    }).finally(onClose);
    return null;
  }
  if (kind === "pdf") {
    return <PdfViewerModal file={file} onClose={onClose} />;
  }
  return (
    <DocActionSheet
      file={file}
      onClose={onClose}
      onOpenOffice={() => setShowOffice(true)}
    />
  );
}

// ─── Image Fullscreen ──────────────────────────────────────────────────────────
function ImageFullscreen({ url, name, onClose }: { url: string; name: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [loaded, setLoaded] = useState(false);
  return (
    <Modal visible animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={s.fsContainer}>
        {!loaded && (
          <ActivityIndicator size="large" color="#fff" style={StyleSheet.absoluteFill} />
        )}
        <Image
          source={{ uri: url }}
          style={s.fsImage}
          resizeMode="contain"
          onLoad={() => setLoaded(true)}
        />
        <View style={[s.fsTop, { paddingTop: insets.top + 8 }]}>
          <Text style={s.fsName} numberOfLines={1}>{name}</Text>
          <TouchableOpacity onPress={onClose} style={s.fsClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Feather name="x" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={s.fsTapZone} onPress={onClose} activeOpacity={1} />
      </View>
    </Modal>
  );
}

// ─── FileViewer ────────────────────────────────────────────────────────────────
interface FileViewerProps {
  file: FileItem;
  imageSize?: number;
}

export function FileViewer({ file, imageSize = 88 }: FileViewerProps) {
  const colors = useColors();
  const [fsOpen, setFsOpen] = useState(false);
  const [docOpen, setDocOpen] = useState(false);
  const kind = detectKind(file);
  const { icon, color, bg } = fileIcon(kind);

  // ── IMAGE ──
  if (kind === "image") {
    return (
      <>
        <TouchableOpacity onPress={() => setFsOpen(true)} activeOpacity={0.85}>
          <Image
            source={{ uri: file.url }}
            style={{ width: imageSize, height: imageSize, borderRadius: 10, backgroundColor: "#f3f4f6" }}
            resizeMode="cover"
          />
        </TouchableOpacity>
        {fsOpen && (
          <ImageFullscreen url={file.url} name={file.name} onClose={() => setFsOpen(false)} />
        )}
      </>
    );
  }

  // ── VIDEO ──
  if (kind === "video") {
    return (
      <View style={[s.videoWrap, { backgroundColor: "#000", borderRadius: 12, overflow: "hidden" }]}>
        <Video
          source={{ uri: file.url }}
          useNativeControls
          resizeMode={ResizeMode.CONTAIN}
          style={{ width: "100%", height: 210 }}
          shouldPlay={false}
        />
        <View style={s.videoBadge}>
          <Feather name="film" size={11} color="#fff" />
          <Text style={s.videoBadgeText}>{file.name}</Text>
        </View>
      </View>
    );
  }

  // ── PDF / DOC: mở inline viewer modal ──
  if (kind === "pdf" || kind === "doc") {
    return (
      <>
        {docOpen && <DocViewerModal file={file} onClose={() => setDocOpen(false)} />}
        <TouchableOpacity
          onPress={() => setDocOpen(true)}
          activeOpacity={0.75}
          style={[s.pill, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <View style={[s.pillIcon, { backgroundColor: bg }]}>
            <Feather name={icon as any} size={16} color={color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.pillName, { color: colors.foreground }]} numberOfLines={1}>
              {file.name}
            </Text>
            <Text style={[s.pillSub, { color: colors.mutedForeground }]}>
              {kind === "pdf" ? "Xem PDF" : "Xem file"}
            </Text>
          </View>
          <Feather name="maximize-2" size={14} color={colors.mutedForeground} />
        </TouchableOpacity>
      </>
    );
  }

  // ── AUDIO / OTHER: mở trình duyệt ──
  return (
    <TouchableOpacity
      onPress={() =>
        WebBrowser.openBrowserAsync(file.url, {
          presentationStyle: Platform.OS === "ios"
            ? WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET
            : undefined,
        })
      }
      activeOpacity={0.75}
      style={[s.pill, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      <View style={[s.pillIcon, { backgroundColor: bg }]}>
        <Feather name={icon as any} size={16} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.pillName, { color: colors.foreground }]} numberOfLines={1}>
          {file.name}
        </Text>
        <Text style={[s.pillSub, { color: colors.mutedForeground }]}>
          {kind === "audio" ? "Nhấn để nghe" : "Mở file"}
        </Text>
      </View>
      <Feather name="external-link" size={14} color={colors.mutedForeground} />
    </TouchableOpacity>
  );
}

// ─── FileAttachmentChip ───────────────────────────────────────────────────────
export function FileAttachmentChip({ file, onPress }: { file: FileItem; onPress?: () => void }) {
  const colors = useColors();
  const kind = detectKind(file);
  const { icon, color, bg } = fileIcon(kind);
  const [docOpen, setDocOpen] = useState(false);

  const handlePress = onPress ?? (() => setDocOpen(true));

  return (
    <>
      {docOpen && <DocViewerModal file={file} onClose={() => setDocOpen(false)} />}
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.75}
        style={[s.chip, { backgroundColor: colors.card, borderColor: colors.border }]}
      >
        <View style={[s.chipIcon, { backgroundColor: bg }]}>
          <Feather name={icon as any} size={13} color={color} />
        </View>
        <Text style={[s.chipName, { color: colors.foreground }]} numberOfLines={1}>
          {file.name}
        </Text>
        <Feather name="chevron-right" size={12} color={colors.mutedForeground} />
      </TouchableOpacity>
    </>
  );
}

// ─── FileList ─────────────────────────────────────────────────────────────────
export function FileList({ files, imageSize }: { files: FileItem[]; imageSize?: number }) {
  const images = files.filter((f) => detectKind(f) === "image");
  const others = files.filter((f) => detectKind(f) !== "image");

  return (
    <View style={{ gap: 8 }}>
      {images.length > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {images.map((f, i) => (
            <FileViewer key={i} file={f} imageSize={imageSize} />
          ))}
        </View>
      )}
      {others.map((f, i) => (
        <FileViewer key={i} file={f} imageSize={imageSize} />
      ))}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const dv = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    backgroundColor: "#fff",
    gap: 10,
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  headerTitle: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#111827",
  },
  pageChip: {
    backgroundColor: "#f3f4f6",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    flexShrink: 0,
  },
  pageChipText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: "#374151",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: { fontSize: 13, color: "#6b7280", fontFamily: "Inter_400Regular" },
  errorBox: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, padding: 32 },
  errorText: { fontSize: 14, color: "#374151", textAlign: "center", fontFamily: "Inter_400Regular" },
  errorDetailText: {
    fontSize: 11,
    color: "#6b7280",
    fontFamily: "Inter_400Regular",
    textAlign: "left",
    backgroundColor: "#f3f4f6",
    borderRadius: 8,
    padding: 10,
    width: "100%",
    lineHeight: 16,
  },
  openBtn: { backgroundColor: "#6366f1", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  openBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
});

const s = StyleSheet.create({
  fsContainer: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  fsImage: {
    width: SW,
    height: SH * 0.8,
  },
  fsTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  fsName: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "rgba(255,255,255,0.85)",
    marginRight: 10,
  },
  fsClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  fsTapZone: {
    ...StyleSheet.absoluteFillObject,
    zIndex: -1,
  },
  videoWrap: {
    position: "relative",
  },
  videoBadge: {
    position: "absolute",
    bottom: 8,
    left: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  videoBadgeText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: "#fff",
    maxWidth: 180,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  pillIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  pillName: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    lineHeight: 18,
  },
  pillSub: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
    alignSelf: "flex-start",
  },
  chipIcon: {
    width: 26,
    height: 26,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  chipName: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    maxWidth: 180,
  },
});

// ─── Bottom sheet styles ───────────────────────────────────────────────────────
const bs = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 16,
    paddingHorizontal: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 16,
  },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 4,
    paddingBottom: 14,
  },
  fileIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  fileName: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#111827",
  },
  fileExt: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "#6b7280",
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: "#f3f4f6",
    marginBottom: 8,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  optionIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  optionTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#111827",
  },
  optionSub: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "#6b7280",
    marginTop: 2,
  },
  cancel: {
    alignItems: "center",
    paddingVertical: 14,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
  },
  cancelText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: "#6b7280",
  },
});
