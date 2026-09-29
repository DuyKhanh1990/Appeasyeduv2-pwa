import React, { useState } from "react";
import { Text, View } from "react-native";
import { WebView } from "react-native-webview";
import type { StyleProp, TextStyle } from "react-native";

interface HtmlTextProps {
  html: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  /** Web-only: constrain images to thumbnail size. Ignored on native. */
  compactImages?: boolean;
}

function stripHtml(html: string): string {
  return html
    // <pre> blocks: strip inner HTML tags but keep the text content.
    .replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_, inner) => {
      const code = inner
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      return code ? "\n" + code + "\n" : "";
    })
    .replace(/<p[^>]*>\s*(<br\s*\/?>)?\s*(&nbsp;)?\s*<\/p>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<\/?(ul|ol|blockquote|div|h[1-6])[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{2,}/g, "\n\n")
    .trim();
}

/** Full rich HTML renderer via WebView — used when no numberOfLines truncation is needed */
function HtmlTextFull({ html, style, compactImages }: { html: string; style?: StyleProp<TextStyle>; compactImages?: boolean }) {
  const [height, setHeight] = useState(40);

  // Extract color from style for the WebView
  const flatStyle = style as any;
  const textColor = flatStyle?.color ?? "#111827";

  const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: transparent; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif;
      font-size: 13px;
      line-height: 1.65;
      color: ${textColor};
      word-break: break-word;
      overflow-x: hidden;
      white-space: pre-line;
    }
    p { margin: 0 0 6px 0; white-space: pre-line; }
    p:last-child { margin-bottom: 0; }
    h1, h2, h3, h4, h5, h6 { font-weight: 600; margin: 10px 0 6px; line-height: 1.3; }
    ul, ol { padding-left: 20px; margin: 0 0 8px; }
    li { margin-bottom: 3px; }
    strong, b { font-weight: 600; }
    em, i { font-style: italic; }
    a { color: #6366f1; text-decoration: none; }
    blockquote {
      border-left: 3px solid #d1d5db;
      padding-left: 10px;
      color: #6b7280;
      margin: 6px 0;
    }
    pre {
      background: #f3f4f6;
      border-radius: 6px;
      padding: 10px 12px;
      overflow-x: auto;
      font-size: 0.85em;
      margin: 6px 0;
      white-space: pre-wrap;
      word-break: break-all;
    }
    code {
      background: #f3f4f6;
      border-radius: 3px;
      font-family: monospace;
      font-size: 0.88em;
      padding: 1px 4px;
    }
    pre code { background: none; padding: 0; }
    img {
      max-width: ${compactImages ? "min(100%, 140px)" : "100%"};
      max-height: ${compactImages ? "110px" : "none"};
      height: auto;
      border-radius: 6px;
      display: ${compactImages ? "inline-block" : "block"};
      margin: ${compactImages ? "4px 4px 0 0" : "6px 0 0 0"};
      object-fit: cover;
    }
    video { max-width: 100%; border-radius: 6px; display: block; margin: 6px 0; }
    table { width: 100%; border-collapse: collapse; font-size: 0.88em; margin: 8px 0; }
    th, td { border: 1px solid #e5e7eb; padding: 5px 8px; text-align: left; }
    th { background: #f9fafb; font-weight: 600; }
  </style>
</head>
<body>
${html}
<script>
  function sendHeight() {
    var h = document.body.scrollHeight;
    window.ReactNativeWebView.postMessage(JSON.stringify({ height: h }));
  }
  window.addEventListener('load', sendHeight);
  var imgs = document.querySelectorAll('img');
  for (var i = 0; i < imgs.length; i++) {
    imgs[i].addEventListener('load', sendHeight);
    imgs[i].addEventListener('error', sendHeight);
  }
  setTimeout(sendHeight, 300);
  setTimeout(sendHeight, 800);
</script>
</body>
</html>`;

  return (
    <View style={{ height, minHeight: 20 }}>
      <WebView
        source={{ html: fullHtml }}
        scrollEnabled={false}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        originWhitelist={["*"]}
        style={{ flex: 1, backgroundColor: "transparent" }}
        onMessage={(e) => {
          try {
            const parsed = JSON.parse(e.nativeEvent.data);
            if (parsed.height && parsed.height > 0) {
              setHeight(Math.ceil(parsed.height) + 4);
            }
          } catch {}
        }}
      />
    </View>
  );
}

export function HtmlText({ html, style, numberOfLines, compactImages }: HtmlTextProps) {
  // When numberOfLines is set we need native Text truncation — strip HTML to plain text.
  // Otherwise render full rich HTML (with images) via WebView.
  if (numberOfLines !== undefined) {
    return (
      <Text style={[{ fontSize: 13, lineHeight: 20 }, style]} numberOfLines={numberOfLines}>
        {stripHtml(html)}
      </Text>
    );
  }
  return <HtmlTextFull html={html} style={style} compactImages={compactImages} />;
}
