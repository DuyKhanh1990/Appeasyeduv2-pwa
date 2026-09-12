/**
 * PostHtmlContent.web.tsx — Expo Web
 * Renders rich HTML using dangerouslySetInnerHTML (same engine as HtmlText.web.tsx).
 */
import React from "react";

interface Props {
  html: string;
  textColor?: string;
}

function cleanHtml(html: string): string {
  return html
    .replace(/<p[^>]*>(\s|&nbsp;|<br\s*\/?>)*<\/p>/gi, "")
    .trim();
}

const CSS = `
.phtc * { box-sizing: border-box; }
.phtc {
  font-family: Inter_400Regular, -apple-system, BlinkMacSystemFont, sans-serif;
  font-size: 15px;
  line-height: 1.65;
  word-break: break-word;
}
.phtc p { margin: 0 0 10px 0; }
.phtc p:last-child { margin-bottom: 0; }
.phtc h1,.phtc h2,.phtc h3,.phtc h4,.phtc h5,.phtc h6 {
  font-weight: 600; margin: 14px 0 6px; line-height: 1.3;
}
.phtc ul, .phtc ol { padding-left: 20px; margin: 0 0 10px; }
.phtc li { margin-bottom: 4px; }
.phtc strong, .phtc b { font-weight: 600; }
.phtc em, .phtc i { font-style: italic; }
.phtc a { color: #6366f1; }
.phtc blockquote {
  border-left: 3px solid #d1d5db; padding-left: 12px;
  color: #6b7280; margin: 8px 0;
}
.phtc pre {
  background: #f3f4f6; border-radius: 6px; padding: 12px;
  overflow-x: auto; margin: 8px 0; white-space: pre-wrap; word-break: break-all;
}
.phtc code {
  background: #f3f4f6; border-radius: 3px;
  font-family: monospace; font-size: 13px; padding: 2px 5px;
}
.phtc pre code { background: none; padding: 0; }
.phtc img { max-width: 100%; height: auto; border-radius: 8px; display: block; margin: 8px 0; }
.phtc video { max-width: 100%; border-radius: 8px; display: block; margin: 8px 0; }
.phtc table { width: 100%; border-collapse: collapse; font-size: 13px; margin: 8px 0; }
.phtc th, .phtc td { border: 1px solid #e5e7eb; padding: 6px 8px; text-align: left; }
.phtc th { background: #f9fafb; font-weight: 600; }
`;

export function PostHtmlContent({ html, textColor = "#111827" }: Props) {
  return (
    <>
      <style>{CSS}</style>
      <div
        className="phtc"
        dangerouslySetInnerHTML={{ __html: cleanHtml(html) }}
        style={{ color: textColor }}
      />
    </>
  );
}
