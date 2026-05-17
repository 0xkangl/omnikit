import { formatKeyFromMime } from "./types";

export interface ImageMeta {
  format: string; // e.g. "png", "jpeg", "webp"
  size: number; // byte size
  width: number; // pixels
  height: number; // pixels
}

export function extractImageDataUrlMeta(dataUrl: string): Pick<ImageMeta, "format" | "size"> {
  const mimeMatch = dataUrl.match(/^data:(image\/[^;]+);/);
  const mime = mimeMatch?.[1] ?? "image/png";
  const format = formatKeyFromMime(mime);
  const base64 = dataUrl.split(",")[1] ?? "";
  // Base64 encodes 3 bytes per 4 chars; strip trailing padding
  const size =
    Math.ceil((base64.length * 3) / 4) - (base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0);
  return { format, size };
}

export function loadImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = dataUrl;
  });
}
