import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { Image as ExpoImage } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { Audio, Video, ResizeMode } from "expo-av";
import { router, useFocusEffect, useNavigation } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "@/hooks/useSafeAreaInsets";

import { useColors } from "@/hooks/useColors";
import { DocViewerModal, FileItem } from "@/components/FileViewer";
import { useAuth } from "@/context/AuthContext";
import { useChatUnread } from "@/context/ChatUnreadContext";
import { apiDelete, apiGet, apiPost, apiPut, getCenterUrl, getAuthToken } from "@/lib/api";
import { popChatDeeplink } from "@/lib/deeplinkStore";
import { setActiveChatTopic } from "@/lib/activeChatTopic";
import {
  getTabBarStyle,
  WEB_BOTTOM_INSET_FALLBACK,
} from "@/lib/tabBarStyle";

const EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "👎", "🔥", "🎉"];

interface TinodeCreds { tinodeUrl: string; apiKey: string; login: string; password: string; displayName: string; tinodeUid: string | null; }
interface Attachment { url: string; name: string; mime: string; size?: number; }
interface ChatMsg { seq: number; from: string; ts: string; content: string; isMe: boolean; displayName?: string; replySeq?: number; edited?: boolean; attachment?: Attachment; }
interface UserResult { userId: string; displayName: string; role: string; tinodeLogin: string; tinodeUid: string; }
interface CustomGroup { id?: string; name: string; topicId: string; createdBy?: string; isCreator: boolean; memberCount: number; createdAt: string; lastMessage?: string; }
interface ClassResult { id: string; name: string; classCode: string; }
interface ClassMember { userId: string; displayName: string; role: string; }
interface GroupMember { userId: string; displayName: string; tinodeUid: string | null; isCreator: boolean; joinedAt: string; }
interface GroupDetail { id: string; name: string; topicId: string; createdBy: string; isCreator: boolean; memberCount: number; createdAt: string; members: GroupMember[]; }
interface ConvItem { topicId: string; title: string; subtitle?: string; type: "group" | "dm"; groupId?: string; }
interface PendingAttachment { uri: string; name: string; mime: string; size?: number; }
type ReactionsMap = Record<number, Record<string, string[]>>;

let cachedCreds: TinodeCreds | null = null;

function toBase64(str: string): string {
  if (typeof btoa !== "undefined") return btoa(str);
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let result = "", i = 0;
  const bytes = Array.from(str).map(c => c.charCodeAt(0));
  while (i < bytes.length) {
    const b0 = bytes[i++] ?? 0, b1 = bytes[i++] ?? 0, b2 = bytes[i++] ?? 0;
    result += chars[b0 >> 2] + chars[((b0 & 3) << 4) | (b1 >> 4)] +
      (i - 1 < bytes.length + 1 ? chars[((b1 & 15) << 2) | (b2 >> 6)] : "=") +
      (i < bytes.length + 1 ? chars[b2 & 63] : "=");
  }
  return result;
}

function msgContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (content && typeof content === "object") {
    const c = content as Record<string, unknown>;
    if (typeof c.txt === "string") return c.txt;
    return JSON.stringify(content);
  }
  return String(content ?? "");
}

function isImageMime(mime: string): boolean {
  return mime.startsWith("image/");
}

function isVideoMime(mime: string): boolean {
  return mime.startsWith("video/");
}

function isAudioMime(mime: string): boolean {
  return mime.startsWith("audio/");
}

/**
 * Normalize URLs where the protocol separator is malformed.
 * Some clients (e.g. the native mobile team) send "https//..." instead of
 * "https://...". Browsers refuse to fetch such URLs so we patch them here
 * before any render or network call.
 */
