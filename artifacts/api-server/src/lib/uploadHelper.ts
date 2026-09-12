import type { Express } from "express";
import { ObjectStorageService } from "./objectStorage";

const objectStorageService = new ObjectStorageService();

export interface UploadedFileResult {
  name: string;
  url: string;
  size: number;
  mimetype: string;
}

/**
 * Uploads an in-memory multer file buffer to object storage and returns
 * a servable URL under /api/storage/objects/*.
 */
export async function uploadBufferToObjectStorage(file: {
  originalname: string;
  buffer: Buffer;
  size: number;
  mimetype: string;
}): Promise<UploadedFileResult> {
  const uploadURL = await objectStorageService.getObjectEntityUploadURL();
  const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

  const putResponse = await fetch(uploadURL, {
    method: "PUT",
    body: file.buffer,
    headers: {
      "Content-Type": file.mimetype || "application/octet-stream",
    },
  });

  if (!putResponse.ok) {
    throw new Error(`Không thể tải file lên: HTTP ${putResponse.status}`);
  }

  const servingPath = objectPath.replace(/^\/objects\//, "");

  return {
    name: file.originalname,
    url: `/api/storage/objects/${servingPath}`,
    size: file.size,
    mimetype: file.mimetype || "application/octet-stream",
  };
}

export type MulterFile = Express.Multer.File;
