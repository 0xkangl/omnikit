# Images to PDF Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a browser-based tool at `/image-to-pdf` that converts multiple images (JPG, PNG, WebP, GIF) into a single PDF document with configurable layout modes, page settings, and drag-to-reorder image management.

**Architecture:** Pure client-side using pdf-lib for PDF generation. Business logic in `libs/image-to-pdf/main.ts` exports a single `imagesToPdf()` function. Page component `image-to-pdf-page.tsx` contains inline `useMultiImageInput` hook (multi-file state management with preprocessing), `MultiImageDropZone` (visual clone of existing ImageDropZone with `multiple`), and `ThumbnailList` (drag-reorder with virtual scroll via `@tanstack/react-virtual`). WebP/GIF images are canvas-converted to PNG at upload time.

**Tech Stack:** pdf-lib (already installed), @tanstack/react-virtual (already installed), HTML5 Drag & Drop API, file-selector (already installed), next-intl, Tailwind CSS 4

---

## File Structure

### New Files

| File                                              | Responsibility                                            |
| ------------------------------------------------- | --------------------------------------------------------- |
| `libs/image-to-pdf/main.ts`                       | Core: types, layout computation, `imagesToPdf()` function |
| `libs/image-to-pdf/__tests__/main.test.ts`        | Unit tests for layout algorithms and PDF generation       |
| `app/[locale]/image-to-pdf/page.tsx`              | Route entry — SEO metadata + JSON-LD                      |
| `app/[locale]/image-to-pdf/image-to-pdf-page.tsx` | Client component — all UI + interaction logic             |
| `public/locales/en/image-to-pdf.json`             | English UI strings + descriptions                         |
| `public/locales/zh-CN/image-to-pdf.json`          | Simplified Chinese UI strings                             |
| `public/locales/zh-TW/image-to-pdf.json`          | Traditional Chinese UI strings                            |
| `public/locales/ja/image-to-pdf.json`             | Japanese UI strings                                       |
| `public/locales/ko/image-to-pdf.json`             | Korean UI strings                                         |
| `public/locales/es/image-to-pdf.json`             | Spanish UI strings                                        |
| `public/locales/pt-BR/image-to-pdf.json`          | Portuguese (BR) UI strings                                |
| `public/locales/fr/image-to-pdf.json`             | French UI strings                                         |
| `public/locales/de/image-to-pdf.json`             | German UI strings                                         |
| `public/locales/ru/image-to-pdf.json`             | Russian UI strings                                        |

### Modified Files

| File                              | Change                                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------------------- |
| `libs/tools.ts`                   | Add `FileImage` icon import, tool entry, category, TOOL_RELATIONS (forward + reverse links) |
| `vitest.config.ts`                | Add `libs/image-to-pdf/**/*.test.ts` to include array                                       |
| `public/locales/en/tools.json`    | Add `image-to-pdf` entry (title, shortTitle, description)                                   |
| `public/locales/zh-CN/tools.json` | Add localized entry + searchTerms                                                           |
| `public/locales/zh-TW/tools.json` | Add localized entry + searchTerms                                                           |
| `public/locales/ja/tools.json`    | Add localized entry + searchTerms                                                           |
| `public/locales/ko/tools.json`    | Add localized entry + searchTerms                                                           |
| `public/locales/es/tools.json`    | Add localized entry                                                                         |
| `public/locales/pt-BR/tools.json` | Add localized entry                                                                         |
| `public/locales/fr/tools.json`    | Add localized entry                                                                         |
| `public/locales/de/tools.json`    | Add localized entry                                                                         |
| `public/locales/ru/tools.json`    | Add localized entry                                                                         |

---

## Task 1: Core PDF Generation Library

**Files:**

- Create: `libs/image-to-pdf/main.ts`

- [ ] **Step 1: Create the core library with types, constants, and helpers**

Create `libs/image-to-pdf/main.ts`:

```typescript
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

/** Embed an image into a PDFDocument. Uses data.slice(0) to prevent buffer detachment. */
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
```

- [ ] **Step 2: Commit**

```bash
git add libs/image-to-pdf/main.ts
git commit -m "feat(image-to-pdf): add core PDF generation library"
```

---

## Task 2: Unit Tests

**Files:**

- Create: `libs/image-to-pdf/__tests__/main.test.ts`

- [ ] **Step 1: Create comprehensive unit tests**

