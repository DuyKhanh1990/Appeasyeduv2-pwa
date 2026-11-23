import { getCenterUrl } from "@/lib/api";

export interface AssignmentFile {
  name: string;
  url: string;
  mimetype?: string;
  type?: string;
  size?: number;
}

/**
 * Web assignment APIs can return legacy /uploads paths, media-proxy paths, or
 * absolute object URLs. Resolve backend-relative file routes against the
 * connected center; preserve S3 and other absolute URLs unchanged.
 */
export function resolveAssignmentFileUrl(url: string): string {
  const isAbsoluteUrl = /^(?:https?:)?\/\//i.test(url);
  const isBackendFilePath =
    url.startsWith("/uploads/") ||
    /^\/api\/media\/proxy(?:[/?#]|$)/i.test(url);
  if (isAbsoluteUrl || !isBackendFilePath) return url;
  const centerUrl = getCenterUrl()?.replace(/\/+$/, "");
  return centerUrl ? `${centerUrl}${url}` : url;
}

export function normalizeAssignmentFiles(value: unknown): AssignmentFile[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): AssignmentFile[] => {
    if (typeof entry === "string") {
      return [{ name: "File đính kèm", url: resolveAssignmentFileUrl(entry) }];
    }
    if (!entry || typeof entry !== "object") return [];
    const file = entry as Partial<AssignmentFile>;
    if (typeof file.url !== "string") return [];
    return [{
      ...file,
      name: typeof file.name === "string" && file.name ? file.name : "File đính kèm",
      url: resolveAssignmentFileUrl(file.url),
    }];
  });
}

export function resolveAssignmentHtmlUrls(html?: string | null): string | null | undefined {
  if (!html) return html;
  return html.replace(
    /\b(src|href)\s*=\s*(["'])([^"']+)\2/gi,
    (match, attribute: string, quote: string, url: string) => {
      const resolvedUrl = resolveAssignmentFileUrl(url);
      return resolvedUrl === url ? match : `${attribute}=${quote}${resolvedUrl}${quote}`;
    },
  );
}
