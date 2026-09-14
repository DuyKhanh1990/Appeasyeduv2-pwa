import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "@/hooks/useSafeAreaInsets";

import { useColors } from "@/hooks/useColors";
import { usePermissions } from "@/hooks/usePermissions";
import { apiGet, apiPost } from "@/lib/api";
import { cachePost } from "@/lib/postCache";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_WIDTH = SCREEN_WIDTH - 16 * 2;

const CATEGORIES = [
  { key: "", label: "Tất cả" },
  { key: "thong-bao", label: "Thông báo" },
  { key: "su-kien", label: "Sự kiện" },
  { key: "hoat-dong", label: "Hoạt động" },
  { key: "hoc-thuat", label: "Học thuật" },
];

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  "thong-bao": { bg: "#eff6ff", text: "#2563eb" },
  "su-kien": { bg: "#fdf4ff", text: "#9333ea" },
  "hoat-dong": { bg: "#f0fdf4", text: "#16a34a" },
  "hoc-thuat": { bg: "#fff7ed", text: "#ea580c" },
};

const CATEGORY_LABELS: Record<string, string> = {
  "thong-bao": "Thông báo",
  "su-kien": "Sự kiện",
  "hoat-dong": "Hoạt động",
  "hoc-thuat": "Học thuật",
};

const REACTIONS = ["👍", "❤️", "🎉", "😮", "😢", "👏"];

