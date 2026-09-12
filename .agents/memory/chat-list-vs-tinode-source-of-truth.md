---
name: Chat channel list vs Tinode source of truth
description: Why a chat channel can show an unread badge but not appear in the visible channel list, and how it was reconciled
---

The visible list of chat channels (groups/DMs) was originally sourced only from the app's own Postgres tables (`chat_groups` / `chat_group_members`), populated only when a channel is created through the app's own "create group" flow. The unread-message badge, however, is computed straight from Tinode's own `me`-topic subscription list (`meta.sub`), which reflects every topic the user's Tinode account is actually subscribed to — a strictly broader set.

**Why:** any channel that comes into existence outside the app's own create-group flow (e.g. someone messaging the user for the first time through a different client/path) increments the Tinode-based unread badge but has no Postgres row, so it silently never appears in the channel list even though the user is clearly receiving messages for it.

**How to apply:** don't treat the app database as the sole source of truth for "which channels does this user have" when Tinode (or any real-time messaging backend) is the actual system of record for subscriptions. Reconcile: merge topics reported by Tinode's own subscription list into the displayed list, falling back to a synthetic placeholder entry (using `public.fn` if present, else a generic label) for any topic not yet mirrored in the app database. Apply this pattern any time a secondary datastore mirrors a subset of what a real-time backend already knows in full — the mirror can lag or simply never sync for out-of-band writes.
