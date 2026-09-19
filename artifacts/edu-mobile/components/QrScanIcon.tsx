import Svg, { Path, Rect } from "react-native-svg";

export function QrScanIcon({
  color = "#fff",
  size = 24,
}: {
  color?: string;
  size?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" accessibilityLabel="Quét mã QR">
      <Path
        d="M4 9V5h4M16 5h4v4M20 15v4h-4M8 19H4v-4"
        stroke={color}
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Rect x="7" y="7" width="3" height="3" rx="0.5" fill={color} />
      <Rect x="14" y="7" width="3" height="3" rx="0.5" fill={color} />
      <Rect x="7" y="14" width="3" height="3" rx="0.5" fill={color} />
      <Path
        d="M14 14h2v2h-2zM17 17h3M17 14h1v1M14 17h1"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}