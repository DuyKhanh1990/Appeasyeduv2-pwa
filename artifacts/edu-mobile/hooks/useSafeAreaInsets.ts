/**
 * Drop-in replacement for useSafeAreaInsets from react-native-safe-area-context.
 *
 * Problems solved:
 * 1. Android: with edgeToEdgeEnabled=true, insets.top can return 0 inside Modal
 *    components — fixed by flooring with StatusBar.currentHeight.
 * 2. iOS inside Modals: SafeAreaProvider context doesn't cross Modal boundaries,
 *    so useSafeAreaInsets() returns 0 for top inside any <Modal>.
 *    Fixed by caching the largest top inset seen at module level. Root-level
 *    screens always measure correctly; Modals use the cached value as a floor.
 */
import { Platform, StatusBar } from "react-native";
import { useSafeAreaInsets as _useSafeAreaInsets } from "react-native-safe-area-context";

// Module-level cache — persists across re-renders and Modal boundaries.
// Updated whenever a real (non-zero) inset is seen (i.e. at root screen level).
let _cachedTopInset = 0;

export function useSafeAreaInsets() {
  const insets = _useSafeAreaInsets();

  // Cache positive values — root screens will always provide the real inset.
  if (insets.top > 0) {
    _cachedTopInset = Math.max(_cachedTopInset, insets.top);
  }

  let top = insets.top;

  if (Platform.OS === "android") {
    // Android: StatusBar.currentHeight is always available even inside Modal.
    top = Math.max(top, StatusBar.currentHeight ?? 0, _cachedTopInset);
  } else if (Platform.OS === "ios") {
    // iOS: fall back to cached value when inside a Modal (insets.top === 0).
    top = Math.max(top, _cachedTopInset);
  }
  // web: leave as-is; web headers use the Platform.OS === "web" ? N : ... fallback
  // already present in each screen.

  return { ...insets, top };
}
