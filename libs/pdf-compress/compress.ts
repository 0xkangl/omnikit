import { PDFDocument } from "pdf-lib";
import type { CompressProgress } from "./types";

const RENDER_DPI = 150;
const PDF_DPI = 72;
export const SCALE_FACTOR = RENDER_DPI / PDF_DPI;

/**
 * Validate that a buffer starts with the PDF magic bytes.
 * Works in Node — no browser APIs needed.
 */
export function validatePdfBuffer(data: ArrayBuffer): void {
  if (!data || data.byteLength === 0) {
    throw new Error("Invalid PDF: empty buffer");
  }
  const header = new Uint8Array(data.slice(0, 5));
  const headerStr = String.fromCharCode(...header);
  if (headerStr !== "%PDF-") {
    throw new Error("Invalid PDF: not a valid PDF file");
  }
}

/**
 * Map UI quality (1–100) to Canvas JPEG quality (0.01–1.0).
 * Pure function — testable in Node.
 */
export function mapQuality(value: number): number {
  return Math.max(0.01, Math.min(1, value / 100));
}

/**
 * Convert a Canvas element to JPEG bytes.
 * Browser-only — uses canvas.toBlob.
 */
function canvasToJpegBytes(canvas: HTMLCanvasElement, quality: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Canvas toBlob returned null"));
          return;
        }
        blob.arrayBuffer().then((buf) => resolve(new Uint8Array(buf)));
      },
      "image/jpeg",
      quality
    );
  });
}

/**
 * Compress a PDF by re-rendering each page as JPEG at the given quality.
 * Browser-only — requires Canvas and pdf.js.
 *
 * @param data - Original PDF ArrayBuffer
 * @param quality - UI quality 1–100
 * @param onProgress - Optional progress callback
 * @returns Compressed PDF as Uint8Array
 */
export async function compressPdf(
  data: ArrayBuffer,
  quality: number,
  onProgress?: (progress: CompressProgress) => void
): Promise<Uint8Array> {
  validatePdfBuffer(data);

  const jpegQuality = mapQuality(quality);

  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  // Copy buffer — pdfjs may transfer (detach) the underlying ArrayBuffer
  const pdf = await pdfjs.getDocument({
    data: new Uint8Array(data.slice(0)),
  }).promise;
  const numPages = pdf.numPages;

  const newDoc = await PDFDocument.create();

  for (let i = 1; i <= numPages; i++) {
    onProgress?.({ current: i, total: numPages });

    try {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 1 });
      const scaledViewport = page.getViewport({ scale: SCALE_FACTOR });

      const canvas = document.createElement("canvas");
      canvas.width = scaledViewport.width;
      canvas.height = scaledViewport.height;

      const ctx = canvas.getContext("2d")!;
      await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;

      const jpegBytes = await canvasToJpegBytes(canvas, jpegQuality);

      const jpgImage = await newDoc.embedJpg(jpegBytes);
      const newPage = newDoc.addPage([viewport.width, viewport.height]);
      newPage.drawImage(jpgImage, {
        x: 0,
        y: 0,
        width: viewport.width,
        height: viewport.height,
      });

      // Cleanup canvas memory
      canvas.width = 0;
      canvas.height = 0;
    } catch {
      // Skip failed pages — log and continue
      console.warn(`Failed to compress page ${i}`);
    }
  }

  pdf.destroy();

  // Guard: if all pages failed, the result has no pages
  if (newDoc.getPageCount() === 0) {
    throw new Error("Failed to compress any pages");
  }

  return newDoc.save();
}
