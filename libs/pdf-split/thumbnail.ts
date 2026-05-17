export async function renderPageThumbnail(
  data: ArrayBuffer,
  pageIndex: number,
  maxWidth = 120,
  maxHeight = 160
): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  // Copy the buffer — pdfjs-dist may transfer (detach) the underlying ArrayBuffer
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(data.slice(0)) }).promise;
  const page = await pdf.getPage(pageIndex + 1); // pdfjs uses 1-indexed pages

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
