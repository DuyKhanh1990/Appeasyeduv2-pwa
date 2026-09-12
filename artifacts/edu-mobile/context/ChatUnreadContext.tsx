import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

import { apiPost } from "@/lib/api";
import { useAuth } from "./AuthContext";

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

interface TinodeCreds { tinodeUrl: string; apiKey: string; login: string; password: string; }

interface ChatUnreadContextValue {
  unreadCounts: Map<string, number>;
  totalUnread: number;
  markRead: (topicId: string) => void;
  topicTouched: Map<string, string>;
  lastMessages: Map<string, string>;
  updateLastMessage: (topicId: string, text: string, seq?: number) => void;
  knownTopics: Map<string, string | undefined>;
  // Đăng ký tập hợp topicId hợp lệ từ GET /groups — badge chỉ đếm những topic này.
  // Các topic Tinode không có trong danh sách (kênh cũ deprecated) sẽ bị bỏ qua.
  setKnownGroupTopics: (topicIds: Set<string>) => void;
}

const ChatUnreadContext = createContext<ChatUnreadContextValue>({
  unreadCounts: new Map(),
  totalUnread: 0,
  markRead: () => {},
  topicTouched: new Map(),
  lastMessages: new Map(),
  updateLastMessage: () => {},
  knownTopics: new Map(),
  setKnownGroupTopics: () => {},
});

// Tracks the highest seq we have stored per topic so we never overwrite a
// newer preview with an older one (Tinode sends historical backfill oldest→newest)
const lastSeqsRef = { current: new Map<string, number>() };

function extractText(content: unknown): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (typeof content === "object") {
    const c = content as Record<string, unknown>;
    if (typeof c.txt === "string") return c.txt;
    if (typeof c.text === "string") return c.text;
    if (typeof c.ent === "object" && Array.isArray(c.ent)) {
      const ent = c.ent as Array<{ tp?: string; data?: { mime?: string } }>;
      if (ent.some(e => e.tp === "EX")) return "📎 Tệp đính kèm";
    }
  }
  return "";
}

