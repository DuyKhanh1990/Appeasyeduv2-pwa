let activeImageZoomRequests = 0;
let originalViewportContent: string | null = null;

/**
 * Temporarily permits browser pinch zoom while a full-screen image is open.
 * The PWA locks page-level zoom everywhere else to keep app layouts steady.
 */
export function allowWebImageZoom(): () => void {
  if (typeof document === "undefined") return () => {};

  const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (!viewport) return () => {};

  if (activeImageZoomRequests === 0) {
    originalViewportContent = viewport.content;
    const withoutZoomSettings = viewport.content.replace(
      /,\s*(?:maximum-scale|user-scalable)=[^,]*/gi,
      "",
    );
    viewport.content = `${withoutZoomSettings}, maximum-scale=5, user-scalable=yes`;
  }
  activeImageZoomRequests += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeImageZoomRequests = Math.max(0, activeImageZoomRequests - 1);
    if (activeImageZoomRequests === 0 && originalViewportContent !== null) {
      const currentViewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
      if (currentViewport) currentViewport.content = originalViewportContent;
      originalViewportContent = null;
    }
  };
}
