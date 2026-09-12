import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { useColors } from "@/hooks/useColors";
import { apiGet } from "@/lib/api";
import { cachePost } from "@/lib/postCache";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_WIDTH = (SCREEN_WIDTH - 20 * 2 - 12) / 2;

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

interface Post {
  id: string;
  authorName: string;
  authorRole?: string | null;
  category: string;
  content: string;
  imageUrl?: string | null;
  imageUrls?: string[];
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
  return `${Math.floor(hrs / 24)} ngày trước`;
}

function totalReactions(r: Record<string, number>) {
  return Object.values(r).reduce((s, v) => s + v, 0);
}

function PostCard({ post, colors }: { post: Post; colors: ReturnType<typeof useColors> }) {
  const cat = CATEGORY_COLORS[post.category] ?? { bg: "#f3f4f6", text: "#6b7280" };
  const catLabel = CATEGORY_LABELS[post.category] ?? post.category;
  const total = totalReactions(post.reactions);
  const image = post.imageUrl ?? post.imageUrls?.[0] ?? null;

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() => { cachePost(post); router.push({ pathname: "/news-post/[id]", params: { id: post.id } }); }}
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, width: CARD_WIDTH }]}
    >
      {image ? (
        <Image source={{ uri: image }} style={styles.cardImage} resizeMode="cover" />
      ) : (
        <View style={[styles.cardImagePlaceholder, { backgroundColor: cat.bg }]}>
          <Feather name="file-text" size={22} color={cat.text} />
        </View>
      )}

      <View style={styles.cardBody}>
        {post.isPinned && (
          <View style={styles.pinnedRow}>
            <Feather name="bookmark" size={10} color="#f59e0b" />
            <Text style={styles.pinnedText}>Đã ghim</Text>
          </View>
        )}

        <View style={[styles.catBadge, { backgroundColor: cat.bg }]}>
          <Text style={[styles.catText, { color: cat.text }]}>{catLabel}</Text>
        </View>

        <Text style={[styles.cardContent, { color: colors.foreground }]} numberOfLines={3}>
          {post.content}
        </Text>

        <View style={styles.cardFooter}>
          <View style={[styles.avatarTiny, { backgroundColor: colors.primary + "22" }]}>
            <Text style={[styles.avatarLetter, { color: colors.primary }]}>
              {post.authorName?.charAt(0) ?? "?"}
            </Text>
          </View>
          <Text style={[styles.authorName, { color: colors.mutedForeground }]} numberOfLines={1}>
            {post.authorName}
          </Text>
        </View>

        <View style={styles.metaRow}>
          <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
            {timeAgo(post.createdAt)}
          </Text>
          {total > 0 && (
            <View style={styles.reactionRow}>
              <Text style={{ fontSize: 12 }}>👍</Text>
              <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{total}</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function NewsFeedSection() {
  const colors = useColors();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      async function load() {
        try {
          const data = await apiGet<any>("/api/mobile/news-feed?limit=6");
          if (cancelled) return;
          const list: Post[] = (Array.isArray(data?.data) ? data.data : [])
            .filter((p: Post) => p.category !== "khuyen-mai");
          setPosts(list.slice(0, 6));
          setErrorMsg(null);
        } catch (err: unknown) {
          if (cancelled) return;
          const msg = err instanceof Error ? err.message : String(err);
          setErrorMsg(msg);
          setPosts([]);
        } finally {
          if (!cancelled) setLoading(false);
        }
      }

      load();
      return () => { cancelled = true; };
    }, [])
  );

  if (loading) {
    return (
      <View style={{ marginTop: 24, paddingHorizontal: 20 }}>
        <View style={styles.headerRow}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Bảng tin</Text>
        </View>
        <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 12 }} />
      </View>
    );
  }

  if (posts.length === 0) {
    return (
      <View style={{ marginTop: 24 }}>
        <View style={styles.headerRow}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Bảng tin</Text>
          <TouchableOpacity onPress={() => router.push("/(tabs)/newsfeed" as any)} activeOpacity={0.7}>
            <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: colors.primary }}>
              Xem tất cả
            </Text>
          </TouchableOpacity>
        </View>
        <View style={{ paddingHorizontal: 20 }}>
          <View style={{ padding: 16, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, gap: 6 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Feather name="rss" size={16} color={colors.mutedForeground} />
              <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
                {errorMsg ? "Không tải được bảng tin" : "Chưa có bài viết nào"}
              </Text>
            </View>
            {errorMsg && (
              <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: "#ef4444" }}>
                {errorMsg}
              </Text>
            )}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={{ marginTop: 24 }}>
      <View style={styles.headerRow}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Bảng tin</Text>
        <TouchableOpacity onPress={() => router.push("/(tabs)/newsfeed" as any)} activeOpacity={0.7}>
          <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: colors.primary }}>
            Xem tất cả
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}
        snapToInterval={CARD_WIDTH + 12}
        decelerationRate="fast"
        renderItem={({ item }) => <PostCard post={item} colors={colors} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  cardImage: {
    width: "100%",
    height: 90,
  },
  cardImagePlaceholder: {
    width: "100%",
    height: 90,
    alignItems: "center",
    justifyContent: "center",
  },
  cardBody: {
    padding: 10,
    gap: 6,
  },
  pinnedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  pinnedText: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    color: "#f59e0b",
  },
  catBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  catText: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
  },
  cardContent: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 17,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 2,
  },
  avatarTiny: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  avatarLetter: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
  },
  authorName: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    flex: 1,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  metaText: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
  },
  reactionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
});
