import { Feather } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import {
  Image,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { useColors } from "@/hooks/useColors";
import { apiGet } from "@/lib/api";

// ─── Types (shared) ───────────────────────────────────────────────────────────
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
  if (m.startsWith("image") || ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"].includes(ext)) return "image";
  if (m.startsWith("video") || ["mp4", "mov", "avi", "webm", "mkv", "m4v"].includes(ext)) return "video";
  if (m.startsWith("audio") || ["mp3", "wav", "m4a", "aac", "ogg", "flac"].includes(ext)) return "audio";
  if (m.includes("pdf") || ext === "pdf") return "pdf";
  if (m.includes("word") || m.includes("excel") || m.includes("powerpoint") || ["doc", "docx", "xls", "xlsx", "ppt", "pptx"].includes(ext)) return "doc";
  return "other";
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

// ─── Detect Word doc (.doc / .docx) ───────────────────────────────────────────
function isWordDoc(file: FileItem): boolean {
  const ext = (file.url || "").toLowerCase().split("?")[0].split(".").pop() || "";
  const m = (file.mimetype || file.type || "").toLowerCase();
  return ["doc", "docx"].includes(ext) || m.includes("word");
}

// Basic CSS injected around mammoth HTML so it looks readable
const DOCX_HTML_WRAPPER = (body: string) => `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{font-family:-apple-system,sans-serif;font-size:15px;line-height:1.7;
    color:#1a1a1a;padding:24px 32px;margin:0;word-break:break-word;max-width:860px}
  h1,h2,h3,h4{color:#111;margin:1em 0 .4em}
  table{border-collapse:collapse;width:100%;margin:1em 0}
  td,th{border:1px solid #d1d5db;padding:6px 10px;text-align:left}
  th{background:#f3f4f6;font-weight:600}
  img{max-width:100%;height:auto}
  p{margin:.5em 0}
  ul,ol{padding-left:1.4em}
</style></head><body>${body}</body></html>`;

// ─── PDF / Doc viewer (stateful inner component — hooks always at top) ────────
//
// Rendering strategy (3-tier fallback):
//   1. DOCX → server converts to HTML, render via srcdoc  (fast, works with private storage)
//   2. If (1) fails → Office Online viewer iframe           (same as xlsx/pptx)
//   3. If (2) fails → error view with "Open in new tab"
//
function DocOrPdfViewerModal({ file, onClose }: { file: FileItem; onClose: () => void }) {
  const kind = detectKind(file);
  const wordDoc = isWordDoc(file);

  type Stage = "convert" | "office" | "error";
  const [stage, setStage] = useState<Stage>(wordDoc ? "convert" : "office");
  const [loading, setLoading] = useState(true);
  const [docHtml, setDocHtml] = useState<string | null>(null);

  useEffect(() => {
    if (!wordDoc) return;
    setStage("convert");
    setLoading(true);
    setDocHtml(null);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);

    apiGet<{ html: string }>(`/api/convert/docx?url=${encodeURIComponent(file.url)}`)
      .then((data) => {
        clearTimeout(timer);
        setDocHtml(DOCX_HTML_WRAPPER(data.html));
        setLoading(false);
      })
      .catch(() => {
        clearTimeout(timer);
        setStage("office");
        setLoading(true);
      });

    return () => { clearTimeout(timer); controller.abort(); };
  }, [file.url, wordDoc]);

  const encodedUrl = encodeURIComponent(file.url);
  const officeViewerUrl = kind === "pdf"
    ? `https://docs.google.com/gview?embedded=true&url=${encodedUrl}`
    : `https://view.officeapps.live.com/op/view.aspx?src=${encodedUrl}`;

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "#fff" }}>
        <View style={dv.header}>
          <TouchableOpacity onPress={onClose} style={dv.headerBtn}>
            <Feather name="x" size={20} color="#111" />
          </TouchableOpacity>
          <Text style={dv.headerTitle} numberOfLines={1}>{file.name}</Text>
          <TouchableOpacity onPress={() => window.open(file.url, "_blank")} style={dv.headerBtn}>
            <Feather name="external-link" size={18} color="#111" />
          </TouchableOpacity>
        </View>
        <View style={{ flex: 1, position: "relative" }}>
          {loading && stage !== "error" && (
            <View style={dv.loadingOverlay}>
              <Text style={dv.loadingText}>
                {stage === "convert" ? "Đang chuyển đổi…" : "Đang tải…"}
              </Text>
            </View>
          )}
          {stage === "convert" && docHtml && (
            React.createElement("iframe", {
              srcDoc: docHtml,
              style: { width: "100%", height: "100%", border: "none" },
              sandbox: "allow-same-origin",
            })
          )}
          {stage === "office" && (
            React.createElement("iframe", {
              key: officeViewerUrl,
              src: officeViewerUrl,
              style: { width: "100%", height: "100%", border: "none" },
              onLoad: () => setLoading(false),
              onError: () => { setLoading(false); setStage("error"); },
            })
          )}
          {stage === "error" && (
            <View style={dv.errorBox}>
              <Feather name="alert-circle" size={36} color="#ef4444" />
              <Text style={dv.errorText}>Không thể tải xem trước</Text>
              <TouchableOpacity style={dv.openBtn} onPress={() => window.open(file.url, "_blank")}>
                <Text style={dv.openBtnText}>Mở tab mới</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ─── DocViewerModal (exported — pure dispatcher, no hooks) ────────────────────
//
//  image  → ImageFullscreen
//  video  → inline HTML5 <video>
//  audio  → inline HTML5 <audio>
//  other  → open in new tab
//  pdf    → DocOrPdfViewerModal (Google Docs viewer)
//  doc    → DocOrPdfViewerModal (DOCX→HTML or Office Online)
//
export function DocViewerModal({ file, onClose }: { file: FileItem; onClose: () => void }) {
  const kind = detectKind(file);

  if (kind === "image") {
    return <ImageFullscreen url={file.url} name={file.name} onClose={onClose} />;
  }

  if (kind === "video") {
    return (
      <Modal visible animationType="slide" onRequestClose={onClose}>
        <View style={{ flex: 1, backgroundColor: "#000" }}>
          <View style={dv.header}>
            <TouchableOpacity onPress={onClose} style={dv.headerBtn}>
              <Feather name="x" size={20} color="#111" />
            </TouchableOpacity>
            <Text style={dv.headerTitle} numberOfLines={1}>{file.name}</Text>
            <TouchableOpacity onPress={() => window.open(file.url, "_blank")} style={dv.headerBtn}>
              <Feather name="external-link" size={18} color="#111" />
            </TouchableOpacity>
          </View>
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#000" }}>
            {React.createElement("video", {
              src: file.url,
              controls: true,
              style: { maxWidth: "100%", maxHeight: "100%", outline: "none" },
            })}
          </View>
        </View>
      </Modal>
    );
  }

  if (kind === "audio") {
    return (
      <Modal visible animationType="slide" onRequestClose={onClose}>
        <View style={{ flex: 1, backgroundColor: "#fff" }}>
          <View style={dv.header}>
            <TouchableOpacity onPress={onClose} style={dv.headerBtn}>
              <Feather name="x" size={20} color="#111" />
            </TouchableOpacity>
            <Text style={dv.headerTitle} numberOfLines={1}>{file.name}</Text>
            <TouchableOpacity onPress={() => window.open(file.url, "_blank")} style={dv.headerBtn}>
              <Feather name="external-link" size={18} color="#111" />
            </TouchableOpacity>
          </View>
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24 }}>
            {React.createElement("audio", {
              src: file.url,
              controls: true,
              style: { width: "100%", outline: "none" },
            })}
          </View>
        </View>
      </Modal>
    );
  }

  if (kind === "other") {
    // No modal needed — open directly in a new tab
    window.open(file.url, "_blank");
    onClose();
    return null;
  }

  // pdf / doc
  return <DocOrPdfViewerModal file={file} onClose={onClose} />;
}

