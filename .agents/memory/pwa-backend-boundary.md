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

For the BTVN/assignments feature, use the existing web backend contract for all
student/parent and staff flows (`/api/my-space/assignments/...`); do not mix in
the `/api/mobile/...` assignment routes. Submission attachments are URL strings.

**Why:** The user confirmed the current web backend contract is authoritative
for the entire BTVN feature, including student/parent and staff.

**How to apply:** Map the web API response fields into the PWA's display model
and preserve the backend's payload shape. Confirm the parent-submit limitation:
the current contract can list linked children's work, but has no child selector
for submitting on a child's behalf.

Resolve relative attachment and embedded-media URLs against the configured
center/backend origin before rendering them in the PWA.

**Why:** The PWA and center backend may use different domains, so a relative
file URL otherwise resolves against the PWA host and appears missing.

**How to apply:** Preserve absolute URLs; only resolve relative paths for
attachments and `src`/`poster` media attributes when adapting API responses.

The backend does not localize business responses or expose a language-switch
API. The PWA owns translated UI labels and display-only enum labels; values sent
back to the API and user-authored/server-authored content must remain unchanged.

**Why:** The supplied backend notes describe fixed business values and no
language-aware response behavior; translating those values in requests would
break the existing API contract.

**How to apply:** Keep language selection and UI translation in the client.
Map status/type values only when rendering them, and leave names, descriptions,
comments, and other authored content untouched.