import { StyleSheet, type ViewStyle } from "react-native";

export const TAB_BAR_CONTENT_HEIGHT = 64;
export const WEB_BOTTOM_INSET_FALLBACK = 16;

export function getTabBarStyle({
  backgroundColor,
  borderColor,
  bottomInset,
  transparent,
}: {
  backgroundColor: string;
  borderColor: string;
  bottomInset: number;
  transparent: boolean;
}): ViewStyle {
  return {
    position: "absolute",
    backgroundColor: transparent ? "transparent" : backgroundColor,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: borderColor,
    elevation: 0,
    height: TAB_BAR_CONTENT_HEIGHT + bottomInset,
    paddingBottom: bottomInset,
    paddingTop: 6,
  };
}