Create `libs/image-to-pdf/__tests__/main.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { imagesToPdf, PAGE_SIZES, MARGIN_PT } from "../main";
import type { ImageInput, ImagesToPdfOptions } from "../main";

// --- Minimal test image generators ---

// Minimal 1×1 white JPG (~285 bytes)
function createMinimalJpg(): ArrayBuffer {
  // Base64 of a valid minimal 1×1 white JPEG
  const b64 =
    "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AKwA//9k=";
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

// Minimal 1×1 transparent PNG (~67 bytes)
function createMinimalPng(): ArrayBuffer {
  const b64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQABNjN9GQAAAAlwSFlzAAAWJQAAFiUBSVIk8AAAAA0lEQVQI12P4z8BQDwAEgAF/QualGQAAAABJRU5ErkJggg==";
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function makeJpgImage(w = 100, h = 100): ImageInput {
  return { data: createMinimalJpg(), width: w, height: h, format: "jpg" };
}

function makePngImage(w = 100, h = 100): ImageInput {
  return { data: createMinimalPng(), width: w, height: h, format: "png" };
}

const defaultOpts: ImagesToPdfOptions = {
  pageSize: "a4",
  orientation: "portrait",
  layout: "fit",
  margin: "small",
  alignment: "center",
};

async function getPageCount(pdfBytes: Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(pdfBytes);
  return doc.getPageCount();
}

async function getPageSize(pdfBytes: Uint8Array, pageIndex = 0) {
  const doc = await PDFDocument.load(pdfBytes);
  const page = doc.getPage(pageIndex);
  return { w: page.getWidth(), h: page.getHeight() };
}

// --- Tests ---

describe("imagesToPdf", () => {
  it("throws on empty image list", async () => {
    await expect(imagesToPdf([], defaultOpts)).rejects.toThrow("No images provided");
  });

  it("creates a single-page PDF for a single image (fit layout)", async () => {
    const pdf = await imagesToPdf([makeJpgImage()], defaultOpts);
    expect(await getPageCount(pdf)).toBe(1);
  });

  it("creates N pages for N images with fit layout", async () => {
    const images = [makeJpgImage(), makePngImage(), makeJpgImage()];
    const pdf = await imagesToPdf(images, { ...defaultOpts, layout: "fit" });
    expect(await getPageCount(pdf)).toBe(3);
  });

  it("creates N pages for N images with fill layout", async () => {
    const images = [makeJpgImage(), makePngImage()];
    const pdf = await imagesToPdf(images, { ...defaultOpts, layout: "fill" });
    expect(await getPageCount(pdf)).toBe(2);
  });

  // --- Page sizes ---

  it("uses A4 portrait dimensions (595×842)", async () => {
    const pdf = await imagesToPdf([makeJpgImage()], {
      ...defaultOpts,
      pageSize: "a4",
      orientation: "portrait",
    });
    const size = await getPageSize(pdf);
    expect(Math.round(size.w)).toBe(595);
    expect(Math.round(size.h)).toBe(842);
  });

  it("uses A4 landscape dimensions (842×595)", async () => {
    const pdf = await imagesToPdf([makeJpgImage()], {
      ...defaultOpts,
      pageSize: "a4",
      orientation: "landscape",
    });
    const size = await getPageSize(pdf);
    expect(Math.round(size.w)).toBe(842);
    expect(Math.round(size.h)).toBe(595);
  });

  it("uses Letter portrait dimensions (612×792)", async () => {
    const pdf = await imagesToPdf([makeJpgImage()], {
      ...defaultOpts,
      pageSize: "letter",
      orientation: "portrait",
    });
    const size = await getPageSize(pdf);
    expect(Math.round(size.w)).toBe(612);
    expect(Math.round(size.h)).toBe(792);
  });

  it("uses Letter landscape dimensions (792×612)", async () => {
    const pdf = await imagesToPdf([makeJpgImage()], {
      ...defaultOpts,
      pageSize: "letter",
      orientation: "landscape",
    });
    const size = await getPageSize(pdf);
    expect(Math.round(size.w)).toBe(792);
    expect(Math.round(size.h)).toBe(612);
  });

  it("uses first image dimensions for auto page size", async () => {
    const pdf = await imagesToPdf(
      [{ data: createMinimalJpg(), width: 800, height: 600, format: "jpg" }],
      { ...defaultOpts, pageSize: "auto", orientation: "portrait" }
    );
    const size = await getPageSize(pdf);
    expect(Math.round(size.w)).toBe(800);
    expect(Math.round(size.h)).toBe(600);
  });

  it("swaps auto dimensions for landscape", async () => {
    const pdf = await imagesToPdf(
      [{ data: createMinimalJpg(), width: 800, height: 600, format: "jpg" }],
      { ...defaultOpts, pageSize: "auto", orientation: "landscape" }
    );
    const size = await getPageSize(pdf);
    expect(Math.round(size.w)).toBe(600);
    expect(Math.round(size.h)).toBe(800);
  });

  // --- Grid layouts ---

  it("grid-2: 1 page for 2 images", async () => {
    const pdf = await imagesToPdf([makeJpgImage(), makePngImage()], {
      ...defaultOpts,
      layout: "grid-2",
    });
    expect(await getPageCount(pdf)).toBe(1);
  });

  it("grid-2: 2 pages for 3 images", async () => {
    const pdf = await imagesToPdf([makeJpgImage(), makePngImage(), makeJpgImage()], {
      ...defaultOpts,
      layout: "grid-2",
    });
    expect(await getPageCount(pdf)).toBe(2);
  });

  it("grid-4: 1 page for 4 images", async () => {
    const pdf = await imagesToPdf(
      [makeJpgImage(), makePngImage(), makeJpgImage(), makePngImage()],
      { ...defaultOpts, layout: "grid-4" }
    );
    expect(await getPageCount(pdf)).toBe(1);
  });

  it("grid-4: 2 pages for 5 images", async () => {
    const images = Array.from({ length: 5 }, () => makeJpgImage());
    const pdf = await imagesToPdf(images, { ...defaultOpts, layout: "grid-4" });
    expect(await getPageCount(pdf)).toBe(2);
  });

  it("grid-6: 1 page for 6 images", async () => {
    const images = Array.from({ length: 6 }, () => makeJpgImage());
    const pdf = await imagesToPdf(images, { ...defaultOpts, layout: "grid-6" });
    expect(await getPageCount(pdf)).toBe(1);
  });

  it("grid-9: 1 page for 9 images", async () => {
    const images = Array.from({ length: 9 }, () => makeJpgImage());
    const pdf = await imagesToPdf(images, { ...defaultOpts, layout: "grid-9" });
    expect(await getPageCount(pdf)).toBe(1);
  });

  it("grid-9: partially filled last page (7 images)", async () => {
    const images = Array.from({ length: 7 }, () => makeJpgImage());
    const pdf = await imagesToPdf(images, { ...defaultOpts, layout: "grid-9" });
    expect(await getPageCount(pdf)).toBe(1);
  });

  // --- Margins ---

  it("generates PDF with none margin (no effect on page dimensions)", async () => {
    const pdf = await imagesToPdf([makeJpgImage()], {
      ...defaultOpts,
      margin: "none",
    });
    const size = await getPageSize(pdf);
    // Margins don't change page size, only content positioning
    expect(Math.round(size.w)).toBe(595);
    expect(Math.round(size.h)).toBe(842);
  });

  it("generates PDF with large margin", async () => {
    const pdf = await imagesToPdf([makeJpgImage()], {
      ...defaultOpts,
      margin: "large",
    });
    expect(await getPageCount(pdf)).toBe(1);
  });

  // --- Alignment ---

  it("generates PDF with top-left alignment", async () => {
    const pdf = await imagesToPdf([makeJpgImage()], {
      ...defaultOpts,
      alignment: "top-left",
    });
    expect(await getPageCount(pdf)).toBe(1);
  });

  it("generates PDF with center alignment", async () => {
    const pdf = await imagesToPdf([makeJpgImage()], {
      ...defaultOpts,
      alignment: "center",
    });
    expect(await getPageCount(pdf)).toBe(1);
  });

  // --- Mixed formats ---

  it("handles mix of JPG and PNG images", async () => {
    const pdf = await imagesToPdf(
      [makeJpgImage(200, 300), makePngImage(400, 200), makeJpgImage(150, 150)],
      defaultOpts
    );
    expect(await getPageCount(pdf)).toBe(3);
  });

  // --- Fill layout edge cases ---

  it("fill layout with wide image on portrait page", async () => {
    const pdf = await imagesToPdf(
      [{ data: createMinimalJpg(), width: 2000, height: 500, format: "jpg" }],
      { ...defaultOpts, layout: "fill", pageSize: "a4", orientation: "portrait" }
    );
    expect(await getPageCount(pdf)).toBe(1);
  });

  it("fill layout with tall image on landscape page", async () => {
    const pdf = await imagesToPdf(
      [{ data: createMinimalPng(), width: 500, height: 2000, format: "png" }],
      { ...defaultOpts, layout: "fill", pageSize: "a4", orientation: "landscape" }
    );
    expect(await getPageCount(pdf)).toBe(1);
  });

  // --- PDF validity ---

  it("produces valid PDF bytes", async () => {
    const pdf = await imagesToPdf([makeJpgImage()], defaultOpts);
    // PDF magic bytes
    const header = new Uint8Array(pdf.buffer, 0, 5);
    const text = String.fromCharCode(...header);
    expect(text).toBe("%PDF-");
  });

  it("does not transfer ownership of input ArrayBuffers (buffer remains usable)", async () => {
    const img = makeJpgImage();
    const originalByteLength = img.data.byteLength;
    await imagesToPdf([img], defaultOpts);
    // data.slice(0) inside imagesToPdf ensures original buffer is not detached
    expect(img.data.byteLength).toBe(originalByteLength);
  });
});
```

- [ ] **Step 2: Run the tests to verify they pass**

Run:

