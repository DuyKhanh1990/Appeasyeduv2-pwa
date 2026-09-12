import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useRef, useState } from "react";
import {
  Dimensions,
  Image,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useSafeAreaInsets } from "@/hooks/useSafeAreaInsets";

import { FileList } from "@/components/FileViewer";
import { PostHtmlContent } from "@/components/PostHtmlContent";
import { useColors } from "@/hooks/useColors";
import { getCachedPost } from "@/lib/postCache";

const { width: SCREEN_W } = Dimensions.get("window");

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  "thong-bao": { bg: "#eff6ff", text: "#2563eb" },
  "su-kien":   { bg: "#fdf4ff", text: "#9333ea" },
  "hoat-dong": { bg: "#f0fdf4", text: "#16a34a" },
  "hoc-thuat": { bg: "#fff7ed", text: "#ea580c" },
};

const CATEGORY_LABELS: Record<string, string> = {
  "thong-bao": "Thông báo",
  "su-kien":   "Sự kiện",
  "hoat-dong": "Hoạt động",
  "hoc-thuat": "Học thuật",
};

const REACTIONS = ["👍", "❤️", "🎉", "😮", "😢", "👏"];

interface AttachmentItem {
  name: string;
  url: string;
  size?: number;
  mimetype?: string;
}

interface Post {
  id: string;
  authorName: string;
  authorRole?: string | null;
  category: string;
  content: string;
  imageUrl?: string | null;
  imageUrls?: string[];
  attachments?: AttachmentItem[];
  isPinned: boolean;
  createdAt: string;
  reactions: Record<string, number>;
  myReaction?: string | null;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins} phút trước`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} giờ trước`;
  const days = Math.floor(hrs / 24);
  return `${days} ngày trước`;
}

function totalReactions(r: Record<string, number>) {
  return Object.values(r).reduce((s, v) => s + v, 0);
}


