import { v2 as cloudinary } from "cloudinary";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const uploadDir = path.resolve(process.cwd(), "uploads");

function cloudinaryConfigured() {
  return Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
}

export async function saveMedia(file: Express.Multer.File) {
  if (cloudinaryConfigured()) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });

    const result = await new Promise<{ secure_url: string; resource_type: string }>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream({ resource_type: "auto", folder: "hamza-and-shouq" }, (error, uploadResult) => {
        if (error || !uploadResult) reject(error ?? new Error("Upload failed"));
        else resolve({ secure_url: uploadResult.secure_url, resource_type: uploadResult.resource_type });
      });
      stream.end(file.buffer);
    });

    return { url: result.secure_url, type: result.resource_type };
  }

  await fs.mkdir(uploadDir, { recursive: true });
  const extension = path.extname(file.originalname);
  const filename = `${randomUUID()}${extension}`;
  const fullPath = path.join(uploadDir, filename);
  await fs.writeFile(fullPath, file.buffer);
  const publicBase = process.env.API_PUBLIC_URL ?? `http://localhost:${process.env.API_PORT ?? 4100}`;
  return { url: `${publicBase}/uploads/${filename}`, type: file.mimetype };
}
