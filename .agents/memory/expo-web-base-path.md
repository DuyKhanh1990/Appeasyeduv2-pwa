---
name: Expo Web base path preview
description: Expo Router SDK 6 does not strip experiments.baseUrl during development, so the PWA preview must serve the production static export.
---

Expo Router's `experiments.baseUrl` is applied when stripping the browser path in production, but development mode leaves the artifact prefix in the route matcher. Serving Expo Web dev mode directly behind a path-based Replit preview therefore produces the not-found screen at the artifact root.

**Why:** The PWA artifact is mounted at a non-root preview path, while the native Expo workflow still needs its normal development server.

**How to apply:** Keep the native workflow on Expo Metro, build `edu-mobile` with `expo export --platform web` for `edu-web`, copy the complete export tree including `_expo` and assets, and serve that tree for the web preview.