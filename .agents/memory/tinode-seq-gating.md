---
name: Tinode last-message preview seq gating
description: Why and how to prevent Tinode historical backfill from overwriting chat channel list previews
---

## Rule
Any path that writes to `lastMessages` (the channel list preview map) **must** gate on `seq >= cachedSeq` using `lastSeqsRef` before writing. This applies to both `pkt.data` handlers and `meta.sub` snapshot handlers.

**Why:** Tinode sends ~25-40 historical data packets in seq order (oldest→newest) when subscribing to a topic. Without seq gating, any packet can overwrite a newer preview — causing the channel list to always show an old message (e.g., the very first message sent). A stale `meta.sub` snapshot arriving after a fresh `pkt.data` update causes the same regression.

**How to apply:**
- `ChatUnreadContext.tsx` → `lastSeqsRef` (useRef<Map<string,number>>) tracks highest seq per topic
- `updateLastMessage(topicId, text, seq?)` — if seq provided and `seq < cached`, return early; else update `lastSeqsRef` and setState
- `meta.sub` handler — seed/update `lastSeqsRef` only when `topicSeq >= cached`, skip `msgs.set` otherwise
- `chat.tsx` conversation WS → pass `seq` in every `updateLastMessage(topicId, preview, seq)` call
- Reset `lastSeqsRef.current = new Map()` on logout