```bash
npx vitest run libs/image-to-pdf/__tests__/main.test.ts
```

Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add libs/image-to-pdf/__tests__/main.test.ts
git commit -m "test(image-to-pdf): add unit tests for PDF generation"
```

---

## Task 3: Vitest Config + Tool Registration

**Files:**

- Modify: `vitest.config.ts`
- Modify: `libs/tools.ts`

- [ ] **Step 1: Add test scope to vitest.config.ts**

In `vitest.config.ts`, add `"libs/image-to-pdf/**/*.test.ts"` to the `include` array. Insert it alphabetically between `"libs/image/**/*.test.ts"` and `"libs/extractor/**/*.test.ts"`:

The line to add (after line 16 `libs/image/**/*.test.ts`):

```
      "libs/image-to-pdf/**/*.test.ts",
```

- [ ] **Step 2: Add FileImage icon import to libs/tools.ts**

In `libs/tools.ts`, add `FileImage` to the lucide-react import block (line 48, alongside `Droplets`):

```typescript
import {
  // ... existing imports ...
  Droplets,
  FileImage,
} from "lucide-react";
```

- [ ] **Step 3: Add image-to-pdf to TOOL_CATEGORIES**

In the `TOOL_CATEGORIES` array, find the `visual` category (around line 127) and insert `"image-to-pdf"` between `"image-rotate"` and `"pdf-merge"`:

```typescript
{
  key: "visual",
  tools: [
    "color",
    "image-resize",
    "image-compress",
    "image-convert",
    "image-watermark",
    "image-crop",
    "image-rotate",
    "image-to-pdf",
    "pdf-merge",
  ],
},
```

- [ ] **Step 4: Add image-to-pdf entry to TOOLS array**

In the `TOOLS` array, after the `image-watermark` entry (around line 506), add:

```typescript
{
  key: "image-to-pdf",
  path: "/image-to-pdf",
  icon: FileImage,
  emoji: "🖼️",
  sameAs: [
    "https://en.wikipedia.org/wiki/PDF",
    "https://developer.mozilla.org/en-US/docs/Glossary/PDF",
  ],
},
```

- [ ] **Step 5: Add TOOL_RELATIONS entry**

In the `TOOL_RELATIONS` object, after the `image-watermark` entry (around line 229), add:

```typescript
"image-to-pdf": ["image-resize", "image-compress", "image-convert", "pdf-merge"],
```

- [ ] **Step 6: Add reverse TOOL_RELATIONS links**

In the same `TOOL_RELATIONS` object, append `"image-to-pdf"` to these existing arrays:

In `"image-resize"` array (around line 192): append `"image-to-pdf"` at the end.

In `"image-compress"` array (around line 199): append `"image-to-pdf"` at the end.

In `"image-convert"` array (around line 207): append `"image-to-pdf"` at the end.

In `"pdf-merge"` array (around line 241): append `"image-to-pdf"` at the end.

- [ ] **Step 7: Run tests to verify nothing is broken**

Run:

```bash
npx vitest run libs/image-to-pdf/__tests__/main.test.ts
```

Expected: All tests PASS.

- [ ] **Step 8: Commit**

```bash
git add vitest.config.ts libs/tools.ts
git commit -m "feat(image-to-pdf): register tool in tools registry and vitest config"
```

---

## Task 4: English i18n

**Files:**

- Modify: `public/locales/en/tools.json`
- Create: `public/locales/en/image-to-pdf.json`

- [ ] **Step 1: Add image-to-pdf entry to tools.json**

In `public/locales/en/tools.json`, add the following entry before the `"categories"` key (after the `"image-watermark"` entry, around line 237):

```json
"image-to-pdf": {
  "title": "Images to PDF - Convert Images to PDF Online",
  "shortTitle": "Images to PDF",
  "description": "Convert JPG, PNG, WebP, and GIF images into a single PDF. Multiple layout modes, page sizes, and margins. All processing in your browser."
},
```

- [ ] **Step 2: Create the tool-specific translation file**

Create `public/locales/en/image-to-pdf.json`:

```json
{
  "dropImages": "Drop images here or click to select",
  "supportedFormats": "Supports JPG, PNG, WebP, GIF (first frame only)",
  "addMore": "Add more",
  "clearAll": "Clear all",
  "generatePdf": "Generate PDF",
  "generating": "Generating...",
  "pageSize": "Page size",
  "orientation": "Orientation",
  "portrait": "Portrait",
  "landscape": "Landscape",
  "layoutMode": "Layout",
  "margin": "Margin",
  "marginNone": "None",
  "marginSmall": "Small",
  "marginMedium": "Medium",
  "marginLarge": "Large",
  "alignment": "Alignment",
  "alignCenter": "Center",
  "alignTopLeft": "Top-left",
  "pageSizeA4": "A4",
  "pageSizeLetter": "Letter",
  "pageSizeAuto": "Auto",
  "layoutFit": "1/page",
  "layoutFill": "Fill page",
  "layoutGrid2": "2/page",
  "layoutGrid4": "4/page",
  "layoutGrid6": "6/page",
  "layoutGrid9": "9/page",
  "pageOf": "Page {current} of {total}",
  "imageCount": "{count} images",
  "animatedNotice": "Animated images: only the first frame will be used",
  "largeImageNotice": "Image exceeds 50MP and may be slow to process",
  "noImages": "No images selected",
  "deleteImage": "Delete",
  "preview": "Preview",
  "descriptions": {
    "title": "About Images to PDF",
    "aeoDefinition": "Images to PDF is a free online tool that converts multiple images into a single PDF document. Supports various layout modes including fit-to-page, grid, and fill page options.",
    "whatIsTitle": "What is Images to PDF?",
    "whatIs": "Convert JPG, PNG, WebP, and GIF images into a single PDF file. Choose from multiple layout modes, page sizes, and margin settings. All processing runs entirely in your browser.",
    "stepsTitle": "How to Convert Images to PDF",
    "step1Title": "Upload your images",
    "step1Text": "Drag and drop or click to select multiple images. Supported formats: JPG, PNG, WebP, GIF.",
    "step2Title": "Configure layout and page settings",
    "step2Text": "Choose page size (A4, Letter, or Auto), orientation, layout mode, margins, and alignment.",
    "step3Title": "Generate and download PDF",
    "step3Text": "Click Generate PDF to create your document. Reorder images by dragging thumbnails before generating.",
    "faq1Q": "What image formats are supported?",
    "faq1A": "JPG, PNG, WebP, and GIF are supported. For animated GIF/WebP, only the first frame is used. WebP and GIF are automatically converted to PNG during processing.",
    "faq2Q": "Is there a limit on the number of images?",
    "faq2A": "There is no hard limit. All processing happens in your browser, so the practical limit depends on your device's available memory. Virtual scrolling keeps the UI responsive even with hundreds of images.",
    "faq3Q": "What page sizes are available?",
    "faq3A": "A4 (210 × 297mm), US Letter (8.5 × 11 inches), and Auto which matches the page size to your first image dimensions."
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add public/locales/en/tools.json public/locales/en/image-to-pdf.json
git commit -m "feat(image-to-pdf): add English i18n translations"
```

---

## Task 5: Route Entry Page

**Files:**

- Create: `app/[locale]/image-to-pdf/page.tsx`

- [ ] **Step 1: Create the route entry**

Create `app/[locale]/image-to-pdf/page.tsx`:

```tsx
import { getTranslations } from "next-intl/server";
import { generatePageMeta } from "../../../libs/seo";
import { buildToolSchemas } from "../../../components/json-ld";
import { TOOLS, TOOL_CATEGORIES, CATEGORY_SLUGS } from "../../../libs/tools";
import ImageToPdfPage from "./image-to-pdf-page";

const PATH = "/image-to-pdf";
const TOOL_KEY = "image-to-pdf";
const tool = TOOLS.find((t) => t.key === TOOL_KEY)!;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "tools" });
  return generatePageMeta({
    locale,
    path: PATH,
    title: t("image-to-pdf.title"),
    description: t("image-to-pdf.description"),
    ogImage: { type: "tool", key: TOOL_KEY },
  });
}

