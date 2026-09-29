import React from "react";

interface HtmlTextProps {
  html: string;
  style?: React.CSSProperties;
  /** Constrain images to a thumbnail size (like the editor view). Default: false */
  compactImages?: boolean;
}

/** Remove empty/whitespace-only paragraphs that rich-text editors love to insert */
function cleanHtml(html: string): string {
  return html
    // <p></p>, <p> </p>, <p>&nbsp;</p>, <p><br></p>, <p><br/></p>
    .replace(/<p[^>]*>(\s|&nbsp;|<br\s*\/?>)*<\/p>/gi, "")
    .trim();
}

const STYLE = `
.htc * { box-sizing: border-box; }
.htc { white-space: pre-line; }
.htc p  { margin: 0 0 6px 0; white-space: pre-line; }
.htc p:last-child { margin-bottom: 0; }
.htc ul, .htc ol { margin: 0 0 8px 0; padding-left: 20px; }
.htc li { margin-bottom: 3px; }
.htc strong, .htc b { font-weight: 600; }
.htc em, .htc i { font-style: italic; }
.htc code {
  background: #f3f4f6;
  border-radius: 3px;
  font-size: 0.88em;
  padding: 1px 4px;
  font-family: monospace;
}
.htc pre {
  background: #f3f4f6;
  border-radius: 6px;
  padding: 10px 12px;
  overflow-x: auto;
  font-size: 0.85em;
  margin: 6px 0;
  white-space: pre-wrap;
  word-break: break-all;
}
.htc pre code { background: none; padding: 0; }
.htc a { color: #6366f1; }
.htc blockquote {
  border-left: 3px solid #d1d5db;
  padding-left: 10px;
  color: #6b7280;
  margin: 6px 0;
}
.htc h1,.htc h2,.htc h3,.htc h4,.htc h5,.htc h6 {
  font-weight: 600;
  margin: 10px 0 6px;
  line-height: 1.3;
}
.htc img { max-width: 100%; height: auto; border-radius: 6px; display: block; margin-top: 6px; }
.htc-compact img { max-width: min(100%, 180px); max-height: 180px; object-fit: contain; display: inline-block; margin: 4px 4px 0 0; }
.htc table { width: 100%; border-collapse: collapse; font-size: 0.88em; margin: 8px 0; }
.htc th, .htc td { border: 1px solid #e5e7eb; padding: 5px 8px; text-align: left; }
.htc th { background: #f9fafb; font-weight: 600; }
`;

export function HtmlText({ html, style, compactImages }: HtmlTextProps) {
  const cleaned = cleanHtml(html);
  return (
    <>
      <style>{STYLE}</style>
      <div
        className={compactImages ? "htc htc-compact" : "htc"}
        dangerouslySetInnerHTML={{ __html: cleaned }}
        style={{
          fontSize: 13,
          lineHeight: 1.65,
          fontFamily: "Inter_400Regular, -apple-system, BlinkMacSystemFont, sans-serif",
          color: "inherit",
          wordBreak: "break-word",
          ...style,
          // lineHeight from RN style is pixels (e.g. 23), convert to unitless ratio
          ...(typeof (style as any)?.lineHeight === "number" && (style as any).lineHeight > 5
            ? { lineHeight: `${(style as any).lineHeight}px` }
            : {}),
        }}
      />
    </>
  );
}
