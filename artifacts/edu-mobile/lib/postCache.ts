/**
 * Lightweight in-memory cache for news posts.
 * Populated before navigating to the detail screen so we don't need
 * to pass large JSON payloads through route params.
 */

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

const cache = new Map<string, Post>();

export function cachePost(post: Post) {
  cache.set(post.id, post);
}

export function getCachedPost(id: string): Post | undefined {
  return cache.get(id);
}