const dv = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    backgroundColor: "#fff",
    gap: 10,
  },
  headerBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "#f3f4f6",
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  headerTitle: { flex: 1, fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#111827" },
  loadingOverlay: {
    position: "absolute" as any, top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "#fff", alignItems: "center", justifyContent: "center", zIndex: 10,
  },
  loadingText: { fontSize: 13, color: "#6b7280", fontFamily: "Inter_400Regular" },
  errorBox: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, padding: 32 },
  errorText: { fontSize: 14, color: "#374151", textAlign: "center", fontFamily: "Inter_400Regular" },
  openBtn: { backgroundColor: "#6366f1", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  openBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
});

// ─── Image Fullscreen ─────────────────────────────────────────────────────────
function ImageFullscreen({ url, name, onClose }: { url: string; name: string; onClose: () => void }) {
  return (
    <Modal visible animationType="fade" onRequestClose={onClose}>
      <View style={s.fsContainer}>
        {/* Native Image for RN web renders correctly */}
        <Image
          source={{ uri: url }}
          style={s.fsImage}
          resizeMode="contain"
        />
        <View style={s.fsTop}>
          <Text style={s.fsName} numberOfLines={1}>{name}</Text>
          <TouchableOpacity onPress={onClose} style={s.fsClose}>
            <Feather name="x" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── FileViewer ───────────────────────────────────────────────────────────────
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

  // ── VIDEO (HTML5 on web) ──
  if (kind === "video") {
    return (
      <View style={{ borderRadius: 12, overflow: "hidden", backgroundColor: "#000" }}>
        {React.createElement("video", {
          src: file.url,
          controls: true,
          style: { width: "100%", maxHeight: 260, display: "block" } as any,
        })}
      </View>
    );
  }

  // ── AUDIO (HTML5 on web) ──
  if (kind === "audio") {
    return (
      <View style={[s.pill, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[s.pillIcon, { backgroundColor: bg }]}>
          <Feather name="music" size={16} color={color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.pillName, { color: colors.foreground }]} numberOfLines={1}>{file.name}</Text>
          {React.createElement("audio", {
            src: file.url,
            controls: true,
            style: { width: "100%", marginTop: 6, height: 32 } as any,
          })}
        </View>
      </View>
    );
  }

  // ── PDF / DOC: inline viewer modal ──
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
            <Text style={[s.pillName, { color: colors.foreground }]} numberOfLines={1}>{file.name}</Text>
            <Text style={[s.pillSub, { color: colors.mutedForeground }]}>
              {kind === "pdf" ? "Xem PDF" : "Xem file"}
            </Text>
          </View>
          <Feather name="maximize-2" size={14} color={colors.mutedForeground} />
        </TouchableOpacity>
      </>
    );
  }

  // ── OTHER: open in new tab ──
  return (
    <TouchableOpacity
      onPress={() => window.open(file.url, "_blank")}
      activeOpacity={0.75}
      style={[s.pill, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      <View style={[s.pillIcon, { backgroundColor: bg }]}>
        <Feather name={icon as any} size={16} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.pillName, { color: colors.foreground }]} numberOfLines={1}>{file.name}</Text>
        <Text style={[s.pillSub, { color: colors.mutedForeground }]}>Mở file</Text>
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

  const handlePress = onPress ?? (() => window.open(file.url, "_blank"));

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.75}
      style={[s.chip, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      <View style={[s.chipIcon, { backgroundColor: bg }]}>
        <Feather name={icon as any} size={13} color={color} />
      </View>
      <Text style={[s.chipName, { color: colors.foreground }]} numberOfLines={1}>{file.name}</Text>
      <Feather name="chevron-right" size={12} color={colors.mutedForeground} />
    </TouchableOpacity>
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
const s = StyleSheet.create({
  fsContainer: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  fsImage: {
    width: "100%" as any,
    height: "85%" as any,
  },
  fsTop: {
    position: "absolute",
    top: 16,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
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
