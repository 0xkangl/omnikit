import type { RenderOptions, RenderResult, RenderProgress } from "./types";

/**
 * Returns total page count from a PDF ArrayBuffer.
 * Uses pdfjs-dist (already in project) to avoid extra dependency.
 */
export async function getPdfPageCount(data: ArrayBuffer): Promise<number> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const pdf = await pdfjs.getDocument({
    data: new Uint8Array(data.slice(0)),
  }).promise;
  const count = pdf.numPages;
  pdf.destroy();
  return count;
}

/**
 * Renders a single PDF page to an image Blob.
 * Does NOT call pdf.destroy() — caller manages the PDF lifecycle.
 */
async function renderPage(
  pdf: any,
  pageIndex: number,
  options: RenderOptions
): Promise<RenderResult> {
  // pdfjs uses 1-indexed pages
  const page = await pdf.getPage(pageIndex + 1);
  const viewport = page.getViewport({ scale: options.scale });

  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  const ctx = canvas.getContext("2d")!;

  // Fill white background for JPEG (no alpha channel support)
  if (options.format === "jpeg") {
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  await page.render({ canvasContext: ctx, viewport }).promise;

  const mimeType = `image/${options.format}`;
  const quality = options.format === "png" ? undefined : options.quality / 100;

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error(`Failed to render page ${pageIndex + 1}`));
      },
      mimeType,
      quality
    );
  });

  const width = canvas.width;
  const height = canvas.height;

  // Release canvas memory
  canvas.width = 0;
  canvas.height = 0;

  return { blob, width, height, pageIndex };
}

/**
 * Renders selected PDF pages to image Blobs.
 * Loads PDF once, renders pages one at a time (memory-safe), then destroys the PDF document.
 * Calls onProgress after each page completes.
 */
export async function renderPagesToBlobs(
  data: ArrayBuffer,
  pageIndices: number[],
  options: RenderOptions,
  onProgress?: (progress: RenderProgress) => void
): Promise<RenderResult[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const version = pdfjs.version;
  const pdf = await pdfjs.getDocument({
    data: new Uint8Array(data.slice(0)),
    cMapUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${version}/cmaps/`,
    cMapPacked: true,
  }).promise;

  const results: RenderResult[] = [];
  const total = pageIndices.length;

  for (let i = 0; i < total; i++) {
    onProgress?.({ current: i + 1, total });
    results.push(await renderPage(pdf, pageIndices[i], options));
  }

  pdf.destroy();
  return results;
}