function normalizeUrl(url: string): string {
  // Matches "https//" or "http//" (with or without the colon) and ensures "://"
  return url.replace(/^(https?):?\/\//, "$1://");
}

function formatBytes(bytes?: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function parseAttachment(content: unknown, head?: Record<string, unknown>): Attachment | undefined {
  // Primary URL source: head.attachments (set by both our app and well-behaved clients).
  // Normalize before use — some clients send "https//..." instead of "https://...".
  const rawUrls = head?.attachments;
  let url: string | undefined;
  if (Array.isArray(rawUrls) && rawUrls.length > 0) {
    url = normalizeUrl(rawUrls[0] as string);
  }

  let mime = (head?.mime as string) || "application/octet-stream";
  let name = "file";
  let size: number | undefined;

  if (content && typeof content === "object") {
    const c = content as Record<string, unknown>;
    if (Array.isArray(c.ent)) {
      type TinodeEnt = { tp: string; data?: Record<string, unknown> };
      const ents = c.ent as TinodeEnt[];

      // ── EX (file / generic attachment) ────────────────────────────────────
      const ex = ents.find(e => e.tp === "EX");
      if (ex?.data) {
        if (typeof ex.data.name === "string") name = ex.data.name;
        if (typeof ex.data.size === "number") size = ex.data.size;
        if (typeof ex.data.mime === "string" && ex.data.mime) mime = ex.data.mime;
        // Fallback: some clients only put the URL in ref
        if (!url && typeof ex.data.ref === "string") url = normalizeUrl(ex.data.ref);
      }

      // ── IM (inline image) ─────────────────────────────────────────────────
      // Web chat sends images as IM entities (Tinode Drafty standard).
      // Without this branch, all web-sent images are invisible on mobile.
      const im = ents.find(e => e.tp === "IM");
      if (im?.data) {
        if (typeof im.data.name === "string" && name === "file") name = im.data.name;
        if (typeof im.data.size === "number" && !size) size = im.data.size;
        // Prefer explicit image MIME from entity; fall back to image/jpeg
        if (mime === "application/octet-stream") mime = (typeof im.data.mime === "string" && im.data.mime) ? im.data.mime : "image/jpeg";
        if (!url) {
          if (typeof im.data.ref === "string") {
            // ref may be a full S3 URL or a Tinode-relative path (/v0/file/s/…)
            url = normalizeUrl(im.data.ref);
          } else if (typeof im.data.val === "string") {
            // Inline base64-encoded image
            const dataMime = (typeof im.data.mime === "string" && im.data.mime) ? im.data.mime : "image/jpeg";
            url = `data:${dataMime};base64,${im.data.val}`;
          }
        }
      }
    }
  }

  if (!url) return undefined;
  return { url, name, mime, size };
}

function formatTime(ts: string): string {
  try { return new Date(ts).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
}

function roleLabel(role: string): string {
  if (role === "staff") return "Nhân viên";
  if (role === "teacher") return "Giáo viên";
  if (role === "admin") return "Admin";
  return "Học viên";
}

function ReplyQuote({ replySeq, msgs, colors }: { replySeq: number; msgs: ChatMsg[]; colors: ReturnType<typeof useColors> }) {
  const ref = msgs.find(m => m.seq === replySeq);
  if (!ref) return null;
  return (
    <View style={[styles.replyQuote, { borderLeftColor: colors.primary, backgroundColor: "rgba(0,0,0,0.08)" }]}>
      <Text style={[styles.replyQuoteName, { color: colors.primary }]} numberOfLines={1}>{ref.displayName || ref.from}</Text>
      <Text style={[styles.replyQuoteText, { color: colors.mutedForeground }]} numberOfLines={2}>{ref.content}</Text>
    </View>
  );
}

function ReactionChips({ seq, reactions, colors }: { seq: number; reactions: ReactionsMap; colors: ReturnType<typeof useColors> }) {
  const msgR = reactions[seq];
  if (!msgR) return null;
  const entries = Object.entries(msgR).filter(([, u]) => u.length > 0);
  if (!entries.length) return null;
  return (
    <View style={styles.reactionRow}>
      {entries.map(([emoji, uids]) => (
        <View key={emoji} style={[styles.reactionChip, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <Text style={styles.reactionEmoji}>{emoji}</Text>
          <Text style={[styles.reactionCount, { color: colors.foreground }]}>{uids.length}</Text>
        </View>
      ))}
    </View>
  );
}

/** Full-screen image lightbox with pinch-to-zoom */
function ImageLightbox({ uri, visible, onClose }: { uri: string; visible: boolean; onClose: () => void }) {
  const { width: sw, height: sh } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.95)" }}>
        {/* Close button */}
        <TouchableOpacity
          onPress={onClose}
          style={{ position: "absolute", top: insets.top + 12, right: 20, zIndex: 10, width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" }}
        >
          <Feather name="x" size={20} color="#fff" />
        </TouchableOpacity>

        {/* Zoomable image */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ flex: 1, alignItems: "center", justifyContent: "center" }}
          minimumZoomScale={1}
          maximumZoomScale={5}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          centerContent
        >
          <ExpoImage
            source={{ uri }}
            style={{ width: sw, height: sh }}
            contentFit="contain"
          />
        </ScrollView>
      </View>
    </Modal>
  );
}

/** Inline audio player for mp3 / audio/* attachments */
function AudioPlayer({ url, name, size, isMe, colors, fileCardWidth }: {
  url: string; name: string; size?: number; isMe: boolean;
  colors: ReturnType<typeof useColors>; fileCardWidth: number;
}) {
  const [sound, setSound] = React.useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [positionMs, setPositionMs] = React.useState(0);
  const [durationMs, setDurationMs] = React.useState<number | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    return () => { sound?.unloadAsync(); };
  }, [sound]);

  const fmtMs = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };

  const toggle = async () => {
    try {
      if (!sound) {
        setLoading(true);
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
        const { sound: s } = await Audio.Sound.createAsync(
          { uri: url },
          { shouldPlay: true },
          (status) => {
            if (!status.isLoaded) return;
            setDurationMs(status.durationMillis ?? null);
            setPositionMs(status.positionMillis);
            setIsPlaying(status.isPlaying);
            if (status.didJustFinish) { setIsPlaying(false); setPositionMs(0); }
          }
        );
        setSound(s);
        setLoading(false);
      } else if (isPlaying) {
        await sound.pauseAsync();
      } else {
        await sound.playAsync();
      }
    } catch {
      setLoading(false);
    }
  };

  const progressPct = durationMs && durationMs > 0 ? (positionMs / durationMs) * 100 : 0;
  const timeLabel = durationMs
    ? `${fmtMs(positionMs)} / ${fmtMs(durationMs)}`
    : size ? formatBytes(size) : "";

  const bg = isMe ? "rgba(255,255,255,0.18)" : colors.muted;
  const border = isMe ? "rgba(255,255,255,0.3)" : colors.border;
  const fg = isMe ? "#fff" : colors.foreground;
  const sub = isMe ? "rgba(255,255,255,0.7)" : colors.mutedForeground;
  const accent = isMe ? "#fff" : colors.primary;

  return (
    <View style={[styles.attachFile, { width: fileCardWidth, backgroundColor: bg, borderColor: border }]}>
      <TouchableOpacity onPress={toggle} disabled={loading} style={[styles.audioPlayBtn, { backgroundColor: isMe ? "rgba(255,255,255,0.25)" : colors.primary + "22" }]}>
        {loading
          ? <ActivityIndicator size="small" color={accent} />
          : <Feather name={isPlaying ? "pause" : "play"} size={16} color={accent} />}
      </TouchableOpacity>
      <View style={styles.attachFileInfo}>
        <Text style={[styles.attachFileName, { color: fg }]} numberOfLines={1} ellipsizeMode="middle">{name}</Text>
        <View style={[styles.audioProgressBar, { backgroundColor: isMe ? "rgba(255,255,255,0.25)" : colors.border }]}>
          <View style={[styles.audioProgressFill, { width: `${progressPct}%` as any, backgroundColor: accent }]} />
        </View>
        <Text style={[styles.attachFileSize, { color: sub }]}>{timeLabel}</Text>
      </View>
    </View>
  );
}

function AttachmentView({ att, isMe, tinodeHttpUrl, tinodeApiKey, colors, onOpenDoc, onLongPress }: {
  att: Attachment; isMe: boolean; tinodeHttpUrl: string; tinodeApiKey: string;
  colors: ReturnType<typeof useColors>; onOpenDoc: (file: FileItem) => void;
  onLongPress: () => void;
}) {
  const [imgFailed, setImgFailed] = React.useState(false);
  const [lightboxOpen, setLightboxOpen] = React.useState(false);
  const { width: screenWidth } = useWindowDimensions();
  // Card width = bubble maxWidth (80%) minus bubble paddingHorizontal (13×2).
  // Using explicit `width` (not maxWidth) so that flex:1 on attachFileInfo works on Android —
  // Yoga/Android requires an explicit parent width for flex:1 children to expand; maxWidth alone collapses them to 0.
  const fileCardWidth = screenWidth * 0.8 - 26;
  const token = getAuthToken();

  // Decode percent-encoded filenames (e.g. "file%20name.pdf" → "file name.pdf")
  const displayName = React.useMemo(() => {
    try { return decodeURIComponent(att.name); } catch { return att.name; }
  }, [att.name]);

  const normalizedAttUrl = normalizeUrl(att.url);
  // data: URIs (base64 inline images) go straight to expo-image; no further processing needed
  const isDataUri = normalizedAttUrl.startsWith("data:");
  const rawUrl = isDataUri
    ? normalizedAttUrl
    : normalizedAttUrl.startsWith("http")
      ? normalizedAttUrl
      : `${tinodeHttpUrl}${normalizedAttUrl}?apikey=${encodeURIComponent(tinodeApiKey)}`;

  // Append auth token for our own storage endpoint so expo-image can load protected files
  const fullUrl = !isDataUri && token && rawUrl.startsWith("http") && rawUrl.includes("/api/storage/")
    ? `${rawUrl}${rawUrl.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`
    : rawUrl;

  const isImg = isImageMime(att.mime) && !imgFailed;
  const isVideo = isVideoMime(att.mime);
  const isAudio = isAudioMime(att.mime);
  const mime = att.mime.toLowerCase();
  const nameLower = att.name.toLowerCase();
  const isPdf = mime.includes("pdf") || nameLower.endsWith(".pdf");
  const isDoc = !isPdf && (
    mime.includes("word") || mime.includes("excel") || mime.includes("powerpoint") ||
    mime.includes("spreadsheet") || mime.includes("presentation") ||
    /\.(doc|docx|xls|xlsx|ppt|pptx)$/.test(nameLower)
  );

  // Audio: inline player
  if (isAudio) {
    return <AudioPlayer url={fullUrl} name={displayName} size={att.size} isMe={isMe} colors={colors} fileCardWidth={fileCardWidth} />;
  }

  // Video: native uses expo-av Video; web renders a native <video> HTML element
  // (expo-av Video doesn't render visible controls in the Expo web simulator)
  if (isVideo) {
    if (Platform.OS === "web") {
      return React.createElement("video", {
        src: fullUrl,
        controls: true,
        style: {
          width: 240,
          height: 160,
          borderRadius: 10,
          backgroundColor: "#000",
          display: "block",
          marginBottom: 2,
        },
      });
    }
    return (
      <Video
        source={{ uri: fullUrl }}
        style={styles.attachVideo}
        useNativeControls
        resizeMode={ResizeMode.CONTAIN}
        isLooping={false}
      />
    );
  }

  // PDF / Office doc — open inline WebView viewer (Google Docs / Office Online)
  if (isPdf || isDoc) {
    const docFile: FileItem = { name: displayName, url: fullUrl, mimetype: att.mime };
    const iconName: any = isPdf ? "file-text" : "file";
    const iconColor = isPdf ? "#ef4444" : "#2563eb";
    const iconBg = isPdf ? "#fef2f2" : "#eff6ff";
    const cardBg = isMe ? "rgba(255,255,255,0.18)" : colors.muted;
    const cardBorder = isMe ? "rgba(255,255,255,0.3)" : colors.border;
    const labelColor = isMe ? "rgba(255,255,255,0.7)" : colors.mutedForeground;
    return (
      <>
        <TouchableOpacity
          onPress={() => onOpenDoc(docFile)}
          onLongPress={onLongPress}
          delayLongPress={350}
          activeOpacity={0.8}
          style={[styles.attachFile, { width: fileCardWidth, backgroundColor: cardBg, borderColor: cardBorder }]}
        >
          <View style={[styles.attachDocIcon, { backgroundColor: iconBg }]}>
            <Feather name={iconName} size={16} color={iconColor} />
          </View>
          <View style={styles.attachFileInfo}>
            <Text style={[styles.attachFileName, { color: isMe ? "#fff" : colors.foreground }]} numberOfLines={1} ellipsizeMode="middle">
              {displayName}
            </Text>
            <Text style={[styles.attachFileSize, { color: labelColor }]}>
              {isPdf ? "Xem PDF" : "Xem tài liệu"}{att.size != null ? ` · ${formatBytes(att.size)}` : ""}
            </Text>
          </View>
          <Feather name="maximize-2" size={14} color={labelColor} style={{ flexShrink: 0 }} />
        </TouchableOpacity>
      </>
    );
  }

  return (
    <>
      {isImg && (
        <ImageLightbox uri={fullUrl} visible={lightboxOpen} onClose={() => setLightboxOpen(false)} />
      )}
      <TouchableOpacity
        onPress={() => {
          if (isImg) { setLightboxOpen(true); }
          else if (!isDataUri) { Linking.openURL(rawUrl); }
        }}
        onLongPress={onLongPress}
        delayLongPress={350}
        activeOpacity={0.8}
      >
        {isImg ? (
          <ExpoImage
            source={{ uri: fullUrl }}
            style={styles.attachImage}
            contentFit="cover"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <View style={[styles.attachFile, { width: fileCardWidth, backgroundColor: isMe ? "rgba(255,255,255,0.18)" : colors.muted, borderColor: isMe ? "rgba(255,255,255,0.3)" : colors.border }]}>
            <Feather name="paperclip" size={18} color={isMe ? "#fff" : colors.primary} style={{ flexShrink: 0 }} />
            <View style={styles.attachFileInfo}>
              <Text style={[styles.attachFileName, { color: isMe ? "#fff" : colors.foreground }]} numberOfLines={1} ellipsizeMode="middle">{displayName}</Text>
              {att.size != null && <Text style={[styles.attachFileSize, { color: isMe ? "rgba(255,255,255,0.7)" : colors.mutedForeground }]}>{formatBytes(att.size)}</Text>}
            </View>
            <Feather name="download" size={16} color={isMe ? "#fff" : colors.primary} style={{ flexShrink: 0 }} />
          </View>
        )}
      </TouchableOpacity>
    </>
  );
}

function MessageBubble({ msg, msgs, reactions, colors, onLongPress, tinodeHttpUrl, tinodeApiKey, onOpenDoc }: {
  msg: ChatMsg; msgs: ChatMsg[]; reactions: ReactionsMap;
  colors: ReturnType<typeof useColors>; onLongPress: (m: ChatMsg) => void;
  tinodeHttpUrl: string; tinodeApiKey: string; onOpenDoc: (file: FileItem) => void;
}) {
  return (
    <View style={[styles.bubbleWrap, msg.isMe ? styles.bubbleWrapMe : styles.bubbleWrapOther]}>
      {!msg.isMe && <Text style={[styles.bubbleSender, { color: colors.primary }]} numberOfLines={1}>{msg.displayName || msg.from}</Text>}
      {/* Bubble shell is outside Pressable so nested touchables (file cards) receive taps on Android */}
      <View style={[styles.bubble, msg.isMe ? { backgroundColor: colors.primary } : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}>
        {msg.replySeq != null && <ReplyQuote replySeq={msg.replySeq} msgs={msgs} colors={colors} />}
        {msg.attachment && (
          // AttachmentView handles its own tap (open viewer) and long-press (context menu)
          <AttachmentView att={msg.attachment} isMe={msg.isMe} tinodeHttpUrl={tinodeHttpUrl} tinodeApiKey={tinodeApiKey} colors={colors} onOpenDoc={onOpenDoc} onLongPress={() => onLongPress(msg)} />
        )}
        {(msg.content || msg.edited) ? (
          // Text content is wrapped in Pressable for long-press context menu
          <Pressable onLongPress={() => onLongPress(msg)} delayLongPress={350}>
            <>
              {msg.content ? <Text style={[styles.bubbleText, { color: msg.isMe ? "#fff" : colors.foreground }]}>{msg.content}</Text> : null}
              {msg.edited && <Text style={[styles.editedLabel, { color: msg.isMe ? "rgba(255,255,255,0.6)" : colors.mutedForeground }]}>(đã chỉnh sửa)</Text>}
            </>
          </Pressable>
        ) : null}
      </View>
      <Text style={[styles.bubbleTime, { color: colors.mutedForeground }]}>{formatTime(msg.ts)}</Text>
      <ReactionChips seq={msg.seq} reactions={reactions} colors={colors} />
    </View>
  );
}

export default function ChatScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = insets.top + 16;
  const bottomPad = Platform.OS === "web" ? 34 : 0;
  const { user } = useAuth();

  const [canCreateGroup, setCanCreateGroup] = useState(false);
  const [canAddMember, setCanAddMember] = useState(false);
  const [canRemoveMember, setCanRemoveMember] = useState(false);


  const [groups, setGroups] = useState<CustomGroup[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [refreshingGroups, setRefreshingGroups] = useState(false);
  const [groupSearch, setGroupSearch] = useState("");
  const { unreadCounts, markRead, topicTouched, lastMessages, updateLastMessage, knownTopics, setKnownGroupTopics } = useChatUnread();

  const [showNewChat, setShowNewChat] = useState(false);
  const [dmQuery, setDmQuery] = useState("");
  const [dmResults, setDmResults] = useState<UserResult[]>([]);
  const [dmSearching, setDmSearching] = useState(false);
  const dmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Server no longer flags DM channels in GET /groups (they're plain chat_groups rows with
  // is_direct_message=true, hidden from the response) — track which topicIds are DMs locally
  // (persisted) so we keep showing the right icon/actions when reopening from the flat list.
  const dmTopicIdsRef = useRef<Set<string>>(new Set());
  const [dmTopicIdsVersion, setDmTopicIdsVersion] = useState(0);
  const DM_TOPIC_IDS_KEY = "chat:dmTopicIds";


  const [showAddMember, setShowAddMember] = useState(false);
  const [addMemberQ, setAddMemberQ] = useState("");
  const [addMemberResults, setAddMemberResults] = useState<UserResult[]>([]);
  const [addMemberSearching, setAddMemberSearching] = useState(false);
  const [addingMember, setAddingMember] = useState(false);
  const addMemberTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [showGroupDetail, setShowGroupDetail] = useState(false);
  const [groupDetail, setGroupDetail] = useState<GroupDetail | null>(null);
  const [loadingGroupDetail, setLoadingGroupDetail] = useState(false);
  const [showRenameGroup, setShowRenameGroup] = useState(false);
  const [renameGroupName, setRenameGroupName] = useState("");
  const [renamingGroup, setRenamingGroup] = useState(false);

  const [selectedConv, setSelectedConv] = useState<ConvItem | null>(null);
  const navigation = useNavigation();

  // Cho lib/pushNotifications.ts biết kênh nào đang mở sẵn trên màn hình, để ẩn
  // banner/badge khi push chat đến đúng kênh đó (tin nhắn đã tới qua WS rồi).
  useEffect(() => {
    setActiveChatTopic(selectedConv?.topicId ?? null);
    return () => setActiveChatTopic(null);
  }, [selectedConv?.topicId]);

  // Tab bar dùng position:"absolute" (app/(tabs)/_layout.tsx) nên nó nổi đè lên
  // nội dung màn hình thay vì được trừ vào chiều cao khả dụng. Khi mở một cuộc
  // trò chuyện, thanh nhập tin nhắn nằm sát đáy màn hình sẽ bị tab bar che mất
  // hoàn toàn trên bản build APK thật (nơi insets.bottom lớn hơn 0). Ẩn tab bar
  // khi đang trong màn hình chat để giải phóng toàn bộ vùng đáy cho input.
  useEffect(() => {
    const bottomInset = Math.max(
      insets.bottom,
      Platform.OS === "web" ? WEB_BOTTOM_INSET_FALLBACK : 0,
    );
    navigation.setOptions({
      tabBarStyle: selectedConv
        ? { display: "none" }
        : getTabBarStyle({
            backgroundColor: colors.background,
            borderColor: colors.border,
            bottomInset,
            transparent: Platform.OS === "ios",
          }),
    });
  }, [
    colors.background,
    colors.border,
    insets.bottom,
    navigation,
    selectedConv,
  ]);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [reactions, setReactions] = useState<ReactionsMap>({});
  const [wsStatus, setWsStatus] = useState<"connecting" | "connected" | "error">("connecting");
  const [wsError, setWsError] = useState<string | null>(null);

  const [inputText, setInputText] = useState("");
  const [replyTo, setReplyTo] = useState<ChatMsg | null>(null);
  const [editMsg, setEditMsg] = useState<ChatMsg | null>(null);
  const [menuMsg, setMenuMsg] = useState<ChatMsg | null>(null);
  const [emojiForMsg, setEmojiForMsg] = useState<ChatMsg | null>(null);

  const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null);
  const [uploading, setUploading] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const myUidRef = useRef<string>("");
  const msgIdRef = useRef(1);
  const nameMapRef = useRef<Map<string, string>>(new Map());
  const flatRef = useRef<FlatList>(null);
  const pendingUids = useRef<Set<string>>(new Set());
  const lookupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<TextInput>(null);
  const tinodeHttpUrlRef = useRef<string>("");
  const tinodeApiKeyRef = useRef<string>("");

  // ── Doc viewer state — lifted here so setMessages() re-renders don't reset it ──
  const [activeDocFile, setActiveDocFile] = useState<FileItem | null>(null);

  // ── Create-group dialog state ──
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showMemberSearch, setShowMemberSearch] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [selectedClass, setSelectedClass] = useState<ClassResult | null>(null);
  const [classSearchQ, setClassSearchQ] = useState("");
  const [classSearchResults, setClassSearchResults] = useState<ClassResult[]>([]);
  const [classSearching, setClassSearching] = useState(false);
  const classSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const groupMemberTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [classMembers, setClassMembers] = useState<ClassMember[]>([]);
  const [existingClassGroups, setExistingClassGroups] = useState<Array<{ id: string; name: string }>>([]);
  const [loadingClassMembers, setLoadingClassMembers] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState<UserResult[]>([]);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [groupMemberQ, setGroupMemberQ] = useState("");
  const [groupMemberResults, setGroupMemberResults] = useState<UserResult[]>([]);
  const [groupMemberSearching, setGroupMemberSearching] = useState(false);
  const [classSearchError, setClassSearchError] = useState<string | null>(null);

  const nextId = () => String(msgIdRef.current++);

  const flushUidLookup = useCallback(async () => {
    const uids = [...pendingUids.current].filter(u => !nameMapRef.current.has(u));
    pendingUids.current.clear();
    if (!uids.length) return;
    try {
      const r = await apiGet<{ success: boolean; data: { users: { tinodeUid: string; displayName: string }[] } }>(
        `/api/mobile/chat/users?uids=${uids.slice(0, 50).join(",")}`
      );
      for (const u of (r.data?.users ?? [])) nameMapRef.current.set(u.tinodeUid, u.displayName);
      setMessages(prev => prev.map(m => ({ ...m, displayName: nameMapRef.current.get(m.from) ?? m.displayName })));
    } catch {}
  }, []);

  const scheduleUidLookup = useCallback((uid: string) => {
    if (nameMapRef.current.has(uid)) return;
    pendingUids.current.add(uid);
    if (lookupTimerRef.current) clearTimeout(lookupTimerRef.current);
    lookupTimerRef.current = setTimeout(flushUidLookup, 600);
  }, [flushUidLookup]);

  const fetchGroups = useCallback(async (silent = false) => {
    if (!silent) setLoadingGroups(true);
    setGroupError(null);
    try {
      const r = await apiGet<{ success: boolean; data: { groups: CustomGroup[]; total: number; permissions: { canCreateGroup: boolean; canAddMember: boolean; canRemoveMember: boolean; canOpenDM: boolean } } }>("/api/mobile/chat/groups");
      const fetchedGroups = r.data?.groups ?? [];
      setGroups(fetchedGroups);
      // Seed lastMessages from API so subtitle shows on first load (before WS delivers data)
      fetchedGroups.forEach(g => { if (g.lastMessage) updateLastMessage(g.topicId, g.lastMessage); });
      // Báo context biết topicId nào hợp lệ — badge chỉ đếm những topic này,
      // bỏ qua các kênh Tinode cũ (kênh lớp deprecated) không còn trong /groups.
      setKnownGroupTopics(new Set(fetchedGroups.map(g => g.topicId)));
      setCanCreateGroup(r.data?.permissions?.canCreateGroup ?? false);
      setCanAddMember(r.data?.permissions?.canAddMember ?? false);
      setCanRemoveMember(r.data?.permissions?.canRemoveMember ?? false);
    } catch { setGroups([]); }
    finally { setLoadingGroups(false); setRefreshingGroups(false); }
  }, [updateLastMessage]);

  // Chat mở từ push notification (xem lib/deeplinkNavigator.ts): backend gửi
  // { type: "chat", referenceId: topicId, referenceType }. Lưu lại topicId cần
  // mở khi tab này focus, rồi chờ danh sách nhóm tải xong để lấy đúng tên/loại kênh.
  const pendingChatTopicRef = useRef<{ topicId: string; referenceType?: string } | null>(null);

  useFocusEffect(useCallback(() => {
    const dl = popChatDeeplink();
    if (dl) pendingChatTopicRef.current = dl;
    fetchGroups();
    return () => {};
  }, [fetchGroups]));

  useEffect(() => {
    const pending = pendingChatTopicRef.current;
    if (!pending || loadingGroups) return;
    pendingChatTopicRef.current = null;

    const match = groups.find(g => g.topicId === pending.topicId);
    if (match) {
      setSelectedConv({
        topicId: match.topicId,
        title: match.name,
        type: dmTopicIdsRef.current.has(match.topicId) ? "dm" : "group",
        groupId: match.id ?? match.topicId,
      });
    } else {
      // Nhóm/DM chưa từng xuất hiện trong danh sách đã tải (vd. DM đầu tiên với người này) —
      // vẫn mở kênh ngay bằng topicId, tiêu đề sẽ tự cập nhật khi Tinode trả về info kênh.
      setSelectedConv({
        topicId: pending.topicId,
        title: "Đang tải...",
        type: dmTopicIdsRef.current.has(pending.topicId) ? "dm" : "group",
      });
    }
  }, [groups, loadingGroups]);

  useEffect(() => {
    AsyncStorage.getItem(DM_TOPIC_IDS_KEY)
      .then(raw => {
        if (raw) { dmTopicIdsRef.current = new Set(JSON.parse(raw)); setDmTopicIdsVersion(v => v + 1); }
      })
      .catch(() => {});
  }, []);

  const rememberDmTopic = useCallback((topicId: string) => {
    dmTopicIdsRef.current.add(topicId);
    setDmTopicIdsVersion(v => v + 1);
    AsyncStorage.setItem(DM_TOPIC_IDS_KEY, JSON.stringify([...dmTopicIdsRef.current])).catch(() => {});
  }, []);


  const closeNewChat = useCallback(() => {
    if (dmTimer.current) clearTimeout(dmTimer.current);
    setShowNewChat(false);
    setDmQuery("");
    setDmResults([]);
  }, []);

  const searchUsers = useCallback(async (q: string) => {
    if (!q.trim()) { setDmResults([]); return; }
    setDmSearching(true);
    try {
      const r = await apiGet<{ success: boolean; data: { users: UserResult[] } }>(`/api/mobile/chat/search-users?q=${encodeURIComponent(q)}`);
      setDmResults(r.data?.users ?? []);
    } catch { setDmResults([]); }
    finally { setDmSearching(false); }
  }, []);

  const openDM = useCallback(async (user: UserResult) => {
    try {
      const r = await apiPost<{ success: boolean; data: { topicId: string; groupId: string; isNew: boolean; name?: string } }>(
        "/api/mobile/chat/p2p/open", { targetUserId: user.userId }
      );
      const { topicId, groupId, name: dmName } = r.data.data;
      // Dùng data.name từ backend (tên người dùng đối diện, đã được server resolve
      // đúng theo từng chiều) thay vì user.displayName từ search result.
      const displayTitle = dmName ?? user.displayName;
      rememberDmTopic(topicId);
      // The DM channel is really a group topic (grpXXX) that also shows up in GET /groups —
      // add/update it locally so it appears immediately in the flat conversation list.
      setGroups(prev => {
        const filtered = prev.filter(g => (g.id ?? g.topicId) !== groupId);
        return [{ id: groupId, name: displayTitle, topicId, isCreator: false, memberCount: 2, createdAt: new Date().toISOString() }, ...filtered];
      });
      closeNewChat();
      setSelectedConv({ topicId, title: displayTitle, subtitle: roleLabel(user.role), type: "dm", groupId });
      fetchGroups(true);
    } catch { }
  }, [fetchGroups, rememberDmTopic, closeNewChat]);

  const deleteGroup = useCallback(async (groupId: string) => {
    try {
      await apiDelete(`/api/mobile/chat/groups/${groupId}`);
      setGroups(prev => prev.filter(g => (g.id ?? g.topicId) !== groupId));
    } catch { }
  }, []);

  const searchAddMembers = useCallback(async (q: string) => {
    if (!q.trim()) { setAddMemberResults([]); return; }
    setAddMemberSearching(true);
    try {
      const r = await apiGet<{ success: boolean; data: { users: UserResult[] } }>(`/api/mobile/chat/search-users?q=${encodeURIComponent(q)}`);
      const existingIds = new Set((groupDetail?.members ?? []).map(m => m.userId));
      setAddMemberResults((r.data?.users ?? []).filter(u => !existingIds.has(u.userId)));
    } catch { setAddMemberResults([]); }
    finally { setAddMemberSearching(false); }
  }, [groupDetail]);

  const fetchGroupDetail = useCallback(async (topicId: string) => {
    setLoadingGroupDetail(true);
    setGroupDetail(null);
    try {
      const r = await apiGet<{ success: boolean; data: { members: { userId: string; displayName: string; role: string }[] } }>(
        `/api/mobile/chat/topics/${topicId}/members`
      );
      const apiMembers = r.data?.members ?? [];
      const grp = groups.find(g => g.topicId === topicId);
      const members: GroupMember[] = apiMembers.map(m => ({
        userId: m.userId,
        displayName: m.displayName,
        tinodeUid: null,
        isCreator: !!(grp?.createdBy && m.userId === grp.createdBy),
        joinedAt: "",
      }));
      setGroupDetail({
        id: grp?.id ?? topicId,
        name: grp?.name ?? topicId,
        topicId,
        createdBy: grp?.createdBy ?? "",
        isCreator: grp?.isCreator ?? false,
        memberCount: apiMembers.length,
        createdAt: grp?.createdAt ?? "",
        members,
      });
    } catch { }
    finally { setLoadingGroupDetail(false); }
  }, [groups]);

  const addMemberToGroup = useCallback(async (memberUserId: string, displayName: string) => {
    if (!selectedConv?.groupId || addingMember) return;
    setAddingMember(true);
    try {
      await apiPost(`/api/mobile/chat/topics/${selectedConv.topicId}/members`, { memberUserId });
      setShowAddMember(false);
      setAddMemberQ(""); setAddMemberResults([]);
      await fetchGroupDetail(selectedConv.topicId);
      setShowGroupDetail(true);
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 403) Alert.alert("Không có quyền", "Chỉ người tạo nhóm mới có thể thêm thành viên.");
      else if (status === 404) Alert.alert("Lỗi", "Nhóm không tồn tại.");
      else Alert.alert("Lỗi", "Không thể thêm thành viên.");
    } finally { setAddingMember(false); }
  }, [selectedConv, addingMember, fetchGroupDetail]);

  const renameGroup = useCallback(async () => {
    if (!selectedConv?.groupId || !renameGroupName.trim() || renamingGroup) return;
    setRenamingGroup(true);
    try {
      await apiPut(`/api/mobile/chat/groups/${selectedConv.groupId}`, { name: renameGroupName.trim() });
      const newName = renameGroupName.trim();
      setGroups(prev => prev.map(g => (g.id ?? g.topicId) === selectedConv.groupId ? { ...g, name: newName } : g));
      setGroupDetail(prev => prev ? { ...prev, name: newName } : prev);
      setSelectedConv(prev => (prev && prev.groupId === selectedConv.groupId) ? { ...prev, title: newName } : prev);
      setShowRenameGroup(false);
      setRenameGroupName("");
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 400) Alert.alert("Lỗi", "Tên nhóm không được để trống.");
      else if (status === 403) Alert.alert("Không có quyền", "Chỉ người tạo nhóm mới có thể đổi tên.");
      else Alert.alert("Lỗi", "Không thể đổi tên nhóm.");
    } finally { setRenamingGroup(false); }
  }, [selectedConv, renameGroupName, renamingGroup]);

  const removeMember = useCallback(async (topicId: string, targetUserId: string) => {
    try {
      await apiDelete(`/api/mobile/chat/topics/${topicId}/members/${targetUserId}`);
      setGroupDetail(prev => prev ? { ...prev, members: prev.members.filter(m => m.userId !== targetUserId), memberCount: prev.memberCount - 1 } : prev);
      setGroups(prev => prev.map(g => g.topicId === topicId ? { ...g, memberCount: g.memberCount - 1 } : g));
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 403) Alert.alert("Không có quyền", "Bạn không có quyền xóa thành viên khỏi nhóm này.");
      else Alert.alert("Lỗi", "Không thể xóa thành viên.");
    }
  }, []);

  const leaveGroup = useCallback(async (topicId: string) => {
    Alert.alert("Rời nhóm", "Bạn có chắc muốn rời nhóm này không?", [
      { text: "Hủy", style: "cancel" },
      { text: "Rời nhóm", style: "destructive", onPress: async () => {
        try {
          await apiDelete(`/api/mobile/chat/topics/${topicId}/members/me`);
          setGroups(prev => prev.filter(g => g.topicId !== topicId));
          setShowGroupDetail(false);
          setGroupDetail(null);
          setSelectedConv(null);
        } catch (err) {
          const status = (err as { status?: number }).status;
          if (status === 400) Alert.alert("Lỗi", "Người tạo nhóm không thể tự rời. Hãy xóa nhóm nếu muốn giải tán.");
          else Alert.alert("Lỗi", "Không thể rời nhóm.");
        }
      }},
    ]);
  }, []);

  // ── Create-group dialog callbacks ──
  const searchClasses = useCallback(async (q: string) => {
    setClassSearching(true);
    setClassSearchError(null);
    try {
      const r = await apiGet<{ success: boolean; data: { classes: ClassResult[] } }>(
        `/api/mobile/chat/classes/search?q=${encodeURIComponent(q)}`
      );
      const classes = r.data?.classes ?? (Array.isArray((r as any).classes) ? (r as any).classes : []);
      setClassSearchResults(classes);
      if (classes.length === 0) setClassSearchError(null);
    } catch (err: any) {
      console.error("[searchClasses] error:", err?.message ?? err);
      const msg = err?.message ?? "";
      if (msg.includes("500")) {
        setClassSearchError("Server đang gặp sự cố, vui lòng thử lại sau");
      } else if (msg.includes("401") || msg.includes("403")) {
        setClassSearchError("Phiên đăng nhập hết hạn, vui lòng đăng nhập lại");
      } else if (msg.includes("404")) {
        setClassSearchError("Tính năng chưa được hỗ trợ trên server này");
      } else {
        setClassSearchError(msg || "Không thể kết nối server");
      }
      setClassSearchResults([]);
    }
    finally { setClassSearching(false); }
  }, []);

  const fetchClassMembers = useCallback(async (classId: string) => {
    setLoadingClassMembers(true);
    setClassMembers([]);
    try {
      const r = await apiGet<{ success: boolean; data: { members: ClassMember[] } }>(
        `/api/mobile/chat/classes/${classId}/members`
      );
      setClassMembers(r.data?.members ?? []);
    } catch { setClassMembers([]); }
    finally { setLoadingClassMembers(false); }
  }, []);

  const fetchClassGroups = useCallback(async (classId: string) => {
    try {
      const r = await apiGet<{ success: boolean; data: { groups: Array<{ id: string; name: string }> } }>(
        `/api/mobile/chat/classes/${classId}/groups`
      );
      setExistingClassGroups(r.data?.groups ?? []);
    } catch { setExistingClassGroups([]); }
  }, []);

  const searchGroupMembers = useCallback(async (q: string) => {
    if (!q.trim()) { setGroupMemberResults([]); return; }
    setGroupMemberSearching(true);
    try {
      const r = await apiGet<{ success: boolean; data: { users: UserResult[] } }>(
        `/api/mobile/chat/search-users?q=${encodeURIComponent(q)}`
      );
      setGroupMemberResults(r.data?.users ?? []);
    } catch { setGroupMemberResults([]); }
    finally { setGroupMemberSearching(false); }
  }, []);

  const resetCreateGroupDialog = useCallback(() => {
    setShowCreateGroup(false);
    setShowMemberSearch(false);
    setNewGroupName("");
    setSelectedClass(null);
    setClassSearchQ("");
    setClassSearchResults([]);
    setClassMembers([]);
    setExistingClassGroups([]);
    setSelectedMembers([]);
    setGroupMemberQ("");
    setGroupMemberResults([]);
    if (groupMemberTimer.current) clearTimeout(groupMemberTimer.current);
    if (classSearchTimer.current) clearTimeout(classSearchTimer.current);
  }, []);

  const createGroup = useCallback(async () => {
    if (!newGroupName.trim() || creatingGroup) return;
    setCreatingGroup(true);
    try {
      const body: Record<string, unknown> = { name: newGroupName.trim() };
      if (selectedClass) body.classId = selectedClass.id;
      else if (selectedMembers.length > 0) body.memberUserIds = selectedMembers.map(m => m.userId);
      const r = await apiPost<{ success: boolean; data: { group: CustomGroup } }>(
        "/api/mobile/chat/groups", body
      );
      const group = r.data.data?.group;
      if (group) setGroups(prev => [group, ...prev]);
      resetCreateGroupDialog();
    } catch (err: any) {
      const status = err?.status ?? err?.response?.status;
      const serverMsg = err?.data?.message ?? err?.message ?? "";
      if (status === 403) Alert.alert("Không có quyền", "Bạn không có quyền tạo nhóm.");
      else if (status === 500) Alert.alert("Lỗi server", serverMsg || "Server gặp sự cố khi tạo nhóm, vui lòng thử lại sau.");
      else Alert.alert("Lỗi", serverMsg || "Không thể tạo nhóm.");
    } finally { setCreatingGroup(false); }
  }, [newGroupName, creatingGroup, selectedClass, selectedMembers, resetCreateGroupDialog]);

  useEffect(() => {
    if (!selectedConv) return;
    const topicId = selectedConv.topicId;
    let cancelled = false;
    let ws: WebSocket | null = null;
    let reconnectCount = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let pingInterval: ReturnType<typeof setInterval> | null = null;
    const MAX_RECONNECTS = 8;

    const clearTimers = () => {
      if (pingInterval) { clearInterval(pingInterval); pingInterval = null; }
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    };

    const connect = async () => {
      if (cancelled) return;
      if (reconnectCount === 0) { setWsStatus("connecting"); setWsError(null); }
      try {
        let creds = cachedCreds;
        if (!creds) {
          const r = await apiPost<{ success: boolean; data: TinodeCreds }>("/api/mobile/chat/connect", {});
          creds = r.data.data; cachedCreds = creds;
          if (creds.tinodeUid && !myUidRef.current) myUidRef.current = creds.tinodeUid;
          // Seed tên bản thân vào map để phòng edge case isMe=false khi echo về
          if (creds.tinodeUid && creds.displayName) nameMapRef.current.set(creds.tinodeUid, creds.displayName);
        }
        if (cancelled) return;
        const rawUrl = creds.tinodeUrl.replace(/^http/, "ws").replace(/\/$/, "");
        const basePath = rawUrl.endsWith("/v0/channels") ? rawUrl : `${rawUrl}/v0/channels`;
        const wsUrl = `${basePath}?apikey=${encodeURIComponent(creds.apiKey)}`;
        const secret = toBase64(`${creds.login}:${creds.password}`);
        tinodeHttpUrlRef.current = creds.tinodeUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:").replace(/\/$/, "");
        tinodeApiKeyRef.current = creds.apiKey;

        ws = new WebSocket(wsUrl);
        wsRef.current = ws;
        let latestSeq = 0;
        let latestPreview = "";
        let subscribed = false;

        ws.onopen = () => {
          reconnectCount = 0;
          ws!.send(JSON.stringify({ hi: { id: "hi", ver: "0.22", ua: "TinodeJS/0.22.0 (Mobile; Expo); vi-VN", lang: "vi-VN" } }));
          if (pingInterval) clearInterval(pingInterval);
          pingInterval = setInterval(() => {
            if (ws?.readyState === WebSocket.OPEN)
              ws.send(JSON.stringify({ note: { topic: topicId, what: "kp" } }));
          }, 25000);
        };

        ws.onmessage = (e) => {
          let pkt: Record<string, unknown>;
          try { pkt = JSON.parse(e.data as string); } catch { return; }

          if (pkt.ctrl) {
            const ctrl = pkt.ctrl as { id: string; code: number; text?: string; params?: Record<string, unknown> };
            const { id, code, params } = ctrl;
            if (code >= 200 && code < 300) {
              if (id === "hi" || id === "") {
                ws!.send(JSON.stringify({ login: { id: "login", scheme: "basic", secret } }));
              } else if (id === "login") {
                const uid = (params?.user as string) ?? "";
                if (uid) {
                  myUidRef.current = uid;
                  // Đảm bảo tên bản thân luôn có trong map (phòng echo từ Tinode có isMe=false)
                  if (creds.displayName) nameMapRef.current.set(uid, creds.displayName);
                  // Chỉ PUT /uid khi /connect chưa trả tinodeUid (user lần đầu đăng nhập Tinode).
                  // Nếu /connect đã trả sẵn tinodeUid thì server đã biết UID → không cần gọi thêm.
                  if (!creds.tinodeUid) {
                    apiPut("/api/mobile/chat/uid", { tinodeUid: uid }).catch(() => {});
                  }
                }
                ws!.send(JSON.stringify({ sub: { id: "sub", topic: topicId, get: { what: "desc sub data", data: { limit: 40 } } } }));
              } else if (id === "sub") {
                subscribed = true;
                if (!cancelled) {
                  setWsStatus("connected");
                  if (latestSeq > 0) {
                    ws!.send(JSON.stringify({ note: { topic: topicId, what: "read", seq: latestSeq } }));
                    markRead(topicId);
                  }
                  if (latestPreview) {
                    updateLastMessage(topicId, latestPreview, latestSeq || undefined);
                  }
                }
              }
            } else if (code >= 400) {
              const msg = code === 401 ? "Sai thông tin đăng nhập" : code === 403 ? "Không có quyền" : code === 503 ? "Chat chưa được cấu hình" : `Lỗi ${code}`;
              if (!cancelled) { setWsError(msg); setWsStatus("error"); }
            }
          }

          if (pkt.meta) {
            const meta = pkt.meta as { sub?: Array<{ user: string; public?: { fn?: string } }> };
            for (const s of (meta.sub ?? [])) if (s.user && s.public?.fn) nameMapRef.current.set(s.user, s.public.fn);
          }

          if (pkt.data) {
            const d = pkt.data as { from: string; ts: string; seq: number; content: unknown; head?: Record<string, unknown> };
            const { from, ts, seq, content, head } = d;
            const isNewMessage = seq > latestSeq;
            if (seq > latestSeq) latestSeq = seq;
            const txt = msgContent(content).trim();
            const attachment = parseAttachment(content, head);
            if (!txt && !attachment) return;
            const preview = txt || (attachment ? "📎 Tệp đính kèm" : "");
            if (preview) {
              if (!subscribed) {
                if (isNewMessage) latestPreview = preview;
              } else {
                // Pass seq so ChatUnreadContext can ignore backfill packets
                // (Tinode sends historical messages oldest→newest; without seq
                // gating the preview would be overwritten by older messages).
                updateLastMessage(topicId, preview, seq);
              }
            }
            const isMe = from === myUidRef.current;
            if (!isMe && !nameMapRef.current.has(from)) scheduleUidLookup(from);

            if (head?.replace) {
              const origSeq = parseInt(String(head.replace), 10);
              if (!isNaN(origSeq)) {
                setMessages(prev => prev.map(m => m.seq === origSeq ? { ...m, content: txt, edited: true } : m));
                return;
              }
            }
            const replySeq = head?.reply != null ? Number(head.reply) : undefined;
            const newMsg: ChatMsg = { seq, from, ts, content: txt, isMe, displayName: nameMapRef.current.get(from), replySeq, edited: false, attachment };
            setMessages(prev => {
              if (prev.some(m => m.seq === seq)) return prev;
              return [...prev, newMsg].sort((a, b) => a.seq - b.seq);
            });
            if (subscribed) setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 80);
          }

          if (pkt.info) {
            const info = pkt.info as { from: string; what: string; seq: number; val?: string };
            if (info.what === "react" && info.val && info.seq) {
              setReactions(prev => {
                const msgR = { ...(prev[info.seq] ?? {}) };
                const uids = [...(msgR[info.val!] ?? [])];
                if (!uids.includes(info.from)) uids.push(info.from);
                return { ...prev, [info.seq]: { ...msgR, [info.val!]: uids } };
              });
            }
          }
        };

        ws.onerror = () => { if (pingInterval) { clearInterval(pingInterval); pingInterval = null; } };
        ws.onclose = () => {
          if (pingInterval) { clearInterval(pingInterval); pingInterval = null; }
          if (cancelled) return;
          if (reconnectCount < MAX_RECONNECTS) {
            reconnectCount++;
            reconnectTimer = setTimeout(connect, Math.min(1500 * reconnectCount, 10000));
          } else { setWsStatus("error"); setWsError("Mất kết nối. Nhấn Thử lại."); }
        };
      } catch { if (!cancelled) { setWsStatus("error"); setWsError("Không thể kết nối."); } }
    };

    setMessages([]); setReactions({});
    connect();
    return () => { cancelled = true; clearTimers(); ws?.close(); wsRef.current = null; };
  }, [selectedConv, scheduleUidLookup]);

  const sendMessage = useCallback(async () => {
    const text = inputText.trim();
    if (!text && !pendingAttachment) return;
    if (!selectedConv) return;
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const topicId = selectedConv.topicId;

    if (pendingAttachment) {
      setUploading(true);
      try {
        // Upload qua backend app thay vì trực tiếp lên Tinode HTTP
        // (tránh vấn đề mobile không kết nối được Tinode server trực tiếp)
        const baseUrl = getCenterUrl() ?? "";
        const token = getAuthToken() ?? "";
        const formData = new FormData();
        if (Platform.OS === "web") {
          const res = await fetch(pendingAttachment.uri);
          const blob = await res.blob();
          formData.append("files", blob, pendingAttachment.name);
        } else {
          formData.append("files", { uri: pendingAttachment.uri, name: pendingAttachment.name, type: pendingAttachment.mime } as unknown as Blob);
        }
        const uploadRes = await fetch(`${baseUrl}/api/upload`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${token}` },
          body: formData,
        });
        if (!uploadRes.ok) throw new Error(`Upload ${uploadRes.status}`);
        const uploadData = await uploadRes.json() as { files: { name: string; url: string; size: number; mimetype: string }[] };
        const uploaded = uploadData.files?.[0];
        if (!uploaded) throw new Error("No file returned");
        // If the server already returned an absolute URL (e.g. direct S3), use it as-is;
        // otherwise prepend the center base URL (relative /api/storage/... paths).
        const fileUrl = uploaded.url.startsWith("http") ? uploaded.url : `${baseUrl}${uploaded.url}`;
        const isImageAttachment = uploaded.mimetype.startsWith("image/");
        const entData = { mime: uploaded.mimetype, name: uploaded.name, ref: fileUrl, size: uploaded.size };
        const content = {
          txt: text || " ",
          // Use IM entity for images so parseAttachment reliably sets isImageMime;
          // use EX for everything else (documents, audio, video handled separately).
          ent: [{ tp: isImageAttachment ? "IM" : "EX", data: entData }],
          fmt: [{ at: -1, len: 1, key: 0 }],
        };
        ws.send(JSON.stringify({ pub: { id: nextId(), topic: topicId, noecho: false, head: { attachments: [fileUrl], mime: uploaded.mimetype }, content } }));
        setPendingAttachment(null);
        setInputText("");
      } catch {
        Alert.alert("Lỗi", "Không thể gửi file đính kèm. Vui lòng thử lại.");
      } finally {
        setUploading(false);
      }
      return;
    }

    if (editMsg) {
      ws.send(JSON.stringify({ pub: { id: nextId(), topic: topicId, noecho: false, head: { replace: String(editMsg.seq) }, content: text } }));
      setEditMsg(null);
    } else {
      const pub: Record<string, unknown> = { id: nextId(), topic: topicId, noecho: false, content: text };
      if (replyTo) { pub.head = { reply: replyTo.seq }; setReplyTo(null); }
      ws.send(JSON.stringify({ pub }));
    }
    setInputText("");
  }, [inputText, selectedConv, editMsg, replyTo, pendingAttachment]);

  const sendReaction = useCallback((msg: ChatMsg, emoji: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !selectedConv) return;
    ws.send(JSON.stringify({ note: { topic: selectedConv.topicId, what: "react", seq: msg.seq, val: emoji } }));
    setReactions(prev => {
      const msgR = { ...(prev[msg.seq] ?? {}) };
      const uids = [...(msgR[emoji] ?? [])];
      if (!uids.includes(myUidRef.current)) uids.push(myUidRef.current);
      return { ...prev, [msg.seq]: { ...msgR, [emoji]: uids } };
    });
  }, [selectedConv]);

  const pickImage = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") { Alert.alert("Quyền truy cập", "Cần cấp quyền truy cập thư viện ảnh."); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.All, quality: 0.85, allowsEditing: false });
    if (!result.canceled && result.assets.length > 0) {
      const asset = result.assets[0];
      setPendingAttachment({ uri: asset.uri, name: asset.fileName || `photo_${Date.now()}.jpg`, mime: asset.mimeType || "image/jpeg", size: asset.fileSize ?? undefined });
    }
  }, []);

  const pickFile = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
      if (!result.canceled && result.assets.length > 0) {
        const asset = result.assets[0];
        setPendingAttachment({ uri: asset.uri, name: asset.name, mime: asset.mimeType || "application/octet-stream", size: asset.size ?? undefined });
      }
    } catch { }
  }, []);

  const showAttachPicker = useCallback(() => {
    Alert.alert("Đính kèm", "Chọn loại file", [
      { text: "Ảnh / Video", onPress: pickImage },
      { text: "File tài liệu", onPress: pickFile },
      { text: "Hủy", style: "cancel" },
    ]);
  }, [pickImage, pickFile]);

  const handleLongPress = useCallback((msg: ChatMsg) => setMenuMsg(msg), []);
  const closeMenu = () => { setMenuMsg(null); setEmojiForMsg(null); };

  const convTypeIcon = (type: ConvItem["type"]): React.ComponentProps<typeof Feather>["name"] => {
    if (type === "dm") return "user";
    if (type === "group") return "users";
    return "book-open";
  };

  if (selectedConv) {
    const isInitialLoad = wsStatus === "connecting" && messages.length === 0;
    const isHardError = wsStatus === "error" && messages.length === 0;
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={[styles.chatHeader, { paddingTop: topPad, backgroundColor: colors.gradientStart }]}>
          <TouchableOpacity onPress={() => { wsRef.current?.close(); setSelectedConv(null); setReplyTo(null); setEditMsg(null); setShowAddMember(false); setAddMemberQ(""); setAddMemberResults([]); }} style={[styles.backBtn, { backgroundColor: "rgba(30,27,75,0.1)" }]}>
            <Feather name="arrow-left" size={22} color="#1e1b4b" />
          </TouchableOpacity>
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(30,27,75,0.12)", alignItems: "center", justifyContent: "center" }}>
            <Feather name={convTypeIcon(selectedConv.type)} size={16} color="#1e1b4b" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.chatRoomName} numberOfLines={1}>{selectedConv.title}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <View style={[styles.statusDot, { backgroundColor: wsStatus === "connected" ? "#4ade80" : wsStatus === "connecting" ? "#fbbf24" : "#f87171" }]} />
              <Text style={styles.chatStatus}>{wsStatus === "connected" ? "Đã kết nối" : wsStatus === "connecting" ? "Đang kết nối..." : "Mất kết nối"}</Text>
            </View>
          </View>
          {selectedConv.type === "group" && (
            <>
              <TouchableOpacity
                onPress={() => { fetchGroupDetail(selectedConv.topicId); setShowGroupDetail(true); }}
                style={[styles.backBtn, { backgroundColor: "rgba(30,27,75,0.1)" }]}
              >
                <Feather name="info" size={18} color="#1e1b4b" />
              </TouchableOpacity>
              {(canAddMember || groups.find(g => g.topicId === selectedConv.topicId)?.isCreator) && (
                <TouchableOpacity onPress={async () => { await fetchGroupDetail(selectedConv.topicId); setShowAddMember(true); }} style={[styles.backBtn, { backgroundColor: "rgba(30,27,75,0.1)" }]}>
                  <Feather name="user-plus" size={18} color="#1e1b4b" />
                </TouchableOpacity>
              )}
            </>
          )}
        </View>

        {isInitialLoad ? (
          <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /><Text style={[styles.statusText, { color: colors.mutedForeground }]}>Đang kết nối chat...</Text></View>
        ) : isHardError ? (
          <View style={styles.center}>
            <Feather name="wifi-off" size={40} color={colors.destructive} />
            <Text style={[styles.statusText, { color: colors.destructive }]}>{wsError || "Không thể kết nối"}</Text>
            <TouchableOpacity onPress={() => setSelectedConv({ ...selectedConv })} style={[styles.retryBtn, { backgroundColor: colors.primary }]}>
              <Text style={{ color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" }}>Thử lại</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={0}>
            {wsStatus === "connecting" && messages.length > 0 && (
              <View style={[styles.reconnectBanner, { backgroundColor: colors.muted }]}>
                <ActivityIndicator size="small" color={colors.primary} style={{ marginRight: 8 }} />
                <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular" }}>Đang kết nối lại...</Text>
              </View>
            )}
            {wsStatus === "error" && messages.length > 0 && (
              <TouchableOpacity onPress={() => setSelectedConv({ ...selectedConv })} style={[styles.reconnectBanner, { backgroundColor: "#fef2f2" }]}>
                <Feather name="wifi-off" size={14} color={colors.destructive} style={{ marginRight: 6 }} />
                <Text style={{ color: colors.destructive, fontSize: 12, fontFamily: "Inter_500Medium" }}>Mất kết nối — Nhấn để thử lại</Text>
              </TouchableOpacity>
            )}
            <FlatList
              ref={flatRef}
              data={messages}
              keyExtractor={m => String(m.seq)}
              renderItem={({ item }) => <MessageBubble msg={item} msgs={messages} reactions={reactions} colors={colors} onLongPress={handleLongPress} tinodeHttpUrl={tinodeHttpUrlRef.current} tinodeApiKey={tinodeApiKeyRef.current} onOpenDoc={setActiveDocFile} />}
              contentContainerStyle={[styles.messagesList, { paddingBottom: 12 }]}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <View style={{ alignItems: "center", paddingTop: 60, gap: 8 }}>
                  <Feather name="message-circle" size={36} color={colors.mutedForeground} />
                  <Text style={{ color: colors.mutedForeground, fontSize: 14, fontFamily: "Inter_400Regular" }}>Chưa có tin nhắn nào</Text>
                </View>
              }
            />
            {(replyTo || editMsg) && (
              <View style={[styles.replyBar, { backgroundColor: colors.muted, borderTopColor: colors.border }]}>
                <View style={[styles.replyBarAccent, { backgroundColor: colors.primary }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.replyBarLabel, { color: colors.primary }]}>{editMsg ? "Chỉnh sửa tin nhắn" : `Trả lời ${replyTo?.displayName || replyTo?.from || ""}`}</Text>
                  <Text style={[styles.replyBarText, { color: colors.mutedForeground }]} numberOfLines={1}>{editMsg ? editMsg.content : replyTo?.content}</Text>
                </View>
                <TouchableOpacity onPress={() => { setReplyTo(null); setEditMsg(null); setInputText(""); }}>
                  <Feather name="x" size={18} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>
            )}
            {pendingAttachment && (
              <View style={[styles.attachPreview, { backgroundColor: colors.muted, borderTopColor: colors.border }]}>
                <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10 }}>
                  {isImageMime(pendingAttachment.mime) ? (
                    <Image source={{ uri: pendingAttachment.uri }} style={styles.attachPreviewImage} />
                  ) : (
                    <View style={[styles.attachPreviewIcon, { backgroundColor: colors.card }]}>
                      <Feather name="file" size={20} color={colors.primary} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.attachPreviewName, { color: colors.foreground }]} numberOfLines={1}>{pendingAttachment.name}</Text>
                    {pendingAttachment.size != null && <Text style={[styles.attachPreviewSize, { color: colors.mutedForeground }]}>{formatBytes(pendingAttachment.size)}</Text>}
                  </View>
                </View>
                <TouchableOpacity onPress={() => setPendingAttachment(null)}>
                  <Feather name="x" size={18} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>
            )}
            <View style={[styles.inputBar, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: insets.bottom || bottomPad + 8 }]}>
              {!editMsg && (
                <TouchableOpacity onPress={showAttachPicker} style={[styles.attachBtn, { backgroundColor: colors.muted }]}>
                  <Feather name="paperclip" size={18} color={colors.mutedForeground} />
                </TouchableOpacity>
              )}
              <TextInput
                ref={inputRef}
                style={[styles.msgInput, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]}
                placeholder={editMsg ? "Chỉnh sửa..." : pendingAttachment ? "Thêm chú thích (tuỳ chọn)..." : "Nhập tin nhắn..."}
                placeholderTextColor={colors.mutedForeground}
                value={inputText}
                onChangeText={setInputText}
                multiline maxLength={500}
                onSubmitEditing={Platform.OS === "web" ? sendMessage : undefined}
              />
              <TouchableOpacity onPress={sendMessage} disabled={(!inputText.trim() && !pendingAttachment) || uploading} style={[styles.sendBtn, { backgroundColor: colors.primary, opacity: (inputText.trim() || pendingAttachment) && !uploading ? 1 : 0.4 }]}>
                {uploading ? <ActivityIndicator size="small" color="#fff" /> : <Feather name={editMsg ? "check" : "send"} size={18} color="#fff" />}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        )}

        <Modal visible={!!menuMsg && !emojiForMsg} transparent animationType="fade" onRequestClose={closeMenu}>
          <Pressable style={styles.menuOverlay} onPress={closeMenu}>
            <Pressable style={[styles.menuBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.menuMsgPreview, { color: colors.mutedForeground }]} numberOfLines={2}>{menuMsg?.content}</Text>
              <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
              <TouchableOpacity style={styles.menuItem} onPress={() => { setReplyTo(menuMsg!); setEditMsg(null); closeMenu(); setTimeout(() => inputRef.current?.focus(), 100); }}>
                <Feather name="corner-up-left" size={18} color={colors.primary} /><Text style={[styles.menuItemText, { color: colors.foreground }]}>Trả lời</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuItem} onPress={() => { setEmojiForMsg(menuMsg); setMenuMsg(null); }}>
                <Text style={{ fontSize: 18 }}>😊</Text><Text style={[styles.menuItemText, { color: colors.foreground }]}>Biểu cảm</Text>
              </TouchableOpacity>
              {menuMsg?.isMe && (
                <TouchableOpacity style={styles.menuItem} onPress={() => { setEditMsg(menuMsg!); setReplyTo(null); setInputText(menuMsg!.content); closeMenu(); setTimeout(() => inputRef.current?.focus(), 100); }}>
                  <Feather name="edit-2" size={18} color={colors.primary} /><Text style={[styles.menuItemText, { color: colors.foreground }]}>Chỉnh sửa</Text>
                </TouchableOpacity>
              )}
            </Pressable>
          </Pressable>
        </Modal>

        <Modal visible={!!emojiForMsg} transparent animationType="fade" onRequestClose={closeMenu}>
          <Pressable style={styles.menuOverlay} onPress={closeMenu}>
            <Pressable style={[styles.emojiBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {EMOJIS.map(e => (
                <TouchableOpacity key={e} style={styles.emojiBtn} onPress={() => { if (emojiForMsg) sendReaction(emojiForMsg, e); closeMenu(); }}>
                  <Text style={styles.emojiText}>{e}</Text>
                </TouchableOpacity>
              ))}
            </Pressable>
          </Pressable>
        </Modal>

        <Modal visible={showGroupDetail} transparent animationType="slide" onRequestClose={() => setShowGroupDetail(false)}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalSheet, { backgroundColor: colors.background }]}>
              <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.modalTitle, { color: colors.foreground }]} numberOfLines={1}>{groupDetail?.name ?? "Chi tiết nhóm"}</Text>
                  {groupDetail && <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 2 }}>{groupDetail.memberCount} thành viên</Text>}
                </View>
                <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                  {groupDetail?.isCreator && (
                    <TouchableOpacity onPress={() => { setRenameGroupName(groupDetail.name); setShowRenameGroup(true); }} style={styles.backBtn}>
                      <Feather name="edit-2" size={16} color="#fff" />
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity onPress={() => setShowGroupDetail(false)}>
                    <Feather name="x" size={22} color={colors.mutedForeground} />
                  </TouchableOpacity>
                </View>
              </View>
              {loadingGroupDetail ? (
                <View style={{ alignItems: "center", paddingVertical: 40 }}>
                  <ActivityIndicator size="large" color={colors.primary} />
                </View>
              ) : (
                <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
                  {(groupDetail?.members ?? []).map(member => (
                    <View key={member.userId} style={[styles.roomItem, { borderBottomColor: colors.border, backgroundColor: colors.background }]}>
                      <View style={[styles.dmAvatar, { backgroundColor: member.isCreator ? colors.primary : "#8b5cf6" }]}>
                        <Text style={styles.dmAvatarText}>{member.displayName[0]?.toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.roomName, { color: colors.foreground }]}>{member.displayName}</Text>
                        {member.isCreator && <Text style={[styles.roomSub, { color: colors.primary }]}>Người tạo nhóm</Text>}
                      </View>
                      {(canRemoveMember || groupDetail?.isCreator) && !member.isCreator && (
                        <TouchableOpacity onPress={() => removeMember(groupDetail!.topicId, member.userId)} style={{ padding: 8 }}>
                          <Feather name="user-minus" size={18} color={colors.destructive} />
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                  <View style={{ height: 20 }} />
                </ScrollView>
              )}
              <View style={[styles.modalFooter, { borderTopColor: colors.border, paddingBottom: insets.bottom || 16, gap: 10 }]}>
                {(canAddMember || groupDetail?.isCreator) && (
                  <TouchableOpacity onPress={() => { setShowGroupDetail(false); setShowAddMember(true); }} style={[styles.modalBtn, { backgroundColor: colors.primary }]}>
                    <Text style={styles.modalBtnText}>+ Thêm thành viên</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        </Modal>

        <Modal visible={showRenameGroup} transparent animationType="slide" onRequestClose={() => { setShowRenameGroup(false); setRenameGroupName(""); }}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalSheet, { backgroundColor: colors.background, minHeight: 240 }]}>
              <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>Đổi tên nhóm</Text>
                <TouchableOpacity onPress={() => { setShowRenameGroup(false); setRenameGroupName(""); }}>
                  <Feather name="x" size={22} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>TÊN NHÓM MỚI *</Text>
              <TextInput
                style={[styles.fieldInput, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
                placeholder="Nhập tên nhóm..."
                placeholderTextColor={colors.mutedForeground}
                value={renameGroupName}
                onChangeText={setRenameGroupName}
                autoFocus
                maxLength={100}
              />
              <View style={[styles.modalFooter, { borderTopColor: colors.border, paddingBottom: insets.bottom || 16, marginTop: 16 }]}>
                <TouchableOpacity
                  onPress={renameGroup}
                  disabled={!renameGroupName.trim() || renamingGroup}
                  style={[styles.modalBtn, { backgroundColor: colors.primary, opacity: renameGroupName.trim() ? 1 : 0.4 }]}
                >
                  {renamingGroup ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.modalBtnText}>Lưu tên</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <Modal visible={showAddMember} transparent animationType="slide" onRequestClose={() => { setShowAddMember(false); setAddMemberQ(""); setAddMemberResults([]); }}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalSheet, { backgroundColor: colors.background }]}>
              <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>Thêm thành viên</Text>
                <TouchableOpacity onPress={() => { setShowAddMember(false); setAddMemberQ(""); setAddMemberResults([]); }}>
                  <Feather name="x" size={22} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>
              <View style={[styles.searchBar, { backgroundColor: colors.muted, borderColor: colors.border, marginHorizontal: 16, marginTop: 12 }]}>
                <Feather name="search" size={14} color={colors.mutedForeground} />
                <TextInput
                  style={[styles.searchInput, { color: colors.foreground }]}
                  placeholder="Tìm theo tên..."
                  placeholderTextColor={colors.mutedForeground}
                  value={addMemberQ}
                  onChangeText={q => {
                    setAddMemberQ(q);
                    if (addMemberTimer.current) clearTimeout(addMemberTimer.current);
                    addMemberTimer.current = setTimeout(() => searchAddMembers(q), 400);
                  }}
                  autoFocus
                />
                {addMemberSearching && <ActivityIndicator size="small" color={colors.primary} />}
              </View>
              <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
                {addMemberResults.length === 0 && addMemberQ.trim() !== "" && !addMemberSearching && (
                  <View style={[styles.center, { marginTop: 32 }]}>
                    <Feather name="user-x" size={32} color={colors.mutedForeground} />
                    <Text style={[styles.emptyTitle, { color: colors.mutedForeground }]}>Không tìm thấy</Text>
                  </View>
                )}
                {addMemberResults.map(u => (
                  <TouchableOpacity key={u.userId} onPress={() => addMemberToGroup(u.userId, u.displayName)} disabled={addingMember} style={[styles.roomItem, { borderBottomColor: colors.border, backgroundColor: colors.background }]}>
                    <View style={[styles.dmAvatar, { backgroundColor: u.role === "staff" || u.role === "teacher" ? "#f59e0b" : colors.primary }]}>
                      <Text style={styles.dmAvatarText}>{u.displayName[0]?.toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.roomName, { color: colors.foreground }]}>{u.displayName}</Text>
                      <Text style={[styles.roomSub, { color: colors.mutedForeground }]}>{roleLabel(u.role)}</Text>
                    </View>
                    {addingMember ? <ActivityIndicator size="small" color={colors.primary} /> : <Feather name="user-plus" size={18} color={colors.primary} />}
                  </TouchableOpacity>
                ))}
                <View style={{ height: insets.bottom + 20 }} />
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* ── Doc viewer — phải nằm trong nhánh selectedConv để hiển thị đúng màn hình ── */}
        {activeDocFile && (
          <DocViewerModal file={activeDocFile} onClose={() => setActiveDocFile(null)} />
        )}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.header, { paddingTop: topPad, backgroundColor: colors.gradientStart }]}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={[styles.headerTitle, { marginBottom: 0 }]}>Tin nhắn</Text>
          {canCreateGroup && (
            <TouchableOpacity
              onPress={() => setShowNewChat(true)}
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(30,27,75,0.1)", alignItems: "center", justifyContent: "center" }}
            >
              <Feather name="edit" size={18} color="#1e1b4b" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Danh sách trò chuyện — trải phẳng: nhóm và chat cá nhân (DM) hiển thị chung một danh sách,
          vì GET /api/mobile/chat/groups nay trả về cả kênh DM (là chat_groups có is_direct_message=true). */}
      <View style={{ flex: 1 }}>
        {loadingGroups ? (
          <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
        ) : groupError ? (
          <View style={styles.center}><Feather name="alert-circle" size={36} color={colors.destructive} /><Text style={[styles.statusText, { color: colors.destructive }]}>{groupError}</Text></View>
        ) : (() => {
          const q = groupSearch.trim().toLowerCase();
          // Nguồn duy nhất: GET /api/mobile/chat/groups — đã bao gồm cả nhóm + DM,
          // tên DM được server resolve sẵn theo đúng chiều người xem.
          // Không hiển thị thêm topic từ Tinode subscription (knownTopics) vì những
          // topic không có trong /groups là kênh cũ đã bị deprecated (kênh lớp tự động).
          const merged = [...groups.map(g => {
            const displayName = g.name || "Tin nhắn riêng";
            return { topicId: g.topicId, name: displayName, sub: g.memberCount != null ? `${g.memberCount} thành viên` : "", groupId: g.id ?? g.topicId, isCreator: g.isCreator };
          })]
            .filter(g => !q || g.name.toLowerCase().includes(q))
            .sort((a, b) => {
            const ta = topicTouched.get(a.topicId) ?? "";
            const tb = topicTouched.get(b.topicId) ?? "";
            if (ta && tb) return tb.localeCompare(ta);
            if (ta) return -1;
            if (tb) return 1;
            return 0;
          });

          return (
            <FlatList
              data={merged}
              keyExtractor={item => item.topicId}
              contentContainerStyle={{ paddingBottom: 100 + bottomPad, flexGrow: 1 }}
              refreshControl={<RefreshControl refreshing={refreshingGroups} onRefresh={() => { setRefreshingGroups(true); fetchGroups(true); }} tintColor={colors.primary} colors={[colors.primary]} progressBackgroundColor={colors.card} />}
              ListHeaderComponent={
                <View style={{ paddingBottom: 4 }}>
                  {canCreateGroup && (
                    <TouchableOpacity onPress={() => setShowCreateGroup(true)} style={[styles.createBtn, { backgroundColor: colors.primary }]}>
                      <Feather name="plus" size={16} color="#fff" />
                      <Text style={styles.createBtnText}>Tạo nhóm mới</Text>
                    </TouchableOpacity>
                  )}
                  <View style={[styles.listSearchBar, { backgroundColor: colors.muted, borderColor: colors.border, marginHorizontal: 16, marginTop: canCreateGroup ? 4 : 12, marginBottom: 4 }]}>
                    <Feather name="search" size={15} color={colors.mutedForeground} />
                    <TextInput
                      style={[styles.listSearchInput, { color: colors.foreground }]}
                      placeholder="Tìm cuộc trò chuyện..."
                      placeholderTextColor={colors.mutedForeground}
                      value={groupSearch}
                      onChangeText={setGroupSearch}
                      returnKeyType="search"
                      clearButtonMode="while-editing"
                    />
                    {groupSearch.length > 0 && (
                      <TouchableOpacity onPress={() => setGroupSearch("")}>
                        <Feather name="x-circle" size={15} color={colors.mutedForeground} />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              }
              ListEmptyComponent={
                <View style={[styles.center, { marginTop: 40 }]}>
                  <Feather name="message-circle" size={44} color={colors.mutedForeground} />
                  <Text style={[styles.emptyTitle, { color: colors.mutedForeground }]}>
                    {q ? "Không tìm thấy cuộc trò chuyện nào" : "Bạn chưa có cuộc trò chuyện nào"}
                  </Text>
                  {!q && <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>Nhấn biểu tượng bút ở trên để bắt đầu chat với ai đó</Text>}
                </View>
              }
              renderItem={({ item }) => {
                const unread = unreadCounts.get(item.topicId) ?? 0;
                const lastMsg = lastMessages.get(item.topicId);
                const isDm = dmTopicIdsRef.current.has(item.topicId) || item.topicId.startsWith("usr");
                return (
                  <TouchableOpacity
                    onPress={() => {
                      if (unread > 0) markRead(item.topicId);
                      setSelectedConv({ topicId: item.topicId, title: item.name, type: isDm ? "dm" : "group", groupId: item.groupId });
                    }}
                    style={[styles.roomItem, { borderBottomColor: colors.border, backgroundColor: colors.background }]}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.roomAvatar, { backgroundColor: isDm ? "#f59e0b" : "#8b5cf6" }]}><Feather name={isDm ? "user" : "users"} size={18} color="#fff" /></View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.roomName, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>{item.name}</Text>
                      <Text style={[styles.roomSub, { color: unread > 0 ? colors.foreground : colors.mutedForeground, fontFamily: unread > 0 ? "Inter_700Bold" : "Inter_400Regular" }]} numberOfLines={1}>
                        {lastMsg || (isDm ? "" : item.sub)}
                      </Text>
                    </View>
                    {unread > 0 ? (
                      <View style={[styles.unreadBadge, { backgroundColor: colors.destructive }]}>
                        <Text style={styles.unreadBadgeText}>{unread > 99 ? "99+" : String(unread)}</Text>
                      </View>
                    ) : (
                      <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          );
        })()}
      </View>

      <Modal visible={showNewChat} animationType="slide" onRequestClose={closeNewChat}>
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={[styles.header, { paddingTop: topPad, backgroundColor: colors.gradientStart, flexDirection: "row", alignItems: "center", gap: 12 }]}>
            <TouchableOpacity onPress={closeNewChat} style={[styles.backBtn, { backgroundColor: "rgba(30,27,75,0.1)" }]}>
              <Feather name="arrow-left" size={22} color="#1e1b4b" />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { marginBottom: 0 }]}>Tin nhắn mới</Text>
          </View>
          <View style={[styles.searchBar, { backgroundColor: colors.muted, borderColor: colors.border }]}>
            <Feather name="search" size={16} color={colors.mutedForeground} />
            <TextInput
              autoFocus
              style={[styles.searchInput, { color: colors.foreground }]}
              placeholder="Tìm theo tên..."
              placeholderTextColor={colors.mutedForeground}
              value={dmQuery}
              onChangeText={q => {
                setDmQuery(q);
                if (dmTimer.current) clearTimeout(dmTimer.current);
                dmTimer.current = setTimeout(() => searchUsers(q), 400);
              }}
            />
            {dmQuery ? <TouchableOpacity onPress={() => { setDmQuery(""); setDmResults([]); }}><Feather name="x" size={16} color={colors.mutedForeground} /></TouchableOpacity> : null}
          </View>

          {dmSearching ? (
            <View style={styles.center}><ActivityIndicator size="small" color={colors.primary} /></View>
          ) : (
            <FlatList
              data={dmResults}
              keyExtractor={u => u.userId}
              contentContainerStyle={{ paddingBottom: 100 + bottomPad, flexGrow: 1 }}
              ListEmptyComponent={
                <View style={[styles.center, { marginTop: 40 }]}>
                  <Feather name={dmQuery ? "user-x" : "search"} size={36} color={colors.mutedForeground} />
                  <Text style={[styles.emptyTitle, { color: colors.mutedForeground }]}>
                    {dmQuery ? "Không tìm thấy" : "Nhập tên để tìm người dùng"}
                  </Text>
                  {dmQuery && <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>Thử tìm với từ khóa khác</Text>}
                </View>
              }
              renderItem={({ item }) => (
                <TouchableOpacity onPress={() => openDM(item)} style={[styles.roomItem, { borderBottomColor: colors.border, backgroundColor: colors.background }]} activeOpacity={0.7}>
                  <View style={[styles.dmAvatar, { backgroundColor: item.role === "staff" || item.role === "teacher" ? "#f59e0b" : colors.primary }]}>
                    <Text style={styles.dmAvatarText}>{item.displayName[0]?.toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.roomName, { color: colors.foreground }]}>{item.displayName}</Text>
                    <Text style={[styles.roomSub, { color: colors.mutedForeground }]}>{roleLabel(item.role)}</Text>
                  </View>
                  <Feather name="message-circle" size={18} color={colors.primary} />
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </Modal>

      {/* ── Create-group: full-page overlay ── */}
      {showCreateGroup && (
        <View style={[styles.cgFullPage, { backgroundColor: colors.background }]}>
          {/* Header */}
          <View
            style={[styles.cgPageHeader, { paddingTop: topPad, backgroundColor: colors.primary }]}
          >
            <TouchableOpacity onPress={resetCreateGroupDialog} style={styles.backBtn}>
              <Feather name="arrow-left" size={20} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.cgPageTitle}>Tạo nhóm mới</Text>
            <TouchableOpacity
              onPress={createGroup}
              disabled={!newGroupName.trim() || creatingGroup}
              style={[styles.cgPageActionBtn, { opacity: newGroupName.trim() && !creatingGroup ? 1 : 0.4 }]}
            >
              {creatingGroup
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.cgPageActionText}>Tạo</Text>}
            </TouchableOpacity>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: (insets.bottom || 16) + 24 }}
          >
            {/* ── Tên nhóm ── */}
            <View style={[styles.cgCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.cgCardLabel, { color: colors.mutedForeground }]}>
                Tên nhóm <Text style={{ color: "#ef4444" }}>*</Text>
              </Text>
              <TextInput
                style={[styles.cgInput, { color: colors.foreground }]}
                placeholder="Nhập tên nhóm..."
                placeholderTextColor={colors.mutedForeground}
                value={newGroupName}
                onChangeText={setNewGroupName}
                maxLength={80}
                autoFocus
              />
              <Text style={[styles.cgCharCount, { color: colors.mutedForeground }]}>{newGroupName.length}/80</Text>
            </View>

            {/* ── Từ lớp học ── */}
            <View style={{ marginHorizontal: 16, marginTop: 20 }}>
              <Text style={[styles.cgSectionTitle, { color: colors.foreground }]}>
                Từ lớp học{" "}
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground }}>(tuỳ chọn)</Text>
              </Text>

              {selectedClass ? (
                /* Lớp đã chọn */
                <View style={[styles.cgClassCard, { backgroundColor: colors.primary + "18", borderColor: colors.primary + "44" }]}>
                  <View style={[styles.cgClassIcon, { backgroundColor: colors.primary }]}>
                    <Feather name="book-open" size={15} color="#fff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.roomName, { color: colors.foreground }]}>{selectedClass.name}</Text>
                    {selectedClass.classCode
                      ? <Text style={[styles.roomSub, { color: colors.mutedForeground }]}>{selectedClass.classCode}</Text>
                      : null}
                  </View>
                  <TouchableOpacity
                    onPress={() => { setSelectedClass(null); setClassMembers([]); setExistingClassGroups([]); setClassSearchQ(""); setClassSearchResults([]); }}
                    style={{ padding: 6 }}
                  >
                    <Feather name="x-circle" size={18} color={colors.mutedForeground} />
                  </TouchableOpacity>
                </View>
              ) : (
                /* Ô tìm kiếm lớp */
                <>
                  <View style={[styles.cgSearchBox, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                    <Feather name="search" size={14} color={colors.mutedForeground} />
                    <TextInput
                      style={[styles.cgSearchInput, { color: colors.foreground }]}
                      placeholder="Tìm tên lớp học..."
                      placeholderTextColor={colors.mutedForeground}
                      value={classSearchQ}
                      onChangeText={q => {
                        setClassSearchQ(q);
                        if (classSearchTimer.current) clearTimeout(classSearchTimer.current);
                        if (q.trim()) {
                          classSearchTimer.current = setTimeout(() => searchClasses(q), 400);
                        } else {
                          setClassSearchResults([]);
                        }
                      }}
                    />
                    {classSearching
                      ? <ActivityIndicator size="small" color={colors.primary} />
                      : classSearchQ.length > 0
                        ? <TouchableOpacity onPress={() => { if (classSearchTimer.current) clearTimeout(classSearchTimer.current); setClassSearchQ(""); setClassSearchResults([]); }}>
                            <Feather name="x" size={14} color={colors.mutedForeground} />
                          </TouchableOpacity>
                        : null}
                  </View>

                  {/* Kết quả tìm kiếm — inline, không dùng absolute */}
                  {classSearchResults.map(c => (
                    <TouchableOpacity
                      key={c.id}
                      onPress={() => {
                        setSelectedClass(c);
                        setClassSearchQ("");
                        setClassSearchResults([]);
                        if (!newGroupName.trim()) setNewGroupName(c.name);
                        fetchClassMembers(c.id);
                        fetchClassGroups(c.id);
                      }}
                      style={[styles.cgMemberResult, { borderBottomColor: colors.border }]}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.cgClassIcon, { backgroundColor: colors.primary, width: 36, height: 36, borderRadius: 10 }]}>
                        <Feather name="book-open" size={15} color="#fff" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.roomName, { color: colors.foreground }]}>{c.name}</Text>
                        {c.classCode
                          ? <Text style={[styles.roomSub, { color: colors.mutedForeground }]}>{c.classCode}</Text>
                          : null}
                      </View>
                      <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                    </TouchableOpacity>
                  ))}
                  {!classSearching && classSearchQ.trim().length > 0 && classSearchResults.length === 0 && (
                    <Text style={{ fontSize: 12, color: classSearchError ? "#ef4444" : colors.mutedForeground, marginTop: 8 }}>
                      {classSearchError ? `Lỗi: ${classSearchError}` : "Không tìm thấy lớp nào"}
                    </Text>
                  )}
                </>
              )}
            </View>

            {/* Class selected — warning + member preview */}
            {selectedClass && (
              <View style={{ paddingHorizontal: 16, marginTop: 10 }}>
                {existingClassGroups.length > 0 && (
                  <View style={[styles.cgWarning, { marginBottom: 10 }]}>
                    <Feather name="alert-triangle" size={14} color="#d97706" style={{ marginTop: 1 }} />
                    <Text style={styles.cgWarningText}>{`Lớp đã có nhóm: ${existingClassGroups.map(g => g.name).join(", ")}. Vẫn muốn tạo thêm?`}</Text>
                  </View>
                )}
                {loadingClassMembers ? (
                  <View style={{ alignItems: "center", paddingVertical: 12 }}>
                    <ActivityIndicator size="small" color={colors.primary} />
                  </View>
                ) : classMembers.length > 0 ? (
                  <>
                    <Text style={[styles.cgMemberCount, { color: colors.mutedForeground }]}>
                      {classMembers.length} thành viên sẽ được thêm tự động
                    </Text>
                    <View style={styles.cgChipRow}>
                      {classMembers.slice(0, 10).map(m => (
                        <View key={m.userId} style={[styles.memberChip, { backgroundColor: m.role === "staff" ? "#f59e0b" : colors.primary }]}>
                          <Text style={styles.memberChipText}>{m.displayName}</Text>
                        </View>
                      ))}
                      {classMembers.length > 10 && (
                        <View style={[styles.memberChip, { backgroundColor: colors.muted }]}>
                          <Text style={[styles.memberChipText, { color: colors.mutedForeground }]}>+{classMembers.length - 10}</Text>
                        </View>
                      )}
                    </View>
                  </>
                ) : null}
              </View>
            )}

            {/* ── Thành viên: inline search ── */}
            {!selectedClass && (
              <View style={{ paddingHorizontal: 16, marginTop: 20 }}>
                <Text style={[styles.cgSectionTitle, { color: colors.foreground }]}>Thành viên</Text>

                {/* Selected chips */}
                {selectedMembers.length > 0 && (
                  <View style={[styles.cgChipRow, { marginBottom: 10 }]}>
                    {selectedMembers.map(m => (
                      <View key={m.userId} style={[styles.memberChip, { backgroundColor: colors.primary }]}>
                        <Text style={styles.memberChipText}>{m.displayName}</Text>
                        <TouchableOpacity onPress={() => setSelectedMembers(prev => prev.filter(x => x.userId !== m.userId))}>
                          <Feather name="x" size={11} color="#fff" />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}

                {/* Search input */}
                <View style={[styles.cgSearchBox, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                  <Feather name="search" size={14} color={colors.mutedForeground} />
                  <TextInput
                    style={[styles.cgSearchInput, { color: colors.foreground }]}
                    placeholder="Tìm thành viên theo tên..."
                    placeholderTextColor={colors.mutedForeground}
                    value={groupMemberQ}
                    onChangeText={q => {
                      setGroupMemberQ(q);
                      if (groupMemberTimer.current) clearTimeout(groupMemberTimer.current);
                      if (q.trim()) {
                        groupMemberTimer.current = setTimeout(() => searchGroupMembers(q), 300);
                      } else {
                        setGroupMemberResults([]);
                      }
                    }}
                  />
                  {groupMemberSearching
                    ? <ActivityIndicator size="small" color={colors.primary} />
                    : groupMemberQ.length > 0
                      ? <TouchableOpacity onPress={() => { if (groupMemberTimer.current) clearTimeout(groupMemberTimer.current); setGroupMemberQ(""); setGroupMemberResults([]); }}>
                          <Feather name="x" size={14} color={colors.mutedForeground} />
                        </TouchableOpacity>
                      : null}
                </View>

                {/* Inline results */}
                {!groupMemberQ.trim() && (
                  <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 8 }}>Nhập tên để tìm kiếm thành viên</Text>
                )}
                {!groupMemberSearching && groupMemberQ.trim().length > 0 && groupMemberResults.length === 0 && (
                  <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 8 }}>Không tìm thấy người dùng nào</Text>
                )}
                {groupMemberResults.map(u => {
                  const sel = selectedMembers.some(m => m.userId === u.userId);
                  return (
                    <TouchableOpacity
                      key={u.userId}
                      onPress={() => setSelectedMembers(prev => sel ? prev.filter(m => m.userId !== u.userId) : [...prev, u])}
                      style={[styles.cgMemberResult, { borderBottomColor: colors.border, backgroundColor: sel ? colors.primary + "12" : "transparent" }]}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.roomAvatar, { backgroundColor: sel ? colors.primary : colors.muted, width: 38, height: 38, borderRadius: 19 }]}>
                        {sel
                          ? <Feather name="check" size={16} color="#fff" />
                          : <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_700Bold", fontSize: 14 }}>{u.displayName[0]?.toUpperCase()}</Text>}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.roomName, { color: colors.foreground, fontSize: 14 }]}>{u.displayName}</Text>
                        <Text style={[styles.roomSub, { color: colors.mutedForeground }]}>{roleLabel(u.role)}</Text>
                      </View>
                      {sel && <Feather name="check-circle" size={18} color={colors.primary} />}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingBottom: 0 },
  headerTitle: { color: "#1e1b4b", fontSize: 22, fontFamily: "Inter_700Bold", marginBottom: 12 },
  tabBar: { flexDirection: "row", gap: 4, marginBottom: 0 },
  tab: { flex: 1, alignItems: "center", paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabActive: { borderBottomColor: "#1e1b4b" },
  tabText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  tabTextActive: { color: "#1e1b4b" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  statusText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  emptyTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", textAlign: "center", marginTop: 8 },
  emptySubtitle: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", opacity: 0.75 },
  sectionLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", paddingHorizontal: 16, paddingVertical: 10, textTransform: "uppercase", letterSpacing: 0.5 },
  retryBtn: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: 10, marginTop: 4 },
  createBtn: { flexDirection: "row", alignItems: "center", gap: 8, margin: 16, padding: 12, borderRadius: 12, justifyContent: "center" },
  createBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  roomItem: { flexDirection: "row", alignItems: "center", padding: 16, borderBottomWidth: 1, gap: 12 },
  roomAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  roomName: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  roomSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  searchBar: { flexDirection: "row", alignItems: "center", margin: 16, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, borderWidth: 1, gap: 8 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", padding: 0 },
  chatHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 14, gap: 10 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  chatRoomName: { color: "#1e1b4b", fontSize: 15, fontFamily: "Inter_700Bold" },
  chatStatus: { color: "rgba(30,27,75,0.65)", fontSize: 11, fontFamily: "Inter_400Regular" },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  reconnectBanner: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 6, paddingHorizontal: 12 },
  messagesList: { padding: 14, gap: 2 },
  bubbleWrap: { marginBottom: 10, maxWidth: "80%" },
  bubbleWrapMe: { alignSelf: "flex-end", alignItems: "flex-end" },
  bubbleWrapOther: { alignSelf: "flex-start", alignItems: "flex-start" },
  bubbleSender: { fontSize: 11, fontFamily: "Inter_600SemiBold", marginBottom: 3 },
  bubble: { borderRadius: 16, paddingHorizontal: 13, paddingVertical: 9, overflow: "hidden" },
  bubbleText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  editedLabel: { fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 2, fontStyle: "italic" },
  bubbleTime: { fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 3 },
  replyQuote: { borderLeftWidth: 3, paddingLeft: 8, paddingVertical: 4, marginBottom: 6, borderRadius: 4 },
  replyQuoteName: { fontSize: 11, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  replyQuoteText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  reactionRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 4 },
  reactionChip: { flexDirection: "row", alignItems: "center", borderRadius: 12, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, gap: 3 },
  reactionEmoji: { fontSize: 13 },
  reactionCount: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  replyBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1, gap: 10 },
  replyBarAccent: { width: 3, borderRadius: 2, alignSelf: "stretch" },
  replyBarLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  replyBarText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  inputBar: { flexDirection: "row", padding: 10, borderTopWidth: 1, alignItems: "flex-end", gap: 8 },
  msgInput: { flex: 1, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 9, fontSize: 14, fontFamily: "Inter_400Regular", maxHeight: 100 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  menuOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", alignItems: "center" },
  menuBox: { width: 240, borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  menuMsgPreview: { fontSize: 12, fontFamily: "Inter_400Regular", padding: 14, paddingBottom: 10 },
  menuDivider: { height: 1 },
  menuItem: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  menuItemText: { fontSize: 15, fontFamily: "Inter_500Medium" },
  emojiBox: { flexDirection: "row", flexWrap: "wrap", borderRadius: 20, borderWidth: 1, padding: 10, gap: 4, maxWidth: 300, justifyContent: "center" },
  emojiBtn: { padding: 8 },
  emojiText: { fontSize: 28 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "90%", flex: 0, minHeight: 400 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: 1 },
  modalTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  modalFooter: { padding: 16, borderTopWidth: 1 },
  modalBtn: { padding: 14, borderRadius: 12, alignItems: "center" },
  modalBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  fieldLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", paddingHorizontal: 16, marginTop: 16, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 },
  fieldInput: { marginHorizontal: 16, borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, fontFamily: "Inter_400Regular" },
  // ── Create-group full-page styles ──
  cgFullPage: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 100 },
  cgPageHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 14, gap: 12 },
  cgPageTitle: { flex: 1, color: "#fff", fontSize: 17, fontFamily: "Inter_700Bold" },
  cgPageActionBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.22)" },
  cgPageActionText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  cgMemberResult: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, gap: 10, marginTop: 2 },
  // ── Legacy sheet styles (kept for other modals) ──
  cgSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "92%", flex: 0, minHeight: 440 },
  cgMemberSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, height: "90%", flex: 0 },
  cgHeader: { flexDirection: "row", alignItems: "center", padding: 14, paddingHorizontal: 16, borderBottomWidth: 1, gap: 10 },
  cgHeaderIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  cgTitle: { fontSize: 16, fontFamily: "Inter_700Bold", flex: 1 },
  cgCloseBtn: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  cgCard: { marginHorizontal: 16, marginTop: 16, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12 },
  cgCardLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 },
  cgInput: { fontSize: 16, fontFamily: "Inter_400Regular", padding: 0, minHeight: 28 },
  cgCharCount: { fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "right", marginTop: 6 },
  cgSectionTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold", marginBottom: 8 },
  cgClassCard: { flexDirection: "row", alignItems: "center", padding: 12, borderRadius: 14, borderWidth: 1, gap: 10 },
  cgClassIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  cgSearchBox: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, borderWidth: 1, gap: 8 },
  cgSearchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", padding: 0 },
  cgDropdown: { position: "absolute", top: 48, left: 0, right: 0, borderWidth: 1, borderRadius: 14, shadowColor: "#000", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.14, shadowRadius: 10, elevation: 10, overflow: "hidden", zIndex: 30 },
  cgDropdownItem: { flexDirection: "row", alignItems: "center", padding: 12, borderBottomWidth: 1, gap: 10 },
  cgWarning: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 10, borderRadius: 12, backgroundColor: "#fef3c7" },
  cgWarningText: { flex: 1, fontSize: 12, color: "#92400e", fontFamily: "Inter_400Regular", lineHeight: 17 },
  cgMemberCount: { fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 8 },
  cgChipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  cgMemberBtn: { flexDirection: "row", alignItems: "center", padding: 13, borderRadius: 14, borderWidth: 1, gap: 10 },
  cgMemberBtnText: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium" },
  cgFooter: { padding: 14, paddingHorizontal: 16, borderTopWidth: 1 },
  cgCreateBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", padding: 15, borderRadius: 14, gap: 8 },
  cgCreateBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  cgDoneBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
  cgDoneBtnText: { color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  memberChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  memberChipText: { color: "#fff", fontSize: 12, fontFamily: "Inter_600SemiBold" },
  infoBanner: { flexDirection: "row", alignItems: "flex-start", gap: 7, marginHorizontal: 16, marginBottom: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  infoBannerText: { flex: 1, fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 16 },
  dmAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  dmAvatarText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
  attachImage: { width: 200, height: 150, borderRadius: 10, marginBottom: 2 },
  attachVideo: { width: 240, height: 160, borderRadius: 10, marginBottom: 2, backgroundColor: "#000" },
  audioPlayBtn: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  audioProgressBar: { height: 3, borderRadius: 2, marginTop: 5, marginBottom: 2, overflow: "hidden" },
  audioProgressFill: { height: "100%", borderRadius: 2 },
  attachFile: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1, marginBottom: 2 },
  attachDocIcon: { width: 34, height: 34, borderRadius: 8, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  attachFileInfo: { flex: 1, minWidth: 0, overflow: "hidden" },
  attachFileName: { fontSize: 13, fontFamily: "Inter_500Medium" },
  attachFileSize: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  attachPreview: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, gap: 10 },
  attachPreviewImage: { width: 48, height: 48, borderRadius: 8 },
  attachPreviewIcon: { width: 48, height: 48, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  attachPreviewName: { fontSize: 13, fontFamily: "Inter_500Medium" },
  attachPreviewSize: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  attachBtn: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  listSearchBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, borderWidth: 1, gap: 8 },
  listSearchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", padding: 0 },
  unreadBadge: { minWidth: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  unreadBadgeText: { color: "#fff", fontSize: 11, fontFamily: "Inter_700Bold", lineHeight: 14 },
});
