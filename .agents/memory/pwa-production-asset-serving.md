---
name: PWA production asset serving
description: Production checks for manifest MIME type and Service Worker freshness after publishing the EasyEdu PWA
---

The public PWA deployment must be checked independently from the workspace build: `.webmanifest` needs `application/manifest+json`, and `/sw.js` should match the current build version. A successful local export does not prove the public static handler has rolled out the same assets.

**Why:** The public domain can be backed by a static artifact handler or an older image even when `dist/public` is correct locally. This breaks Chrome installability diagnostics and can leave notification click behavior on an old Service Worker.

**How to apply:** After each PWA publish, request the public manifest, Service Worker, and every manifest icon directly. Compare their MIME types, status codes, and Service Worker version with `dist/public`; version the worker URL when the app shell changes and bypass HTTP cache for navigation and hashed bundles before testing Chrome Android installability.

For the EasyEdu PWA, the version shown to users should identify the Harbor image tag currently deployed by Argo; the Expo `app.json` version is only the app release version and does not identify a deployment.

**Why:** The user checks Argo rollouts by the Harbor image tag to distinguish current and old deployments.

**How to apply:** Pass the exact image tag into the public build metadata or serve it from a runtime build-info endpoint. Avoid service-worker or browser caching for runtime build info, and keep `app.json` as a separate app-version fallback for local builds.

For in-app update prompts, expose only `registration.waiting`; do not fall back to an `installing` worker when its state becomes installed. After requesting activation, reload on either `controllerchange` or the waiting worker reaching `activated`. A timeout only means the handoff was not observed; it does not establish that the user's network is offline.

**Why:** Posting `SKIP_WAITING` to a worker that is not actually waiting can leave the old page open without a `controllerchange`, producing a misleading connection error.

**How to apply:** Validate the worker state before offering an update, observe activation as a fallback to the controller event, and use error copy that recommends retrying the reload rather than assuming connectivity failed.