interface Post {
  id: string;
  authorId?: string;
  authorName: string;
  authorRole?: string | null;
  category: string;
  content: string;
  imageUrl?: string | null;
  imageUrls?: string[];
  isPinned: boolean;
  locationId?: string | null;
  createdAt: string;
  updatedAt?: string;
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

function totalReactions(reactions: Record<string, number>): number {
  return Object.values(reactions).reduce((s, v) => s + v, 0);
}

function PostCard({ post, colors, onReact }: { post: Post; colors: ReturnType<typeof useColors>; onReact: (id: string, reaction: string) => void }) {
  const catStyle = CATEGORY_COLORS[post.category] ?? { bg: "#f3f4f6", text: "#6b7280" };
  const catLabel = CATEGORY_LABELS[post.category] ?? post.category;
  const [showReactions, setShowReactions] = useState(false);
  const total = totalReactions(post.reactions);

  return (
    <View style={[styles.postCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <TouchableOpacity
        activeOpacity={0.85}
        style={styles.postRow}
        onPress={() => { cachePost(post); router.push({ pathname: "/news-post/[id]", params: { id: post.id } }); }}
      >
        {/* Thumbnail */}
        {post.imageUrl ? (
          <Image source={{ uri: post.imageUrl }} style={styles.postThumb} resizeMode="cover" />
        ) : (
          <View style={[styles.postThumbPlaceholder, { backgroundColor: colors.muted }]}>
            <Feather name="file-text" size={22} color={colors.mutedForeground} />
          </View>
        )}

        {/* Content */}
        <View style={styles.postBody}>
          {post.isPinned && (
            <View style={styles.pinnedRow}>
              <Feather name="bookmark" size={11} color="#f59e0b" />
              <Text style={styles.pinnedText}>Đã ghim</Text>
            </View>
          )}

          <View style={[styles.catBadge, { backgroundColor: catStyle.bg }]}>
            <Text style={[styles.catText, { color: catStyle.text }]}>{catLabel}</Text>
          </View>

          <Text style={[styles.postContent, { color: colors.foreground }]} numberOfLines={3}>
            {post.content}
          </Text>

          <Text style={[styles.timeText, { color: colors.mutedForeground, marginTop: 4 }]}>
            {post.authorName} · {timeAgo(post.createdAt)}
          </Text>
        </View>
      </TouchableOpacity>

      {/* Reaction bar */}
      <View style={[styles.reactionBar, { borderTopColor: colors.border, marginHorizontal: 12 }]}>
        <TouchableOpacity
          style={styles.reactBtn}
          onPress={() => setShowReactions((v) => !v)}
          activeOpacity={0.7}
        >
          <Text style={styles.reactIcon}>{post.myReaction ?? "👍"}</Text>
          <Text style={[styles.reactCount, { color: colors.mutedForeground }]}>
            {total > 0 ? total : "Cảm xúc"}
          </Text>
        </TouchableOpacity>

        {showReactions && (
          <View style={[styles.reactionPicker, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {REACTIONS.map((r) => (
              <TouchableOpacity
                key={r}
                onPress={() => {
                  onReact(post.id, r);
                  setShowReactions(false);
                }}
                style={[styles.reactOption, post.myReaction === r && { backgroundColor: colors.primary + "22" }]}
              >
                <Text style={{ fontSize: 18 }}>{r}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

export default function NewsFeedScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = insets.top;

  const perms = usePermissions();
  const [selectedCategory, setSelectedCategory] = useState("");
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // canCreate: prefer permissions hook (reliable, from /me/permissions), fall back to API response field
  const [apiCanCreate, setApiCanCreate] = useState<boolean | null>(null);
  const canCreate = apiCanCreate !== null ? apiCanCreate : perms.canCreateNews;


  const fetchPosts = useCallback(async (category: string, isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "20", offset: "0" });
      if (category) params.set("category", category);
      const data = await apiGet<any>(`/api/mobile/news-feed?${params}`);
      const list: Post[] = Array.isArray(data?.data) ? data.data : [];
      setPosts(list);
      if (data?.permissions?.canCreate !== undefined) {
        setApiCanCreate(!!data.permissions.canCreate);
      }
    } catch {
      setPosts([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchPosts(selectedCategory);
  }, [selectedCategory]);

  const handleReact = (id: string, reaction: string) => {
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        const prev_r = p.myReaction;
        const newReactions = { ...p.reactions };
        if (prev_r) newReactions[prev_r] = Math.max(0, (newReactions[prev_r] ?? 0) - 1);
        const isSame = prev_r === reaction;
        if (!isSame) newReactions[reaction] = (newReactions[reaction] ?? 0) + 1;
        return { ...p, myReaction: isSame ? null : reaction, reactions: newReactions };
      })
    );
    apiPost(`/api/mobile/news-feed/${id}/react`, { reaction }).catch(() => {});
  };

  const pinnedPosts = posts.filter((p) => p.isPinned);
  const regularPosts = posts.filter((p) => !p.isPinned);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={{
          backgroundColor: colors.gradientStart,
          paddingTop: (Platform.OS === "web" ? topPad : insets.top) + 16,
          paddingBottom: 16,
          paddingHorizontal: 20,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View>
            <Text style={{ fontSize: 22, fontFamily: "Inter_700Bold", color: "#1e1b4b" }}>
              Bảng tin
            </Text>
            <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: "rgba(30,27,75,0.65)", marginTop: 2 }}>
              Tin tức & thông báo nội bộ
            </Text>
          </View>
          {canCreate && (
            <TouchableOpacity style={styles.writeBtn} activeOpacity={0.8}>
              <Feather name="edit-3" size={18} color="#1e1b4b" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => fetchPosts(selectedCategory, true)} tintColor={colors.primary} colors={[colors.primary]} progressBackgroundColor={colors.card} />
        }
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryRow}
        >
          {CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat.key}
              onPress={() => setSelectedCategory(cat.key)}
              style={[
                styles.catPill,
                {
                  backgroundColor: selectedCategory === cat.key ? colors.primary : colors.card,
                  borderColor: selectedCategory === cat.key ? colors.primary : colors.border,
                },
              ]}
              activeOpacity={0.75}
            >
              <Text
                style={[
                  styles.catPillText,
                  { color: selectedCategory === cat.key ? "#fff" : colors.mutedForeground },
                ]}
              >
                {cat.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} size="large" />
        ) : (
          <>
            {pinnedPosts.length > 0 && (
              <View style={{ marginBottom: 4 }}>
                <View style={styles.sectionHeader}>
                  <Feather name="bookmark" size={14} color="#f59e0b" />
                  <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Bài đã ghim</Text>
                </View>
                <View style={styles.grid}>
                  {pinnedPosts.map((item) => (
                    <PostCard key={item.id} post={item} colors={colors} onReact={handleReact} />
                  ))}
                </View>
              </View>
            )}

            <View style={styles.sectionHeader}>
              <Feather name="rss" size={14} color={colors.primary} />
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Bài viết mới nhất</Text>
            </View>

            <View style={styles.grid}>
              {regularPosts.map((item) => (
                <PostCard key={item.id} post={item} colors={colors} onReact={handleReact} />
              ))}
            </View>

            {regularPosts.length === 0 && !loading && (
              <View style={styles.emptyState}>
                <Feather name="inbox" size={40} color={colors.mutedForeground} />
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                  Không có bài viết nào
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  categoryRow: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 8,
    flexDirection: "row",
  },
  catPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  catPillText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    marginBottom: 12,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  grid: {
    flexDirection: "column",
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 12,
  },
  postCard: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
    paddingBottom: 2,
  },
  postRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 12,
    gap: 12,
  },
  postThumb: {
    width: 90,
    height: 90,
    borderRadius: 10,
    flexShrink: 0,
  },
  postThumbPlaceholder: {
    width: 90,
    height: 90,
    borderRadius: 10,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  postBody: {
    flex: 1,
    gap: 5,
  },
  pinnedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  pinnedText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: "#f59e0b",
  },
  catBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
  },
  catText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  postContent: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
  },
  timeText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  reactionBar: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
    marginTop: 4,
    position: "relative",
  },
  reactBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  reactIcon: {
    fontSize: 16,
  },
  reactCount: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  reactionPicker: {
    position: "absolute",
    bottom: 36,
    left: 0,
    flexDirection: "row",
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 4,
    gap: 2,
    zIndex: 10,
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
  },
  reactOption: {
    padding: 4,
    borderRadius: 20,
  },
  writeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(30,27,75,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyState: {
    alignItems: "center",
    marginTop: 60,
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
});
