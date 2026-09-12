import { Router, type IRouter } from "express";
import multer from "multer";
import { requireAuth } from "../middlewares/requireAuth";
import { uploadBufferToObjectStorage } from "../lib/uploadHelper";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

/**
 * POST /upload
 *
 * Generic multipart file upload endpoint used by mobile clients.
 * Accepts one or more files under the "files" field and returns
 * their servable URLs.
 */
router.post("/upload", requireAuth, upload.array("files"), async (req, res) => {
  try {
    const files = (req.files as Express.Multer.File[]) || [];
    if (files.length === 0) {
      return res.status(400).json({ message: "Không có file nào được gửi lên" });
    }

    const uploaded = await Promise.all(files.map((f) => uploadBufferToObjectStorage(f)));
    return res.status(201).json({ files: uploaded });
  } catch (err) {
    console.error("POST /upload error:", err);
    return res.status(500).json({ message: "Lỗi khi tải file lên" });
  }
});

export default router;
