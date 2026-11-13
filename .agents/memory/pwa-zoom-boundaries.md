---
name: PWA zoom boundaries
description: The EasyEdu PWA's page-level zoom policy and image-viewer exception.
---

Lock browser-level pinch zoom on ordinary PWA screens so the app layout does not shift. Full-screen image viewers may temporarily enable zoom; restore the page lock when they close. Native image zoom remains unchanged.

**Why:** The user reported that whole-page zoom makes the installed app look shifted, while image zoom is an intentional feature.

**How to apply:** When adding an image viewer, explicitly scope the browser zoom exception to that viewer rather than removing the PWA-wide viewport lock.
