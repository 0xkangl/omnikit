/**
 * Render a PDF page to a data URL for preview.
 * Follows the same pattern as libs/pdf-merge/thumbnail.ts.
 */
export async function renderPreview(
  data: ArrayBuffer,
  maxWidth = 600,
  maxHeight = 800
): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  // Copy the buffer — pdfjs-dist may transfer (detach) the underlying ArrayBuffer
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(data.slice(0)) }).promise;
  const page = await pdf.getPage(1);

  const viewport = page.getViewport({ scale: 1 });
  const scale = Math.min(maxWidth / viewport.width, maxHeight / viewport.height);
  const scaledViewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = scaledViewport.width;
  canvas.height = scaledViewport.height;

  const ctx = canvas.getContext("2d")!;
  await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;

  const dataUrl = canvas.toDataURL("image/png");

  pdf.destroy();
  canvas.width = 0;
  canvas.height = 0;

  return dataUrl;
}
