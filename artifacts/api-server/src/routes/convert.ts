import { Router, type IRouter, type Request, type Response } from "express";
import mammoth from "mammoth";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

/**
 * GET /api/convert/docx?url=<fileUrl>
 *
 * Converts a .docx file (stored in object storage) to HTML.
 * Accepts either:
 *  - a relative path:  /api/storage/objects/uploads/uuid
 *  - an absolute URL:  https://domain/api/storage/objects/uploads/uuid
 *
 * Returns: { html: string }
 */
router.get("/convert/docx", async (req: Request, res: Response) => {
  const rawUrl = (req.query.url as string) || "";
  if (!rawUrl) {
    return res.status(400).json({ message: "Thiếu tham số url" });
  }

  try {
    // Extract the object path from the URL, e.g. "uploads/uuid"
    let objectServingPath: string | null = null;

    const STORAGE_PREFIX = "/api/storage/objects/";
    let pathname = rawUrl;
    try {
      // Handle absolute URLs
      if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
        pathname = new URL(rawUrl).pathname;
      }
    } catch {}

    if (pathname.startsWith(STORAGE_PREFIX)) {
      objectServingPath = pathname.slice(STORAGE_PREFIX.length);
    }

    let buffer: Buffer;

    if (objectServingPath) {
      // Fetch directly from object storage — no auth required on server side
      const objectFile = await objectStorageService.getObjectEntityFile(
        `/objects/${objectServingPath}`
      );
      const response = await objectStorageService.downloadObject(objectFile);
      buffer = Buffer.from(await response.arrayBuffer());
    } else {
      // Fallback: fetch via HTTP (for fully external public URLs)
      const response = await fetch(rawUrl, { signal: AbortSignal.timeout(15_000) });
      if (!response.ok) {
        return res.status(502).json({ message: `Không tải được file: HTTP ${response.status}` });
      }
      buffer = Buffer.from(await response.arrayBuffer());
    }

    const result = await mammoth.convertToHtml({ buffer });
    return res.json({ html: result.value });
  } catch (err) {
    if (err instanceof ObjectNotFoundError) {
      return res.status(404).json({ message: "Không tìm thấy file" });
    }
    console.error("GET /convert/docx error:", err);
    return res.status(500).json({ message: "Lỗi khi chuyển đổi file" });
  }
});

export default router;
