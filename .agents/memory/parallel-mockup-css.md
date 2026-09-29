---
name: Parallel mockup CSS
description: Prevents stylesheet collisions when multiple design workers build sibling mockup variants
---

When multiple design workers build mockup variants in parallel, each worker must write to an isolated component stylesheet or coordinate shared token changes through one owner. A shared group stylesheet can be overwritten by the last worker and leave another preview unstyled.

**Why:** Parallel homepage variants once rendered correctly except for one raw, unstyled frame because workers rewrote the same group stylesheet.

**How to apply:** Keep shared tokens stable during fan-out; use per-variant CSS files for structural and visual rules, then run a build and screenshot each frame before presenting.