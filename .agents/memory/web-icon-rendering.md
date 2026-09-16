---
name: Web icon rendering
description: Why direct SVG is safer than icon fonts for important icons in the proxied Expo web preview.
---

Important header and summary-card icons should use direct SVG paths when the web preview is involved; icon fonts can fail selectively even when sibling glyphs render.

**Why:** The proxied Expo web build has shown inconsistent font-icon rendering: a notification bell and a summary-card book glyph disappeared while other icons from the same family remained visible.

**How to apply:** Use `react-native-svg` for prominent, essential icons that must be visible in the PWA. Keep font icons for secondary controls only when their fallback behavior is acceptable.