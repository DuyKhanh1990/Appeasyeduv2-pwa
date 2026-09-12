---
name: Android RefreshControl blank box artifact
description: Why unstyled pull-to-refresh cards can show a stray gray/white/colored box or curved line near the first list item on Android builds (edu-mobile Expo app)
---

On Android (RN 0.81 + newArchEnabled/Fabric), `<RefreshControl refreshing tintColor={...} />` with no
`colors` (Android spinner color array) or `progressBackgroundColor` renders its native spinner track
as an unstyled default box. On some screens this shows as a stray gray/white rectangle near the first
list item; it is easy to mistake for a per-card `shadowColor/shadowOffset/elevation` + `borderLeftWidth`
rendering bug (which is a *real*, separate issue — that combo also draws detached shadow boxes past
rounded/left-bordered cards on Fabric) because both look like "a box/line painted to the left of a card".

**Why:** Confirmed by a card (`ScoreSheetCard` in `grades.tsx`) that has zero shadow/border-left styling
yet still showed the same artifact — proving RefreshControl was the actual cause there, not card shadows.

**How to apply:** When a user reports a stray box/line artifact near cards on an Android build, check
BOTH: (1) every `<RefreshControl>` on that screen — add `colors={[colors.primary]}` and
`progressBackgroundColor={colors.card}` (or equivalent theme colors) so Android renders a themed
circular spinner instead of the default box; (2) any card style combining legacy `shadowColor/shadowOffset/
shadowOpacity/shadowRadius` + `elevation` with `borderRadius`/`borderLeftWidth` — migrate to the `boxShadow`
style string prop instead, since that combo doesn't clip correctly under Fabric. Don't assume it's only one
or the other; verify against a card with no shadow styling to isolate which cause is active.
