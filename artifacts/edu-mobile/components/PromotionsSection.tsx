import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  Dimensions,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { useColors } from "@/hooks/useColors";
import { apiGet } from "@/lib/api";
import { cachePost } from "@/lib/postCache";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_WIDTH = SCREEN_WIDTH - 20 * 2 - 28; // near-full-width card
const CARD_GAP = 12;

interface PromoPost {
  id: string;
  content: string;
  imageUrl?: string | null;
  imageUrls?: string[];
  createdAt: string;
}

export default function PromotionsSection() {
  const colors = useColors();
  const [promos, setPromos] = useState<PromoPost[]>([]);
  const [loaded, setLoaded] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      async function load() {
        const extractList = (data: any): PromoPost[] =>
          Array.isArray(data?.posts) ? data.posts
          : Array.isArray(data?.data) ? data.data
          : Array.isArray(data) ? data
          : [];

        try {
          const data = await apiGet<any>("/api/mobile/news-feed/promotions");
          const list = extractList(data);
          if (!cancelled && list.length > 0) { setPromos(list); setLoaded(true); return; }
        } catch {}

        try {
          const data = await apiGet<any>("/api/mobile/news-feed?category=khuyen-mai&limit=10");
          if (!cancelled) setPromos(extractList(data));
        } catch {
          if (!cancelled) setPromos([]);
        } finally {
          if (!cancelled) setLoaded(true);
        }
      }

      load();
      return () => { cancelled = true; };
    }, [])
  );

  // Hide completely if no promotions (or still loading)
  if (!loaded || promos.length === 0) return null;

  return (
    <View style={{ marginTop: 24 }}>
      {/* Header */}
      <View style={styles.headerRow}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            🎁 Khuyến mãi
          </Text>
          {promos.length > 0 && (
            <View style={[styles.countBadge, { backgroundColor: colors.primary }]}>
              <Text style={styles.countText}>{promos.length}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Horizontal carousel */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={CARD_WIDTH + CARD_GAP}
        snapToAlignment="start"
        contentContainerStyle={{
          paddingHorizontal: 20,
          gap: CARD_GAP,
          paddingBottom: 4,
        }}
      >
        {promos.map((item) => {
          const image = item.imageUrl ?? item.imageUrls?.[0] ?? null;
          return (
            <TouchableOpacity
              key={item.id}
              activeOpacity={0.85}
              style={[
                styles.card,
                { width: CARD_WIDTH, backgroundColor: colors.card, borderColor: colors.border },
              ]}
              onPress={() => {
                cachePost(item as any);
                router.push({ pathname: "/news-post/[id]", params: { id: item.id } });
              }}
            >
              {/* Image */}
              {image ? (
                <Image source={{ uri: image }} style={styles.cardImage} resizeMode="cover" />
              ) : (
                <View style={[styles.cardImagePlaceholder, { backgroundColor: colors.muted }]}>
                  <Feather name="tag" size={32} color={colors.mutedForeground} />
                </View>
              )}

              {/* Title */}
              {item.content ? (
                <View style={styles.cardFooter}>
                  <Text
                    style={[styles.cardTitle, { color: colors.foreground }]}
                    numberOfLines={2}
                  >
                    {item.content}
                  </Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
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
  countBadge: {
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  countText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
  seeAll: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  cardImage: {
    width: "100%",
    height: 180,
  },
  cardImagePlaceholder: {
    width: "100%",
    height: 180,
    alignItems: "center",
    justifyContent: "center",
  },
  cardFooter: {
    padding: 12,
    paddingTop: 10,
  },
  cardTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    lineHeight: 20,
  },
});
