/**
 * PostHtmlContent.tsx — native (iOS / Android)
 * Renders rich HTML from the news-feed content field using an auto-height WebView.
 */
import React, { useState } from "react";
import { View } from "react-native";
import { WebView } from "react-native-webview";

interface Props {
  html: string;
  textColor?: string;
}

export function PostHtmlContent({ html, textColor = "#111827" }: Props) {
  const [height, setHeight] = useState(120);

  const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: transparent; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif;
      font-size: 15px;
      line-height: 1.65;
      color: ${textColor};
      word-break: break-word;
      overflow-x: hidden;
    }
    p { margin: 0 0 10px 0; }
    p:last-child { margin-bottom: 0; }
    h1, h2, h3, h4, h5, h6 { font-weight: 600; margin: 14px 0 6px; line-height: 1.3; }
    ul, ol { padding-left: 20px; margin: 0 0 10px; }
    li { margin-bottom: 4px; }
    strong, b { font-weight: 600; }
    em, i { font-style: italic; }
    a { color: #6366f1; text-decoration: none; }
    blockquote {
      border-left: 3px solid #d1d5db;
      padding-left: 12px;
      color: #6b7280;
      margin: 8px 0;
    }
    pre {
      background: #f3f4f6;
      border-radius: 6px;
      padding: 12px;
      overflow-x: auto;
      margin: 8px 0;
      white-space: pre-wrap;
      word-break: break-all;
    }
    code {
      background: #f3f4f6;
      border-radius: 3px;
      font-family: monospace;
      font-size: 13px;
      padding: 2px 5px;
    }
    pre code { background: none; padding: 0; }
    img {
      max-width: 100%;
      height: auto;
      border-radius: 8px;
      display: block;
      margin: 8px 0;
    }
    video {
      max-width: 100%;
      border-radius: 8px;
      display: block;
      margin: 8px 0;
    }
    table { width: 100%; border-collapse: collapse; font-size: 13px; margin: 8px 0; }
    th, td { border: 1px solid #e5e7eb; padding: 6px 8px; text-align: left; }
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
    <View style={{ height, minHeight: 40 }}>
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