function formatBytes(bytes?: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function NewsPostDetail() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string }>();
  const post: Post | null = params.id ? (getCachedPost(params.id) ?? null) : null;

  const [myReaction, setMyReaction] = useState<string | null>(post?.myReaction ?? null);
  const [reactions, setReactions] = useState<Record<string, number>>(post?.reactions ?? {});
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [activeImageIdx, setActiveImageIdx] = useState(0);
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);

  const scrollRef = useRef<ScrollView>(null);

  if (!post) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <Feather name="alert-circle" size={40} color={colors.mutedForeground} />
        <Text style={{ color: colors.mutedForeground, marginTop: 12, fontFamily: "Inter_400Regular" }}>
          Không tìm thấy bài viết
        </Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 20 }}>
          <Text style={{ color: colors.primary, fontFamily: "Inter_500Medium" }}>Quay lại</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const cat = CATEGORY_COLORS[post.category] ?? { bg: "#f3f4f6", text: "#6b7280" };
  const catLabel = CATEGORY_LABELS[post.category] ?? post.category;
  const images: string[] = [
    ...(post.imageUrl ? [post.imageUrl] : []),
    ...(post.imageUrls ?? []),
  ].filter((v, i, a) => a.indexOf(v) === i);
  const attachments: AttachmentItem[] = post.attachments ?? [];
  const total = totalReactions(reactions);

  const handleReact = (r: string) => {
    setReactions((prev) => {
      const next = { ...prev };
      if (myReaction) next[myReaction] = Math.max(0, (next[myReaction] ?? 0) - 1);
      const isSame = myReaction === r;
      if (!isSame) next[r] = (next[r] ?? 0) + 1;
      return next;
    });
    setMyReaction((prev) => (prev === r ? null : r));
    setShowReactionPicker(false);
  };

  const onImageScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
    setActiveImageIdx(idx);
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View
        style={{ backgroundColor: colors.gradientStart, paddingTop: topPad + 10, paddingBottom: 14, paddingHorizontal: 16 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.75}>
            <Feather name="arrow-left" size={20} color="#1e1b4b" />
          </TouchableOpacity>
          <Text style={{ flex: 1, fontSize: 18, fontFamily: "Inter_700Bold", color: "#1e1b4b" }} numberOfLines={1}>
            Bài viết
          </Text>
          {post.isPinned && (
            <View style={styles.pinnedBadge}>
              <Feather name="bookmark" size={12} color="#f59e0b" />
              <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#f59e0b" }}>Đã ghim</Text>
            </View>
          )}
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Image Carousel ── */}
        {images.length > 0 && (
          <View>
            <ScrollView
              ref={scrollRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onScroll={onImageScroll}
              scrollEventThrottle={16}
            >
              {images.map((uri, idx) => (
                <TouchableWithoutFeedback key={idx} onPress={() => setLightboxUri(uri)}>
                  <Image
                    source={{ uri }}
                    style={{ width: SCREEN_W, height: 260 }}
                    resizeMode="cover"
                  />
                </TouchableWithoutFeedback>
              ))}
            </ScrollView>

            {/* Dots + counter */}
            {images.length > 1 && (
              <View style={styles.dotsRow}>
                {images.map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.dot,
                      i === activeImageIdx
                        ? { backgroundColor: "#fff", width: 16 }
                        : { backgroundColor: "rgba(255,255,255,0.5)" },
                    ]}
                  />
                ))}
                <View style={styles.counterBadge}>
                  <Text style={styles.counterText}>{activeImageIdx + 1}/{images.length}</Text>
                </View>
              </View>
            )}
          </View>
        )}

        <View style={styles.body}>
          {/* Category badge */}
          <View style={[styles.catBadge, { backgroundColor: cat.bg }]}>
            <Text style={[styles.catText, { color: cat.text }]}>{catLabel}</Text>
          </View>

          {/* Author row */}
          <View style={styles.authorRow}>
            <View style={[styles.avatar, { backgroundColor: colors.primary + "22" }]}>
              <Text style={[styles.avatarLetter, { color: colors.primary }]}>
                {post.authorName.charAt(0)}
              </Text>
            </View>
            <View>
              <Text style={[styles.authorName, { color: colors.foreground }]}>
                {post.authorName}
              </Text>
              {post.authorRole && (
                <Text style={[styles.authorRole, { color: colors.mutedForeground }]}>
                  {post.authorRole}
                </Text>
              )}
              <Text style={[styles.timeText, { color: colors.mutedForeground }]}>
                {timeAgo(post.createdAt)}
              </Text>
            </View>
          </View>

          {/* Divider */}
          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* Content */}
          <PostHtmlContent html={post.content} textColor={colors.foreground} />

          {/* ── Attachments ── */}
          {attachments.length > 0 && (
            <View style={{ gap: 8 }}>
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
                File đính kèm ({attachments.length})
              </Text>
              <FileList files={attachments} />
            </View>
          )}

          {/* Reaction bar */}
          <View style={[styles.reactionBar, { borderTopColor: colors.border }]}>
            <TouchableOpacity
              style={styles.reactBtn}
              onPress={() => setShowReactionPicker((v) => !v)}
              activeOpacity={0.7}
            >
              <Text style={{ fontSize: 20 }}>{myReaction ?? "👍"}</Text>
              <Text style={[styles.reactCount, { color: colors.mutedForeground }]}>
                {total > 0 ? total : "Cảm xúc"}
              </Text>
            </TouchableOpacity>

            {showReactionPicker && (
              <View style={[styles.reactionPicker, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {REACTIONS.map((r) => (
                  <TouchableOpacity
                    key={r}
                    onPress={() => handleReact(r)}
                    style={[styles.reactOption, myReaction === r && { backgroundColor: colors.primary + "22" }]}
                  >
                    <Text style={{ fontSize: 22 }}>{r}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {total > 0 && (
              <View style={styles.reactionSummary}>
                {Object.entries(reactions)
                  .filter(([, count]) => count > 0)
                  .sort(([, a], [, b]) => b - a)
                  .slice(0, 3)
                  .map(([emoji]) => (
                    <Text key={emoji} style={{ fontSize: 16 }}>{emoji}</Text>
                  ))}
                <Text style={[styles.reactCount, { color: colors.mutedForeground }]}>{total}</Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      {/* ── Lightbox (fullscreen image) ── */}
      <Modal visible={lightboxUri !== null} transparent animationType="fade" statusBarTranslucent>
        <TouchableWithoutFeedback onPress={() => setLightboxUri(null)}>
          <View style={styles.lightboxBg}>
            <TouchableOpacity style={styles.lightboxClose} onPress={() => setLightboxUri(null)}>
              <Feather name="x" size={22} color="#fff" />
            </TouchableOpacity>
            {lightboxUri && (
              <Image
                source={{ uri: lightboxUri }}
                style={styles.lightboxImage}
                resizeMode="contain"
              />
            )}
          </View>
        </TouchableWithoutFeedback>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "rgba(30,27,75,0.1)",
    alignItems: "center", justifyContent: "center",
  },
  pinnedBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "rgba(245,158,11,0.15)",
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
  },
  dotsRow: {
    position: "absolute", bottom: 10,
    width: "100%", flexDirection: "row",
    justifyContent: "center", alignItems: "center", gap: 5,
  },
  dot: {
    height: 6, borderRadius: 3,
    width: 6,
  },
  counterBadge: {
    position: "absolute", right: 12,
    backgroundColor: "rgba(0,0,0,0.45)",
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10,
  },
  counterText: {
    color: "#fff", fontSize: 11, fontFamily: "Inter_500Medium",
  },
  body: {
    padding: 20, gap: 16,
  },
  catBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
  },
  catText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  authorRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  avatarLetter: { fontSize: 18, fontFamily: "Inter_700Bold" },
  authorName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  authorRole: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  timeText: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  divider: { height: StyleSheet.hairlineWidth },
  content: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 24 },
  sectionLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5 },
  attachCard: {
    flexDirection: "row", alignItems: "center", gap: 10,
    width: 220, padding: 12, borderRadius: 12, borderWidth: 1,
  },
  attachIcon: {
    width: 40, height: 40, borderRadius: 10,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  attachName: { fontSize: 13, fontFamily: "Inter_500Medium", lineHeight: 18 },
  attachSize: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  reactionBar: {
    flexDirection: "row", alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 14, marginTop: 4, gap: 12, position: "relative",
  },
  reactBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingVertical: 6, paddingHorizontal: 14,
    borderRadius: 20, borderWidth: 1, borderColor: "#e5e7eb",
  },
  reactCount: { fontSize: 13, fontFamily: "Inter_500Medium" },
  reactionPicker: {
    position: "absolute", bottom: 52, left: 0,
    flexDirection: "row", borderRadius: 30, borderWidth: 1,
    paddingHorizontal: 8, paddingVertical: 6, gap: 4,
    zIndex: 10, elevation: 5,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15, shadowRadius: 8,
  },
  reactOption: { padding: 4, borderRadius: 20 },
  reactionSummary: { flexDirection: "row", alignItems: "center", gap: 4, marginLeft: 4 },
  lightboxBg: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.92)",
    justifyContent: "center", alignItems: "center",
  },
  lightboxClose: {
    position: "absolute", top: 52, right: 20,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center", justifyContent: "center", zIndex: 10,
  },
  lightboxImage: {
    width: SCREEN_W, height: SCREEN_W * 1.2,
  },
});
