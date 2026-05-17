import { PDFDocument } from "pdf-lib";

// --- Types ---

export type PageLayout = "fit" | "fill" | "grid-2" | "grid-4" | "grid-6" | "grid-9";
export type PageSize = "a4" | "letter" | "auto";
export type Orientation = "portrait" | "landscape";
export type Margin = "none" | "small" | "medium" | "large";
export type Alignment = "center" | "top-left";

export interface ImagesToPdfOptions {
  pageSize: PageSize;
  orientation: Orientation;
  layout: PageLayout;
  margin: Margin;
  alignment: Alignment;
}

export interface ImageInput {
  data: ArrayBuffer;
  width: number;
  height: number;
  format: "jpg" | "png";
}

// --- Constants ---

const PAGE_SIZES = {
  a4: { w: 595, h: 842 },
  letter: { w: 612, h: 792 },
} as const;

const MARGIN_PT: Record<Margin, number> = {
  none: 0,
  small: 10,
  medium: 20,
  large: 40,
};

const GRID_GAP = 4; // pts between grid cells

// --- Helpers ---

/** Resolve page dimensions based on size, orientation, and first image (for auto). */
function resolvePageSize(
  size: PageSize,
  orient: Orientation,
  firstImage: ImageInput | null
): { w: number; h: number } {
  if (size === "auto" && firstImage) {
    const base = { w: firstImage.width, h: firstImage.height };
    return orient === "landscape" ? { w: base.h, h: base.w } : base;
  }
  const base = PAGE_SIZES[size === "auto" ? "a4" : size];
  return orient === "landscape" ? { w: base.h, h: base.w } : { w: base.w, h: base.h };
}

/** Get available content area (page minus margins). */
function availableRect(
  pw: number,
  ph: number,
  margin: Margin
): { x: number; y: number; w: number; h: number } {
  const m = MARGIN_PT[margin];
  return { x: m, y: m, w: pw - 2 * m, h: ph - 2 * m };
}

/** Scale image dimensions to fit within available area (proportional). */
function fitIn(iw: number, ih: number, aw: number, ah: number): { w: number; h: number } {
  const s = Math.min(aw / iw, ah / ih);
  return { w: iw * s, h: ih * s };
}

/** Scale image dimensions to cover available area (proportional, center-crop). */
function coverOf(iw: number, ih: number, aw: number, ah: number): { w: number; h: number } {
  const s = Math.max(aw / iw, ah / ih);
  return { w: iw * s, h: ih * s };
}

/** Get grid dimensions (cols × rows) for a grid layout. */
function gridDims(layout: PageLayout): { cols: number; rows: number } | null {
  switch (layout) {
    case "grid-2":
      return { cols: 1, rows: 2 };
    case "grid-4":
      return { cols: 2, rows: 2 };
    case "grid-6":
      return { cols: 2, rows: 3 };
    case "grid-9":
      return { cols: 3, rows: 3 };
    default:
      return null;
  }
}

/** Number of images per page for a given layout. */
function imagesPerPage(layout: PageLayout): number {
  const g = gridDims(layout);
  return g ? g.cols * g.rows : 1;
}

/** Position image within available area based on alignment. PDF y-axis starts at bottom. */
function position(
  sw: number,
  sh: number,
  area: { x: number; y: number; w: number; h: number },
  align: Alignment
): { x: number; y: number } {
  if (align === "top-left") {
    // Top-left in PDF coords: top = area.y + area.height - imageHeight
    return { x: area.x, y: area.y + area.h - sh };
  }
  // Center: center both horizontally and vertically
  return {
    x: area.x + (area.w - sw) / 2,
    y: area.y + (area.h - sh) / 2,
  };
}

// --- Embedding ---

/** Embed an image into a PDFDocument. Uses data.slice(0) to prevent buffer detach. */
async function embedImage(doc: PDFDocument, img: ImageInput) {
  const bytes = new Uint8Array(img.data.slice(0));
  return img.format === "jpg" ? doc.embedJpg(bytes) : doc.embedPng(bytes);
}

// --- Layout Drawing ---

