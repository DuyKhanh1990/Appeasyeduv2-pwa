---
name: Calendar dots and auth readiness
description: Why the student calendar can show a selected day but miss month-level schedule markers.
---

Calendar month-marker requests must not run until the auth context has finished restoring the center URL and user session. A day request can succeed later, masking an earlier month request failure and making dots appear only after a date is tapped.

**Why:** The PWA restores auth asynchronously; the schedule screen can mount before the API client is ready.

**How to apply:** Gate month and day fetches on auth readiness, refetch when the authenticated user or center changes, and never reuse month-dot cache across user/center boundaries.