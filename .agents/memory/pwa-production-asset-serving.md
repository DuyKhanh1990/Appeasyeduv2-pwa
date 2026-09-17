---
name: PWA production asset serving
description: Production checks for manifest MIME type and Service Worker freshness after publishing the EasyEdu PWA
---

The public PWA deployment must be checked independently from the workspace build: `.webmanifest` needs `application/manifest+json`, and `/sw.js` should match the current build version. A successful local export does not prove the public static handler has rolled out the same assets.

**Why:** The public domain can be backed by a static artifact handler or an older image even when `dist/public` is correct locally. This breaks Chrome installability diagnostics and can leave notification click behavior on an old Service Worker.

**How to apply:** After each PWA publish, request the public manifest, Service Worker, and every manifest icon directly. Compare their MIME types, status codes, and Service Worker version with `dist/public`; version the worker URL when the app shell changes and bypass HTTP cache for navigation and hashed bundles before testing Chrome Android installability.