---
name: PWA backend boundary
description: The confirmed production boundary between the EasyEdu web PWA and the existing multi-tenant backend
---

The EasyEdu web PWA is frontend-only. Production requests, authentication,
business data, tenant resolution, push subscription persistence, and Web Push
delivery belong to the existing EasyEdu Backend chính; the workspace API is
development/mock/fallback only.

**Why:** The user explicitly chose the architecture where each center's
backend/database remains the source of truth and the PWA must not create a
parallel user or notification system.

**How to apply:** Keep browser code limited to the API contract and public
VAPID key. Derive tenant and user server-side from the authenticated request;
never accept them from push subscription payloads or store production data in
the workspace database.

The backend does not localize business responses or expose a language-switch
API. The PWA owns translated UI labels and display-only enum labels; values sent
back to the API and user-authored/server-authored content must remain unchanged.

**Why:** The supplied backend notes describe fixed business values and no
language-aware response behavior; translating those values in requests would
break the existing API contract.

**How to apply:** Keep language selection and UI translation in the client.
Map status/type values only when rendering them, and leave names, descriptions,
comments, and other authored content untouched.