export function ChatUnreadProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [unreadCounts, setUnreadCounts] = useState<Map<string, number>>(new Map());
  const [topicTouched, setTopicTouched] = useState<Map<string, string>>(new Map());
  const [lastMessages, setLastMessages] = useState<Map<string, string>>(new Map());
  const [knownTopics, setKnownTopics] = useState<Map<string, string | undefined>>(new Map());
  // Set các topicId hợp lệ từ GET /groups — badge chỉ đếm những topic này.
  const [knownGroupTopicIds, setKnownGroupTopicIds] = useState<Set<string>>(new Set());
  const credsRef = useRef<TinodeCreds | null>(null);
  // Tracks the highest seq stored per topic — prevents Tinode historical backfill
  // (sent oldest→newest) from overwriting a more-recent preview.
  const lastSeqsRef = useRef<Map<string, number>>(new Map());

  // Nếu đã có danh sách hợp lệ từ server, chỉ đếm những topic đó.
  // Nếu chưa có (lần đầu load), đếm tất cả để tránh badge = 0 sai.
  const totalUnread = knownGroupTopicIds.size > 0
    ? [...unreadCounts.entries()]
        .filter(([topicId]) => knownGroupTopicIds.has(topicId))
        .reduce((sum, [, count]) => sum + count, 0)
    : [...unreadCounts.values()].reduce((a, b) => a + b, 0);

  const setKnownGroupTopics = useCallback((topicIds: Set<string>) => {
    setKnownGroupTopicIds(topicIds);
  }, []);

  const markRead = useCallback((topicId: string) => {
    setUnreadCounts(prev => {
      if (!prev.has(topicId)) return prev;
      const n = new Map(prev);
      n.delete(topicId);
      return n;
    });
  }, []);

  const updateLastMessage = useCallback((topicId: string, text: string, seq?: number) => {
    if (!text) return;
    // If a seq is provided, only update when it is at least as new as what we have.
    // This prevents old historical backfill packets from overwriting a newer preview.
    if (seq !== undefined) {
      const cached = lastSeqsRef.current.get(topicId) ?? 0;
      if (seq < cached) return;
      lastSeqsRef.current.set(topicId, seq);
    }
    setLastMessages(prev => {
      const n = new Map(prev);
      n.set(topicId, text);
      return n;
    });
  }, []);

  useEffect(() => {
    if (!user) {
      setUnreadCounts(new Map());
      setTopicTouched(new Map());
      setLastMessages(new Map());
      setKnownTopics(new Map());
      setKnownGroupTopicIds(new Set());
      lastSeqsRef.current = new Map();
      credsRef.current = null;
      return;
    }

    let cancelled = false;
    let ws: WebSocket | null = null;
    let pingInterval: ReturnType<typeof setInterval> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectCount = 0;
    const MAX_RECONNECTS = 10;

    const connect = async () => {
      if (cancelled) return;
      try {
        let creds = credsRef.current;
        if (!creds) {
          const r = await apiPost<{ success: boolean; data: TinodeCreds }>("/api/mobile/chat/connect", {});
          creds = r.data.data;
          credsRef.current = creds;
        }
        if (cancelled) return;

        const rawUrl = creds.tinodeUrl.replace(/^http/, "ws").replace(/\/$/, "");
        const basePath = rawUrl.endsWith("/v0/channels") ? rawUrl : `${rawUrl}/v0/channels`;
        const wsUrl = `${basePath}?apikey=${encodeURIComponent(creds.apiKey)}`;
        const secret = toBase64(`${creds.login}:${creds.password}`);

        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          reconnectCount = 0;
          ws!.send(JSON.stringify({ hi: { id: "uc-hi", ver: "0.22", ua: "TinodeJS/0.22.0 (Mobile; Expo); vi-VN", lang: "vi-VN" } }));
          if (pingInterval) clearInterval(pingInterval);
          pingInterval = setInterval(() => {
            if (ws?.readyState === WebSocket.OPEN)
              ws.send(JSON.stringify({ note: { topic: "me", what: "kp" } }));
          }, 25000);
        };

        ws.onmessage = (e) => {
          let pkt: Record<string, unknown>;
          try { pkt = JSON.parse(e.data as string); } catch { return; }

          if (pkt.ctrl) {
            const ctrl = pkt.ctrl as { id: string; code: number; params?: Record<string, unknown> };
            if (ctrl.code >= 200 && ctrl.code < 300) {
              if (ctrl.id === "uc-hi" || ctrl.id === "") {
                ws!.send(JSON.stringify({ login: { id: "uc-login", scheme: "basic", secret } }));
              } else if (ctrl.id === "uc-login") {
                ws!.send(JSON.stringify({ sub: { id: "uc-sub", topic: "me", get: { what: "sub desc", sub: { limit: 100 } } } }));
              }
            }
          }

          if (pkt.meta) {
            const meta = pkt.meta as {
              sub?: Array<{
                topic: string;
                seq?: number;
                read?: number;
                touched?: string;
                public?: { fn?: string };
                last?: { user?: string; ts?: string; content?: unknown };
              }>;
            };
            if (meta.sub && meta.sub.length > 0) {
              const counts = new Map<string, number>();
              const touched = new Map<string, string>();
              const msgs = new Map<string, string>();
              const topics = new Map<string, string | undefined>();
              for (const s of meta.sub) {
                topics.set(s.topic, s.public?.fn);
                const topicSeq = s.seq ?? 0;
                const unread = Math.max(0, topicSeq - (s.read ?? 0));
                if (unread > 0) counts.set(s.topic, unread);
                if (s.touched) touched.set(s.topic, s.touched);
                if (s.last?.content) {
                  const text = extractText(s.last.content);
                  if (text) {
                    // Only overwrite the preview when this snapshot's seq is at
                    // least as new as what we already have.  A stale meta.sub
                    // response arriving after a newer pkt.data update must not
                    // roll the preview back to older content.
                    const cached = lastSeqsRef.current.get(s.topic) ?? 0;
                    if (topicSeq >= cached) {
                      msgs.set(s.topic, text);
                      lastSeqsRef.current.set(s.topic, topicSeq);
                    }
                  }
                }
              }
              if (!cancelled) {
                setUnreadCounts(counts);
                setTopicTouched(touched);
                // meta.sub trả về toàn bộ danh sách topic user thực sự có trên Tinode
                // (đây là nguồn đáng tin cậy nhất) — dùng để phát hiện các kênh chưa
                // có bản ghi group ở Postgres. Merge thay vì replace vì "me" cũng có
                // thể trả một trang con nếu sub vượt limit.
                setKnownTopics(prev => {
                  const n = new Map(prev);
                  topics.forEach((v, k) => n.set(k, v));
                  return n;
                });
                if (msgs.size > 0) {
                  setLastMessages(prev => {
                    const n = new Map(prev);
                    msgs.forEach((v, k) => n.set(k, v));
                    return n;
                  });
                }
              }
            }
          }

          if (pkt.pres) {
            const pres = pkt.pres as { src?: string; what?: string; seq?: number };
            if (pres.what === "msg" && pres.src && !cancelled) {
              const now = new Date().toISOString();
              setUnreadCounts(prev => {
                const n = new Map(prev);
                n.set(pres.src!, (n.get(pres.src!) ?? 0) + 1);
                return n;
              });
              setTopicTouched(prev => {
                const n = new Map(prev);
                n.set(pres.src!, now);
                return n;
              });
              // Tin nhắn mới có thể đến từ một topic hoàn toàn mới (chưa từng thấy
              // trong meta.sub) — vẫn ghi nhận topic này để không bị "mất tích" khỏi
              // danh sách kênh dù chưa biết tên hiển thị.
              setKnownTopics(prev => (prev.has(pres.src!) ? prev : new Map(prev).set(pres.src!, undefined)));
              // Debounced refresh: re-fetch me subscription to get updated last.content
              // for the topic that received the new message
              if (refreshTimer) clearTimeout(refreshTimer);
              refreshTimer = setTimeout(() => {
                if (ws?.readyState === WebSocket.OPEN && !cancelled) {
                  ws.send(JSON.stringify({ get: { id: "uc-refresh", topic: "me", what: "sub", sub: { limit: 100 } } }));
                }
              }, 600);
            }
          }
        };

        ws.onerror = () => {
          if (pingInterval) { clearInterval(pingInterval); pingInterval = null; }
        };

        ws.onclose = () => {
          if (pingInterval) { clearInterval(pingInterval); pingInterval = null; }
          if (cancelled) return;
          if (reconnectCount < MAX_RECONNECTS) {
            reconnectCount++;
            reconnectTimer = setTimeout(connect, Math.min(2000 * reconnectCount, 15000));
          }
        };
      } catch {
        if (!cancelled && reconnectCount < MAX_RECONNECTS) {
          reconnectCount++;
          reconnectTimer = setTimeout(connect, Math.min(2000 * reconnectCount, 15000));
        }
      }
    };

    connect();

    return () => {
      cancelled = true;
      if (pingInterval) clearInterval(pingInterval);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (refreshTimer) clearTimeout(refreshTimer);
      ws?.close();
    };
  }, [user]);

  return (
    <ChatUnreadContext.Provider value={{ unreadCounts, totalUnread, markRead, topicTouched, lastMessages, updateLastMessage, knownTopics, setKnownGroupTopics }}>
      {children}
    </ChatUnreadContext.Provider>
  );
}

export function useChatUnread() {
  return useContext(ChatUnreadContext);
}
