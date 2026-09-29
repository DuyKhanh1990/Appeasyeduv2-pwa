---
name: React Native Modal stacking — New Architecture
description: With newArchEnabled:true (RN 0.73+), two Modals visible simultaneously do not work — the second one never renders. Always ensure only one Modal is visible at a time.
---

# React Native Modal stacking — New Architecture

## Rule
With `newArchEnabled: true` (React Native New Architecture, RN 0.73+), **only one `<Modal>` should be `visible` at any time**. Two simultaneously-visible Modals causes the second one to silently not render — the screen appears frozen/blank.

## Why
The New Architecture's rendering pipeline does not support stacked native modal windows the way the old architecture did. The second modal simply never mounts visually.

## How to apply
- When Modal B should open "on top of" Modal A, set Modal A's `visible` to `false` while B is open: `visible={showA && !showB}`.
- State for Modal A (form inputs, selections) is preserved in React state even while the modal is hidden — no data is lost.
- Never swap content (change children + style) inside a single already-visible Modal either — the layout engine gets confused.
- The member-search picker in `artifacts/edu-mobile/app/(tabs)/chat.tsx` uses: `visible={showCreateGroup && !showMemberSearch}` for the create-group modal.