/** Draw a single image in fit mode (proportionally scaled to fit, positioned by alignment). */
function drawFit(
  doc: PDFDocument,
  page: ReturnType<typeof doc.addPage>,
  image: Awaited<ReturnType<typeof embedImage>>,
  img: ImageInput,
  pageSize: { w: number; h: number },
  opts: ImagesToPdfOptions
) {
  const area = availableRect(pageSize.w, pageSize.h, opts.margin);
  const { w: sw, h: sh } = fitIn(img.width, img.height, area.w, area.h);
  const pos = position(sw, sh, area, opts.alignment);
  page.drawImage(image, { x: pos.x, y: pos.y, width: sw, height: sh });
}

/** Draw a single image in fill mode (scaled to cover, center-cropped by page boundary). */
function drawFill(
  doc: PDFDocument,
  page: ReturnType<typeof doc.addPage>,
  image: Awaited<ReturnType<typeof embedImage>>,
  img: ImageInput,
  pageSize: { w: number; h: number },
  opts: ImagesToPdfOptions
) {
  const area = availableRect(pageSize.w, pageSize.h, opts.margin);
  const { w: sw, h: sh } = coverOf(img.width, img.height, area.w, area.h);
  // Center the oversized image in the available area.
  // Content outside the available area overflows into margins and beyond the page.
  // The PDF viewer clips content to the page boundary.
  const x = area.x + (area.w - sw) / 2;
  const y = area.y + (area.h - sh) / 2;
  page.drawImage(image, { x, y, width: sw, height: sh });
}

/** Draw multiple images in grid mode (N equal cells with gap). */
function drawGrid(
  doc: PDFDocument,
  page: ReturnType<typeof doc.addPage>,
  embedded: { image: Awaited<ReturnType<typeof embedImage>>; img: ImageInput }[],
  cols: number,
  rows: number,
  pageSize: { w: number; h: number },
  opts: ImagesToPdfOptions
) {
  const area = availableRect(pageSize.w, pageSize.h, opts.margin);
  const cellW = (area.w - (cols - 1) * GRID_GAP) / cols;
  const cellH = (area.h - (rows - 1) * GRID_GAP) / rows;

  for (let i = 0; i < embedded.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cellX = area.x + col * (cellW + GRID_GAP);
    // PDF y-axis: top row starts at top of available area
    const cellY = area.y + area.h - (row + 1) * cellH - row * GRID_GAP;

    const { w: sw, h: sh } = fitIn(embedded[i].img.width, embedded[i].img.height, cellW, cellH);
    // Center image within cell
    const x = cellX + (cellW - sw) / 2;
    const y = cellY + (cellH - sh) / 2;
    page.drawImage(embedded[i].image, { x, y, width: sw, height: sh });
  }
}

// --- Main Function ---

/** Convert an array of preprocessed images into a single PDF. */
export async function imagesToPdf(
  images: ImageInput[],
  options: ImagesToPdfOptions
): Promise<Uint8Array> {
  if (images.length === 0) {
    throw new Error("No images provided");
  }

  const pdfDoc = await PDFDocument.create();
  const pageSize = resolvePageSize(options.pageSize, options.orientation, images[0]);
  const perPage = imagesPerPage(options.layout);
  const grid = gridDims(options.layout);

  for (let i = 0; i < images.length; i += perPage) {
    const chunk = images.slice(i, i + perPage);
    const page = pdfDoc.addPage([pageSize.w, pageSize.h]);

    // Embed all images in this chunk
    const embedded = await Promise.all(
      chunk.map(async (img) => ({
        img,
        image: await embedImage(pdfDoc, img),
      }))
    );

    if (options.layout === "fill") {
      for (const { img, image } of embedded) {
        drawFill(pdfDoc, page, image, img, pageSize, options);
      }
    } else if (options.layout === "fit" || !grid) {
      // fit mode: one image per page (chunk.length === 1 when perPage === 1)
      for (const { img, image } of embedded) {
        drawFit(pdfDoc, page, image, img, pageSize, options);
      }
    } else {
      // grid mode
      drawGrid(pdfDoc, page, embedded, grid.cols, grid.rows, pageSize, options);
    }
  }

  return pdfDoc.save();
}

// Re-export constants for testing and preview
export { PAGE_SIZES, MARGIN_PT, GRID_GAP };
