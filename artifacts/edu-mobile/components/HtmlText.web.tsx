import React from "react";

interface HtmlTextProps {
  html: string;
  style?: React.CSSProperties;
  /** Constrain images to a thumbnail size (like the editor view). Default: false */
  compactImages?: boolean;
  /** Keep embedded video sources detached until the viewer taps Play. */
  deferVideoLoading?: boolean;
}

/** Remove empty/whitespace-only paragraphs that rich-text editors love to insert */
function cleanHtml(html: string, deferVideoLoading = false): string {
  const cleaned = html
    // <p></p>, <p> </p>, <p>&nbsp;</p>, <p><br></p>, <p><br/></p>
    .replace(/<p[^>]*>(\s|&nbsp;|<br\s*\/?>)*<\/p>/gi, "")
    .trim();

  if (!deferVideoLoading) return cleaned;

  return cleaned.replace(
    /<video\b([^>]*)>([\s\S]*?)<\/video>/gi,
    (match, attributes: string, contents: string) => {
      const hasSource =
        /\ssrc\s*=/i.test(attributes) || /<source\b[^>]*\ssrc\s*=/i.test(contents);
      if (!hasSource) return match;

      const moveSource = (input: string) =>
        input.replace(
          /(\s)src(\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi,
          (_sourceMatch, space: string, equals: string, doubleQuoted?: string, singleQuoted?: string, unquoted?: string) => {
            const source = doubleQuoted ?? singleQuoted ?? unquoted ?? "";
            const escaped = source
              .replace(/&/g, "&amp;")
              .replace(/"/g, "&quot;")
              .replace(/</g, "&lt;");
            return `${space}data-deferred-src${equals}"${escaped}"`;
          },
        );

      let deferredAttributes = moveSource(attributes)
        .replace(/\s+preload\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
        .replace(/\s+autoplay(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi, "");
      if (!/\scontrols(?:\s|=|$)/i.test(deferredAttributes)) {
        deferredAttributes += " controls";
      }
      if (!/\splaysinline(?:\s|=|$)/i.test(deferredAttributes)) {
        deferredAttributes += " playsinline";
      }

      const deferredContents = contents.replace(
        /<source\b([^>]*)>/gi,
        (_sourceMatch: string, sourceAttributes: string) =>
          `<source${moveSource(sourceAttributes)}>`,
      );
      return `<div class="htc-deferred-video"><button class="htc-deferred-video-trigger" type="button" aria-label="Tải và phát video"><span class="htc-deferred-video-play">▶</span><span>Chạm để tải và phát video</span></button><video${deferredAttributes} preload="none">${deferredContents}</video></div>`;
    },
  );
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
.htc-deferred-video { margin: 6px 0; }
.htc-deferred-video-trigger {
  width: 100%; min-height: 190px; border: 0; border-radius: 8px;
  background: #111827; color: #fff; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 8px;
  font: 600 14px -apple-system, BlinkMacSystemFont, sans-serif;
}
.htc-deferred-video-play {
  width: 54px; height: 54px; border-radius: 50%; background: #ffffff2b;
  display: grid; place-items: center; font-size: 22px; padding-left: 3px;
}
.htc-deferred-video video { display: none; width: 100%; }
.htc-deferred-video.is-active video { display: block; }
.htc-deferred-video.is-active .htc-deferred-video-trigger { display: none; }
`;

export function HtmlText({ html, style, compactImages, deferVideoLoading }: HtmlTextProps) {
  const cleaned = cleanHtml(html, deferVideoLoading);

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!deferVideoLoading) return;
    const target = event.target as HTMLElement;
    const trigger = target.closest<HTMLButtonElement>(".htc-deferred-video-trigger");
    if (!trigger || !event.currentTarget.contains(trigger)) return;

    const card = trigger.parentElement;
    const video = card?.querySelector<HTMLVideoElement>("video");
    if (!card || !video) return;

    const directSource = video.getAttribute("data-deferred-src");
    if (directSource) {
      video.setAttribute("src", directSource);
      video.removeAttribute("data-deferred-src");
    }
    video.querySelectorAll<HTMLSourceElement>("source[data-deferred-src]").forEach((source) => {
      source.setAttribute("src", source.getAttribute("data-deferred-src") || "");
      source.removeAttribute("data-deferred-src");
    });

    card.classList.add("is-active");
    video.load();
    const playRequest = video.play();
    if (playRequest) void playRequest.catch(() => {});
  };

  return (
    <>
      <style>{STYLE}</style>
      <div
        className={compactImages ? "htc htc-compact" : "htc"}
        dangerouslySetInnerHTML={{ __html: cleaned }}
        onClick={handleClick}
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