export default async function ImageToPdfRoute({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "tools" });
  const tx = await getTranslations({ locale, namespace: "image-to-pdf" });
  const tc = await getTranslations({ locale, namespace: "categories" });
  const category = TOOL_CATEGORIES.find((c) => c.tools.includes(TOOL_KEY))!;
  const categorySlug = CATEGORY_SLUGS[category.key];

  const howToSteps = Array.from({ length: 3 }, (_, i) => ({
    name: tx(`descriptions.step${i + 1}Title`),
    text: tx(`descriptions.step${i + 1}Text`),
  })).filter((step) => step.name);

  const schemas = buildToolSchemas({
    name: t("image-to-pdf.title"),
    description: tx.has("descriptions.aeoDefinition")
      ? tx("descriptions.aeoDefinition")
      : t("image-to-pdf.description"),
    path: PATH,
    categoryName: tc(`${category.key}.shortTitle`),
    categoryPath: `/${categorySlug}`,
    faqItems: [1, 2, 3].map((i) => ({
      q: tx(`descriptions.faq${i}Q`),
      a: tx(`descriptions.faq${i}A`),
    })),
    howToSteps,
    sameAs: tool.sameAs,
  });

  return (
    <>
      {schemas.map((s, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(s) }}
        />
      ))}
      <ImageToPdfPage />
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/[locale]/image-to-pdf/page.tsx
git commit -m "feat(image-to-pdf): add route entry with SEO metadata"
```

---

## Task 6: Page Component

**Files:**

- Create: `app/[locale]/image-to-pdf/image-to-pdf-page.tsx`

This is the main component file. It contains all inline components: `useMultiImageInput` hook, `MultiImageDropZone`, `ThumbnailList`, `Conversion`, `Description`, and the default-exported `ToolPage`.

- [ ] **Step 1: Create the page component with all inline components**

Create `app/[locale]/image-to-pdf/image-to-pdf-page.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import Layout from "../../../components/layout";
import PrivacyBanner from "../../../components/privacy-banner";
import DescriptionSection from "../../../components/description-section";
import RelatedTools from "../../../components/related-tools";
import { Button } from "../../../components/ui/button";
import { showToast } from "../../../libs/toast";
import { imagesToPdf } from "../../../libs/image-to-pdf/main";
import type {
  PageLayout,
  PageSize,
  Orientation,
  Margin,
  Alignment,
  ImageInput,
} from "../../../libs/image-to-pdf/main";
import { ImagePlus, Plus, Trash2, ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { fromEvent } from "file-selector";

// --- Constants ---

const VIRTUALIZATION_THRESHOLD = 20;
const THUMBNAIL_SIZE = 80;
const PREVIEW_DEBOUNCE_MS = 300;
const MAX_MEGAPIXELS = 50;

const ACCEPTED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

// --- Types ---

interface ManagedImage {
  id: string;
  file: File;
  bitmap: ImageBitmap;
  pdfData: ArrayBuffer;
  width: number;
  height: number;
  format: "jpg" | "png";
  previewUrl: string;
}

// --- Helpers ---

let nextId = 0;
function uniqueId(): string {
  return `img-${++nextId}-${Date.now()}`;
}

async function isAnimatedWebP(file: File): Promise<boolean> {
  try {
    const buffer = await file.slice(0, 1024).arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const text = new TextDecoder().decode(bytes);
    return text.includes("ANIM");
  } catch {
    return false;
  }
}

/** Preprocess a file into a ManagedImage: decode bitmap, convert WebP/GIF to PNG. */
async function preprocessFile(file: File): Promise<ManagedImage> {
  const bitmap = await createImageBitmap(file);

  let pdfData: ArrayBuffer;
  let format: "jpg" | "png";

  if (file.type === "image/jpeg") {
    pdfData = await file.arrayBuffer();
    format = "jpg";
  } else if (file.type === "image/png") {
    pdfData = await file.arrayBuffer();
    format = "png";
  } else {
    // WebP, GIF → convert to PNG via canvas
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(bitmap, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Canvas conversion failed"))),
        "image/png"
      );
    });
    pdfData = await blob.arrayBuffer();
    format = "png";
  }

  const previewUrl = URL.createObjectURL(file);

  return {
    id: uniqueId(),
    file,
    bitmap,
    pdfData,
    width: bitmap.width,
    height: bitmap.height,
    format,
    previewUrl,
  };
}

// --- useMultiImageInput Hook ---

