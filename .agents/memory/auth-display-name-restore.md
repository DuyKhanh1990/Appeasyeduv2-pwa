---
name: Auth display-name restore
description: Preserve human-readable names when an auth-me response falls back to account identifiers after a web reload.
---

When restoring a web session, prefer the locally stored display name for the current session and treat every available identity alias as a code, including profile code, staff code, and username.

**Why:** The login response can contain a human-readable name while the later auth-me response contains only an identifier, causing F5 to change a greeting back to a username.

**How to apply:** Filter all candidate names against all known account-code fields, then use the stored name before API candidates during session restore; clear it together with the auth session on logout.