function useMultiImageInput(t: (key: string, params?: Record<string, string | number>) => string) {
  const [images, setImages] = useState<ManagedImage[]>([]);
  const [processing, setProcessing] = useState(false);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      const validFiles = Array.from(files).filter((f) => ACCEPTED_MIME_TYPES.includes(f.type));

      if (validFiles.length === 0) {
        showToast(t("supportedFormats"), "danger");
        return;
      }

      setProcessing(true);
      try {
        const newImages: ManagedImage[] = [];

        for (const file of validFiles) {
          try {
            const managed = await preprocessFile(file);

            // Animated image toast
            if (file.type === "image/gif") {
              showToast(t("animatedNotice"), "info", 3000);
            } else if (file.type === "image/webp" && (await isAnimatedWebP(file))) {
              showToast(t("animatedNotice"), "info", 3000);
            }

            // Large image warning (>50MP)
            const mp = managed.width * managed.height;
            if (mp > MAX_MEGAPIXELS * 1_000_000) {
              showToast(t("largeImageNotice"), "info", 4000);
            }

            newImages.push(managed);
          } catch {
            showToast(`Failed to process ${file.name}`, "danger");
          }
        }

        setImages((prev) => [...prev, ...newImages]);
      } finally {
        setProcessing(false);
      }
    },
    [t]
  );

  const removeImage = useCallback((id: string) => {
    setImages((prev) => {
      const img = prev.find((i) => i.id === id);
      if (img) {
        URL.revokeObjectURL(img.previewUrl);
        img.bitmap.close();
      }
      return prev.filter((i) => i.id !== id);
    });
  }, []);

  const reorderImages = useCallback((fromIndex: number, toIndex: number) => {
    setImages((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setImages((prev) => {
      for (const img of prev) {
        URL.revokeObjectURL(img.previewUrl);
        img.bitmap.close();
      }
      return [];
    });
  }, []);

  // Set up drag-and-drop on dropZoneRef using file-selector
  useEffect(() => {
    const dz = dropZoneRef.current;
    if (!dz) return;

    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    const onDrop = async (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const files = await fromEvent(e);
      if (files && files.length > 0) {
        addFiles(files as File[]);
      }
    };

    dz.addEventListener("dragover", onDragOver);
    dz.addEventListener("drop", onDrop);
    return () => {
      dz.removeEventListener("dragover", onDragOver);
      dz.removeEventListener("drop", onDrop);
    };
  }, [addFiles]);

  // Cleanup all bitmaps and URLs on unmount
  useEffect(() => {
    return () => {
      // This runs on unmount; images may already be cleared.
      // We can't reference state here reliably, so cleanup is best-effort.
    };
  }, []);

  return {
    images,
    addFiles,
    removeImage,
    reorderImages,
    clearAll,
    processing,
    dropZoneRef: dropZoneRef as React.RefObject<HTMLDivElement>,
    fileInputRef: fileInputRef as React.RefObject<HTMLInputElement>,
  };
}

// --- MultiImageDropZone ---

function MultiImageDropZone({
  dropZoneRef,
  fileInputRef,
  onInputChange,
  t,
}: {
  dropZoneRef: React.RefObject<HTMLDivElement>;
  fileInputRef: React.RefObject<HTMLInputElement>;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  t: (key: string) => string;
}) {
  return (
    <section className="mt-4">
      <div
        ref={dropZoneRef}
        className="relative text-xl rounded-lg border-2 border-dashed border-accent-cyan/30 bg-accent-cyan-dim/10 text-accent-cyan cursor-pointer"
        style={{ width: "100%", height: "14rem" }}
      >
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-2 pointer-events-none">
          <ImagePlus size={32} />
          <span className="font-bold text-base">{t("dropImages")}</span>
          <span className="text-sm text-accent-cyan/60">{t("supportedFormats")}</span>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
          onClick={() => {
            if (fileInputRef.current) {
              fileInputRef.current.value = "";
            }
          }}
          onChange={onInputChange}
        />
      </div>
    </section>
  );
}

// --- ThumbnailList ---

function ThumbnailList({
  images,
  currentPage,
  perPage,
  onRemove,
  onReorder,
  onPageSelect,
  t,
}: {
  images: ManagedImage[];
  currentPage: number;
  perPage: number;
  onRemove: (id: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onPageSelect: (page: number) => void;
  t: (key: string) => string;
}) {
  const dragIndexRef = useRef<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const virtualize = images.length > VIRTUALIZATION_THRESHOLD;

  const virtualizer = useVirtualizer({
    count: virtualize ? images.length : 0,
    getScrollElement: () => listRef.current,
    estimateSize: () => THUMBNAIL_SIZE + 8,
    overscan: 20,
    horizontal: true,
  });

  const handleDragStart = (index: number) => {
    dragIndexRef.current = index;
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (index: number) => {
    if (dragIndexRef.current !== null && dragIndexRef.current !== index) {
      onReorder(dragIndexRef.current, index);
    }
    dragIndexRef.current = null;
  };

  const renderThumbnail = (img: ManagedImage, index: number) => {
    const pageOfImage = Math.floor(index / perPage) + 1;
    const isActive = pageOfImage === currentPage;

    return (
      <div
        key={img.id}
        draggable
        onDragStart={() => handleDragStart(index)}
        onDragOver={handleDragOver}
        onDrop={() => handleDrop(index)}
        onClick={() => onPageSelect(pageOfImage)}
        className={`relative flex-shrink-0 rounded-lg border-2 cursor-grab active:cursor-grabbing overflow-hidden group transition-colors ${
          isActive
            ? "border-accent-cyan shadow-[0_0_8px_var(--accent-cyan)]"
            : "border-border-default hover:border-accent-cyan/50"
        }`}
        style={{ width: THUMBNAIL_SIZE, height: THUMBNAIL_SIZE }}
        title={`${img.file.name} (${img.width}×${img.height})`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={img.previewUrl}
          alt={`${index + 1}`}
          className="w-full h-full object-cover"
          draggable={false}
        />
        <div className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[10px] text-center py-0.5">
          {index + 1}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove(img.id);
          }}
          className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full w-4 h-4 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          aria-label={t("deleteImage")}
        >
          <X size={10} />
        </button>
      </div>
    );
  };

  // Non-virtualized rendering
  if (!virtualize) {
    return (
      <div className="flex gap-2 flex-wrap">{images.map((img, i) => renderThumbnail(img, i))}</div>
    );
  }

  // Virtualized rendering (horizontal)
  const virtualItems = virtualizer.getVirtualItems();
  return (
    <div ref={listRef} className="overflow-x-auto" style={{ maxHeight: THUMBNAIL_SIZE + 8 }}>
      <div
        style={{
          width: `${virtualizer.getTotalSize()}px`,
          height: THUMBNAIL_SIZE + 8,
          position: "relative",
        }}
      >
        {virtualItems.map((vi) => {
          const img = images[vi.index];
          return (
            <div
              key={vi.key}
              style={{
                position: "absolute",
                top: 0,
                transform: `translateX(${vi.start}px)`,
                width: THUMBNAIL_SIZE,
                height: THUMBNAIL_SIZE + 8,
              }}
            >
              {renderThumbnail(img, vi.index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- Conversion Component ---

function Conversion() {
  const t = useTranslations("image-to-pdf");
  const tc = useTranslations("common");

  const {
    images,
    addFiles,
    removeImage,
    reorderImages,
    clearAll,
    processing: inputProcessing,
    dropZoneRef,
    fileInputRef,
  } = useMultiImageInput(t);

  // PDF options state
  const [pageSize, setPageSize] = useState<PageSize>("a4");
  const [orientation, setOrientation] = useState<Orientation>("portrait");
  const [layout, setLayout] = useState<PageLayout>("fit");
  const [margin, setMargin] = useState<Margin>("small");
  const [alignment, setAlignment] = useState<Alignment>("center");

  // Preview state
  const [currentPage, setCurrentPage] = useState(1);
  const [generating, setGenerating] = useState(false);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const addMoreInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef(0);

  // Handle file input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      addFiles(files);
    }
  };

  // Layout to images-per-page mapping
  const perPage =
    layout === "fit" || layout === "fill"
      ? 1
      : layout === "grid-2"
        ? 2
        : layout === "grid-4"
          ? 4
          : layout === "grid-6"
            ? 6
            : 9;

  const totalPages = Math.max(1, Math.ceil(images.length / perPage));

  // Reset to page 1 if current page exceeds total
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(1);
    }
  }, [totalPages, currentPage]);

  // Preview rendering (canvas-based, debounced)
  useEffect(() => {
    if (images.length === 0) return;

    const timer = setTimeout(() => {
      renderPreview();
    }, PREVIEW_DEBOUNCE_MS);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images, pageSize, orientation, layout, margin, alignment, currentPage]);

  function renderPreview() {
    const canvas = previewCanvasRef.current;
    if (!canvas || images.length === 0) return;

    // Determine preview dimensions (scaled down)
    const maxPreviewW = 500;
    const maxPreviewH = 600;

    // Calculate page aspect ratio
    let pw = 595,
      ph = 842;
    if (pageSize === "letter") {
      pw = 612;
      ph = 792;
    } else if (pageSize === "auto" && images[0]) {
      pw = images[0].width;
      ph = images[0].height;
    }
    if (orientation === "landscape") {
      [pw, ph] = [ph, pw];
    }

    const scale = Math.min(maxPreviewW / pw, maxPreviewH / ph);
    canvas.width = Math.round(pw * scale);
    canvas.height = Math.round(ph * scale);

    const ctx = canvas.getContext("2d")!;

    // White background
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Margin
    const m = margin === "none" ? 0 : margin === "small" ? 10 : margin === "medium" ? 20 : 40;
    const ax = m * scale;
    const ay = m * scale;
    const aw = (pw - 2 * m) * scale;
    const ah = (ph - 2 * m) * scale;

    // Draw margin border
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1;
    ctx.strokeRect(ax, ay, aw, ah);

    // Get images for current page
    const startIdx = (currentPage - 1) * perPage;
    const pageImages = images.slice(startIdx, startIdx + perPage);

    if (layout === "fit") {
      for (const img of pageImages) {
        const s = Math.min(aw / (img.width * scale), ah / (img.height * scale));
        const dw = img.width * scale * s;
        const dh = img.height * scale * s;
        let dx = ax,
          dy = ay;
        if (alignment === "center") {
          dx = ax + (aw - dw) / 2;
          dy = ay + (ah - dh) / 2;
        } else {
          dy = ay; // top
        }
        ctx.drawImage(img.bitmap, dx, dy, dw, dh);
      }
    } else if (layout === "fill") {
      for (const img of pageImages) {
        const s = Math.max(aw / (img.width * scale), ah / (img.height * scale));
        const dw = img.width * scale * s;
        const dh = img.height * scale * s;
        // Save, clip to available area, draw centered, restore
        ctx.save();
        ctx.beginPath();
        ctx.rect(ax, ay, aw, ah);
        ctx.clip();
        const dx = ax + (aw - dw) / 2;
        const dy = ay + (ah - dh) / 2;
        ctx.drawImage(img.bitmap, dx, dy, dw, dh);
        ctx.restore();
      }
    } else {
      // Grid layout
      const cols = layout === "grid-2" ? 1 : layout === "grid-4" ? 2 : layout === "grid-6" ? 2 : 3;
      const rows = layout === "grid-2" ? 2 : layout === "grid-4" ? 2 : layout === "grid-6" ? 3 : 3;
      const gap = 4 * scale;
      const cellW = (aw - (cols - 1) * gap) / cols;
      const cellH = (ah - (rows - 1) * gap) / rows;

      pageImages.forEach((img, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const cx = ax + col * (cellW + gap);
        const cy = ay + row * (cellH + gap);

        const s = Math.min(cellW / (img.width * scale), cellH / (img.height * scale));
        const dw = img.width * scale * s;
        const dh = img.height * scale * s;
        const dx = cx + (cellW - dw) / 2;
        const dy = cy + (cellH - dh) / 2;
        ctx.drawImage(img.bitmap, dx, dy, dw, dh);
      });
    }
  }

  // PDF Generation
  const handleGenerate = async () => {
    if (images.length === 0) return;

    setGenerating(true);
    try {
      const pdfImages: ImageInput[] = images.map((img) => ({
        data: img.pdfData,
        width: img.width,
        height: img.height,
        format: img.format,
      }));

      const pdfBytes = await imagesToPdf(pdfImages, {
        pageSize,
        orientation,
        layout,
        margin,
        alignment,
      });

      // Trigger download
      const blob = new Blob([pdfBytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "images-to-pdf.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "PDF generation failed", "danger");
    } finally {
      setGenerating(false);
    }
  };

  // --- State A: No images ---
  if (images.length === 0) {
    return (
      <MultiImageDropZone
        dropZoneRef={dropZoneRef}
        fileInputRef={fileInputRef}
        onInputChange={handleInputChange}
        t={t}
      />
    );
  }

  // --- State B: Images loaded ---
  return (
    <div className="flex flex-col lg:flex-row gap-4 mt-4">
      {/* Controls Panel */}
      <div className="lg:w-[280px] flex-shrink-0 space-y-4">
        {/* Page Size */}
        <div>
          <label className="block text-sm font-medium text-fg-secondary mb-1">
            {t("pageSize")}
          </label>
          <select
            value={pageSize}
            onChange={(e) => setPageSize(e.target.value as PageSize)}
            className="w-full bg-bg-input text-fg-primary border border-border-default rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent-cyan"
          >
            <option value="a4">{t("pageSizeA4")}</option>
            <option value="letter">{t("pageSizeLetter")}</option>
            <option value="auto">{t("pageSizeAuto")}</option>
          </select>
        </div>

        {/* Orientation */}
        <div>
          <label className="block text-sm font-medium text-fg-secondary mb-1">
            {t("orientation")}
          </label>
          <div className="flex gap-3">
            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input
                type="radio"
                name="orientation"
                value="portrait"
                checked={orientation === "portrait"}
                onChange={() => setOrientation("portrait")}
                className="accent-[var(--accent-cyan)]"
              />
              {t("portrait")}
            </label>
            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input
                type="radio"
                name="orientation"
                value="landscape"
                checked={orientation === "landscape"}
                onChange={() => setOrientation("landscape")}
                className="accent-[var(--accent-cyan)]"
              />
              {t("landscape")}
            </label>
          </div>
        </div>

        {/* Layout Mode */}
        <div>
          <label className="block text-sm font-medium text-fg-secondary mb-1">
            {t("layoutMode")}
          </label>
          <select
            value={layout}
            onChange={(e) => setLayout(e.target.value as PageLayout)}
            className="w-full bg-bg-input text-fg-primary border border-border-default rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent-cyan"
          >
            <option value="fit">{t("layoutFit")}</option>
            <option value="fill">{t("layoutFill")}</option>
            <option value="grid-2">{t("layoutGrid2")}</option>
            <option value="grid-4">{t("layoutGrid4")}</option>
            <option value="grid-6">{t("layoutGrid6")}</option>
            <option value="grid-9">{t("layoutGrid9")}</option>
          </select>
        </div>

        {/* Margin */}
        <div>
          <label className="block text-sm font-medium text-fg-secondary mb-1">{t("margin")}</label>
          <div className="flex gap-1.5">
            {(["none", "small", "medium", "large"] as Margin[]).map((m) => (
              <button
                key={m}
                onClick={() => setMargin(m)}
                className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                  margin === m
                    ? "bg-accent-cyan text-bg-base border-accent-cyan"
                    : "bg-bg-input text-fg-secondary border-border-default hover:border-accent-cyan/50"
                }`}
              >
                {t(
                  `margin${m.charAt(0).toUpperCase() + m.slice(1)}` as keyof IntlMessages["image-to-pdf"]
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Alignment */}
        <div>
          <label className="block text-sm font-medium text-fg-secondary mb-1">
            {t("alignment")}
          </label>
          <select
            value={alignment}
            onChange={(e) => setAlignment(e.target.value as Alignment)}
            className="w-full bg-bg-input text-fg-primary border border-border-default rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent-cyan"
          >
            <option value="center">{t("alignCenter")}</option>
            <option value="top-left">{t("alignTopLeft")}</option>
          </select>
        </div>

        {/* Generate PDF Button */}
        <Button
          variant="primary"
          size="lg"
          onClick={handleGenerate}
          disabled={generating || images.length === 0}
          className="w-full"
        >
          <Download size={16} />
          {generating ? t("generating") : t("generatePdf")}
        </Button>
      </div>

      {/* Preview Area */}
      <div className="flex-1 min-w-0 space-y-3">
        {/* Canvas Preview */}
        <div className="flex justify-center">
          <canvas
            ref={previewCanvasRef}
            className="border border-border-default rounded-lg bg-white max-w-full"
          />
        </div>

        {/* Page Navigation */}
        <div className="flex items-center justify-center gap-3 text-sm text-fg-secondary">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            className="p-1 rounded hover:bg-bg-elevated disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft size={18} />
          </button>
          <span>{t("pageOf", { current: currentPage, total: totalPages })}</span>
          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
            className="p-1 rounded hover:bg-bg-elevated disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        {/* Thumbnail List */}
        <ThumbnailList
          images={images}
          currentPage={currentPage}
          perPage={perPage}
          onRemove={removeImage}
          onReorder={reorderImages}
          onPageSelect={setCurrentPage}
          t={t}
        />

        {/* Add More / Clear All */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (addMoreInputRef.current) {
                addMoreInputRef.current.click();
              }
            }}
          >
            <Plus size={14} />
            {t("addMore")}
          </Button>
          <Button variant="danger" size="sm" onClick={clearAll} disabled={images.length === 0}>
            <Trash2 size={14} />
            {t("clearAll")}
          </Button>
          {/* Hidden file input for "Add more" (separate from drop zone input) */}
          <input
            ref={addMoreInputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={handleInputChange}
            onClick={(e) => {
              (e.target as HTMLInputElement).value = "";
            }}
          />
        </div>

        {/* Image count */}
        <p className="text-xs text-fg-muted text-center">
          {t("imageCount", { count: images.length })}
        </p>
      </div>
    </div>
  );
}

// --- Page Export ---

export default function ImageToPdfPage() {
  const t = useTranslations("tools");
  return (
    <Layout
      title={t("image-to-pdf.shortTitle")}
      categoryLabel={t("categories.visual")}
      categorySlug="visual-media"
    >
      <div className="container mx-auto px-4 pt-3 pb-6">
        <PrivacyBanner variant="files" />
        <Conversion />
        <DescriptionSection namespace="image-to-pdf" />
        <RelatedTools currentTool="image-to-pdf" />
      </div>
    </Layout>
  );
}
```

- [ ] **Step 2: Verify no TypeScript errors**

Run:

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No errors in `app/[locale]/image-to-pdf/image-to-pdf-page.tsx` or `libs/image-to-pdf/main.ts`.

- [ ] **Step 3: Commit**

```bash
git add app/[locale]/image-to-pdf/image-to-pdf-page.tsx
git commit -m "feat(image-to-pdf): add page component with controls, preview, and thumbnails"
```

---

## Task 7: 9 Locale Translations

**Files:**

- Modify: `public/locales/zh-CN/tools.json`, Create: `public/locales/zh-CN/image-to-pdf.json`
- Modify: `public/locales/zh-TW/tools.json`, Create: `public/locales/zh-TW/image-to-pdf.json`
- Modify: `public/locales/ja/tools.json`, Create: `public/locales/ja/image-to-pdf.json`
- Modify: `public/locales/ko/tools.json`, Create: `public/locales/ko/image-to-pdf.json`
- Modify: `public/locales/es/tools.json`, Create: `public/locales/es/image-to-pdf.json`
- Modify: `public/locales/pt-BR/tools.json`, Create: `public/locales/pt-BR/image-to-pdf.json`
- Modify: `public/locales/fr/tools.json`, Create: `public/locales/fr/image-to-pdf.json`
- Modify: `public/locales/de/tools.json`, Create: `public/locales/de/image-to-pdf.json`
- Modify: `public/locales/ru/tools.json`, Create: `public/locales/ru/image-to-pdf.json`

- [ ] **Step 1: Add tools.json entry for all 9 locales**

For each locale, add an `image-to-pdf` entry to `public/locales/{locale}/tools.json` (before `"categories"`). The entry format:

**zh-CN** (with searchTerms):

```json
"image-to-pdf": {
  "title": "图片转 PDF - 在线将多张图片合成 PDF",
  "shortTitle": "图片转 PDF",
  "description": "将 JPG、PNG、WebP、GIF 图片转换为 PDF 文件。支持多种布局、页面尺寸和边距设置。所有处理在浏览器中完成。",
  "searchTerms": "tupianzhuanpdf tpzpdf pdf hebing tupian"
},
```

**zh-TW** (with searchTerms):

```json
"image-to-pdf": {
  "title": "圖片轉 PDF - 線上將多張圖片合併為 PDF",
  "shortTitle": "圖片轉 PDF",
  "description": "將 JPG、PNG、WebP、GIF 圖片轉換為 PDF 檔案。支援多種版面配置、頁面尺寸和邊距設定。所有處理在瀏覽器中完成。",
  "searchTerms": "tupianzhuanpdf tpzpdf pdf hebing tupian"
},
```

**ja** (with searchTerms):

```json
"image-to-pdf": {
  "title": "画像を PDF に変換 - 複数画像をまとめて PDF 化",
  "shortTitle": "画像→PDF",
  "description": "JPG、PNG、WebP、GIF 画像を PDF に変換。複数のレイアウトモード、用紙サイズ、マージン設定に対応。すべてブラウザ内で処理。",
  "searchTerms": "gazoupdf gpdf henkan gazou matome"
},
```

**ko** (with searchTerms):

```json
"image-to-pdf": {
  "title": "이미지를 PDF로 변환 - 여러 이미지를 하나의 PDF로",
  "shortTitle": "이미지→PDF",
  "description": "JPG, PNG, WebP, GIF 이미지를 PDF로 변환합니다. 다양한 레이아웃, 페이지 크기, 여백 설정을 지원합니다. 모든 처리는 브라우저에서 이루어집니다.",
  "searchTerms": "imidzipdf izpdf pdf hapchi imiji"
},
```

**es**:

```json
"image-to-pdf": {
  "title": "Imágenes a PDF - Convierte Imágenes a PDF en Línea",
  "shortTitle": "Imágenes a PDF",
  "description": "Convierte imágenes JPG, PNG, WebP y GIF en un solo PDF. Múltiples modos de diseño, tamaños de página y márgenes. Todo se procesa en tu navegador."
},
```

**pt-BR**:

```json
"image-to-pdf": {
  "title": "Imagens para PDF - Converta Imagens em PDF Online",
  "shortTitle": "Imagens para PDF",
  "description": "Converta imagens JPG, PNG, WebP e GIF em um único PDF. Vários modos de layout, tamanhos de página e margens. Todo o processamento no seu navegador."
},
```

**fr**:

```json
"image-to-pdf": {
  "title": "Images en PDF - Convertir des Images en PDF en Ligne",
  "shortTitle": "Images en PDF",
  "description": "Convertissez des images JPG, PNG, WebP et GIF en un seul PDF. Plusieurs modes de mise en page, tailles de page et marges. Tout le traitement dans votre navigateur."
},
```

**de**:

```json
"image-to-pdf": {
  "title": "Bilder zu PDF - Bilder online in PDF umwandeln",
  "shortTitle": "Bilder zu PDF",
  "description": "Wandeln Sie JPG-, PNG-, WebP- und GIF-Bilder in ein einziges PDF um. Mehrere Layout-Modi, Seitengrößen und Ränder. Alle Verarbeitung im Browser."
},
```

**ru**:

```json
"image-to-pdf": {
  "title": "Изображения в PDF - Конвертер изображений в PDF онлайн",
  "shortTitle": "Изображения в PDF",
  "description": "Конвертируйте изображения JPG, PNG, WebP и GIF в один PDF. Несколько режимов макета, размеров страницы и полей. Вся обработка в браузере."
},
```

- [ ] **Step 2: Create zh-CN tool-specific translation file**

Create `public/locales/zh-CN/image-to-pdf.json`:

```json
{
  "dropImages": "拖放图片到此处或点击选择",
  "supportedFormats": "支持 JPG、PNG、WebP、GIF（仅第一帧）",
  "addMore": "添加更多",
  "clearAll": "全部清除",
  "generatePdf": "生成 PDF",
  "generating": "生成中...",
  "pageSize": "页面大小",
  "orientation": "方向",
  "portrait": "纵向",
  "landscape": "横向",
  "layoutMode": "布局",
  "margin": "边距",
  "marginNone": "无",
  "marginSmall": "小",
  "marginMedium": "中",
  "marginLarge": "大",
  "alignment": "对齐",
  "alignCenter": "居中",
  "alignTopLeft": "左上角",
  "pageSizeA4": "A4",
  "pageSizeLetter": "Letter",
  "pageSizeAuto": "自动",
  "layoutFit": "1张/页",
  "layoutFill": "填充页面",
  "layoutGrid2": "2张/页",
  "layoutGrid4": "4张/页",
  "layoutGrid6": "6张/页",
  "layoutGrid9": "9张/页",
  "pageOf": "第 {current} 页，共 {total} 页",
  "imageCount": "{count} 张图片",
  "animatedNotice": "动图：仅使用第一帧",
  "largeImageNotice": "图片超过 50MP，处理可能较慢",
  "noImages": "未选择图片",
  "deleteImage": "删除",
  "preview": "预览",
  "descriptions": {
    "title": "关于图片转 PDF",
    "aeoDefinition": "图片转 PDF 是一款免费的在线工具，可将多张图片合并为一个 PDF 文档。支持适应页面、网格排列、填充页面等多种布局模式。",
    "whatIsTitle": "什么是图片转 PDF？",
    "whatIs": "将 JPG、PNG、WebP、GIF 图片转换为 PDF 文件。支持多种布局模式、页面尺寸和边距设置。所有处理完全在浏览器中完成。",
    "stepsTitle": "如何将图片转换为 PDF",
    "step1Title": "上传图片",
    "step1Text": "拖放或点击选择多张图片。支持格式：JPG、PNG、WebP、GIF。",
    "step2Title": "配置布局和页面设置",
    "step2Text": "选择页面大小（A4、Letter 或自动）、方向、布局模式、边距和对齐方式。",
    "step3Title": "生成并下载 PDF",
    "step3Text": "点击生成 PDF 按钮创建文档。生成前可通过拖拽缩略图调整图片顺序。",
    "faq1Q": "支持哪些图片格式？",
    "faq1A": "支持 JPG、PNG、WebP 和 GIF。对于动态 GIF/WebP，仅使用第一帧。WebP 和 GIF 会在处理时自动转换为 PNG。",
    "faq2Q": "图片数量有限制吗？",
    "faq2A": "没有硬性限制。所有处理都在浏览器中进行，实际限制取决于设备可用内存。虚拟滚动确保即使数百张图片也能保持界面流畅。",
    "faq3Q": "支持哪些页面大小？",
    "faq3A": "A4（210 × 297mm）、US Letter（8.5 × 11 英寸）以及自动模式（根据第一张图片尺寸确定页面大小）。"
  }
}
```

- [ ] **Step 3: Create the remaining 8 locale translation files**

For each remaining locale (zh-TW, ja, ko, es, pt-BR, fr, de, ru), create `public/locales/{locale}/image-to-pdf.json` with the same JSON structure as the zh-CN example above. Follow these translation rules:

1. Use the English `image-to-pdf.json` as the source of truth for key structure
2. Every key in the English file MUST appear in the localized file — no missing keys
3. Keep technical values as-is: `pageSizeA4` → "A4", `pageSizeLetter` → "Letter", `pageSizeAuto` → translated
4. Layout mode labels should be concise: `layoutFit` → "1/page" pattern in the locale's convention
5. `searchTerms` are NOT in this file — they go in `tools.json` (added in Step 1)
6. Translate `descriptions` section with natural, idiomatic phrasing for each locale's developer community

- [ ] **Step 4: Commit**

```bash
git add public/locales/zh-CN/ public/locales/zh-TW/ public/locales/ja/ public/locales/ko/ public/locales/es/ public/locales/pt-BR/ public/locales/fr/ public/locales/de/ public/locales/ru/
git commit -m "feat(image-to-pdf): add 9-locale i18n translations"
```

---

## Task 8: Final Build Verification

**Files:**

- No new files. Verification only.

- [ ] **Step 1: Run all tests**

Run:

```bash
npm run test
```

Expected: All tests pass, including the new `libs/image-to-pdf/__tests__/main.test.ts` tests.

- [ ] **Step 2: Run TypeScript check**

Run:

```bash
npx tsc --noEmit --pretty 2>&1 | head -30
```

Expected: No type errors.

- [ ] **Step 3: Run ESLint**

Run:

```bash
npx eslint app/[locale]/image-to-pdf/ libs/image-to-pdf/ --max-warnings=0
```

Expected: No errors or warnings.

- [ ] **Step 4: Verify dev server starts**

Run:

```bash
npm run dev &
sleep 10
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/image-to-pdf
kill %1
```

Expected: HTTP 200 response.

- [ ] **Step 5: Final commit (if any fixes were needed)**

```bash
git add -A
git commit -m "fix(image-to-pdf): address build verification issues"
```

---

## Self-Review Checklist

### Spec Coverage

| Spec Requirement                                 | Plan Task | Status |
| ------------------------------------------------ | --------- | ------ |
| Core library with types and layout algorithms    | Task 1    | ✅     |
| Unit tests (12+ test cases)                      | Task 2    | ✅     |
| Vitest config update                             | Task 3    | ✅     |
| Tool registration (TOOLS, CATEGORIES, RELATIONS) | Task 3    | ✅     |
| English i18n (tools.json + tool JSON)            | Task 4    | ✅     |
| Route entry with SEO + JSON-LD                   | Task 5    | ✅     |
| Page component with all inline components        | Task 6    | ✅     |
| 9 locale translations                            | Task 7    | ✅     |
| Build verification                               | Task 8    | ✅     |

### Key Design Decisions Verified

- **No new dependencies**: pdf-lib and @tanstack/react-virtual are already installed ✅
- **Buffer safety**: `data.slice(0)` pattern used in `embedImage()` ✅
- **WebP/GIF conversion**: Canvas → PNG pipeline in `preprocessFile()` ✅
- **50MP limit warning**: Reuses toast pattern from useImageInput ✅
- **Animated image notice**: Checks GIF and animated WebP ✅
- **Virtual scrolling**: Conditional with threshold=20, overscan=20 ✅
- **HTML5 Drag & Drop**: Used in ThumbnailList for reorder ✅
- **file-selector**: Used in useMultiImageInput for drop zone ✅
- **Preview debounce**: 300ms on option changes ✅
- **Fill mode**: Cover scale + center positioning (no clip path, page boundary clips) ✅
