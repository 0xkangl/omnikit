# PDF to Image Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a browser-based PDF-to-image conversion tool that renders PDF pages as PNG, JPG, or WebP images with DPI control, page selection via checkbox thumbnail grid, and individual or ZIP download.

**Architecture:** Three-state client component (upload → configure+preview → results) following the pdf-split pattern. Core rendering via pdfjs-dist with memory-safe one-page-at-a-time pipeline. Zero new dependencies — reuses pdfjs-dist, fflate, file-selector, rc-slider already in the project.

**Tech Stack:** Next.js 16 (App Router), TypeScript, pdfjs-dist, fflate, file-selector, rc-slider, Tailwind CSS 4, next-intl

---

## File Structure

| File                                                                     | Action | Responsibility                                      |
| ------------------------------------------------------------------------ | ------ | --------------------------------------------------- |
| `libs/tools.ts`                                                          | Modify | Register tool (icon, category, relations)           |
| `libs/pdf-to-image/types.ts`                                             | Create | DPI presets, RenderOptions, RenderResult types      |
| `libs/pdf-to-image/render.ts`                                            | Create | Core rendering: getPdfPageCount, renderPagesToBlobs |
| `libs/pdf-to-image/__tests__/render.test.ts`                             | Create | Unit tests for render module                        |
| `vitest.config.ts`                                                       | Modify | Add pdf-to-image test scope                         |
| `public/locales/en/tools.json`                                           | Modify | Add pdf-to-image tool entry                         |
| `public/locales/en/pdf-to-image.json`                                    | Create | English translation strings                         |
| `public/locales/{zh-CN,zh-TW,ja,ko,es,pt-BR,fr,de,ru}/tools.json`        | Modify | Add pdf-to-image tool entry per locale              |
| `public/locales/{zh-CN,zh-TW,ja,ko,es,pt-BR,fr,de,ru}/pdf-to-image.json` | Create | Translation strings per locale                      |
| `app/[locale]/pdf-to-image/page.tsx`                                     | Create | Route entry: metadata + JSON-LD                     |
| `app/[locale]/pdf-to-image/pdf-to-image-page.tsx`                        | Create | Client component: upload → configure → results      |
| `AGENTS.md`                                                              | Modify | Document new tool                                   |

---

### Task 1: Tool Registration in `libs/tools.ts`

**Files:**

- Modify: `libs/tools.ts`

- [ ] **Step 1: Add `ImageDown` to lucide-react imports**

In `libs/tools.ts`, add `ImageDown` to the existing import block from `lucide-react` (line 3–51). Add it right after `FileImage` (line 51):

```typescript
  FileImage,
  ImageDown,
```

- [ ] **Step 2: Add tool entry to TOOLS array**

Insert before the closing `];` of the TOOLS array (after line 567, the `image-to-pdf` entry). Add after the `image-to-pdf` entry:

```typescript
  {
    key: "pdf-to-image",
    path: "/pdf-to-image",
    icon: ImageDown,
    emoji: "📄",
    sameAs: ["https://www.adobe.com/acrobat/online/pdf-to-image.html"],
  },
```

- [ ] **Step 3: Add to visual category in TOOL_CATEGORIES**

In the `TOOL_CATEGORIES` array, find the visual category (line 130). Insert `"pdf-to-image"` between `"image-to-pdf"` (line 139) and `"pdf-merge"` (line 140):

```typescript
      "image-to-pdf",
      "pdf-to-image",
      "pdf-merge",
```

- [ ] **Step 4: Add TOOL_RELATIONS entry + update existing entries**

Add new entry after the `"image-to-pdf"` line (line 256). Also update these existing entries:

**New entry** (add after line 256):

```typescript
  "pdf-to-image": ["image-compress", "image-convert", "image-resize", "pdf-merge", "pdf-split", "image-to-pdf"],
```

**Update `"image-to-pdf"`** (line 256) — append `"pdf-to-image"`:

```typescript
  "image-to-pdf": ["image-resize", "image-compress", "image-convert", "pdf-merge", "pdf-to-image"],
```

**Update `"pdf-merge"`** (lines 257–265) — append `"pdf-to-image"`:

```typescript
  "pdf-merge": [
    "pdf-split",
    "pdf-compress",
    "image-compress",
    "image-convert",
    "checksum",
    "pdf-watermark",
    "image-to-pdf",
    "pdf-to-image",
  ],
```

**Update `"pdf-split"`** (line 266) — append `"pdf-to-image"`:

```typescript
  "pdf-split": ["pdf-merge", "image-compress", "image-convert", "pdf-to-image"],
```

**Update `"image-compress"`** (lines 207–216) — append `"pdf-to-image"`:

```typescript
  "image-compress": [
    "image-resize",
    "image-convert",
    "image-crop",
    "image-rotate",
    "pdf-merge",
    "pdf-split",
    "pdf-compress",
    "image-watermark",
    "image-to-pdf",
    "pdf-to-image",
  ],
```

**Update `"image-convert"`** (lines 218–227) — append `"pdf-to-image"`:

```typescript
  "image-convert": [
    "image-resize",
    "image-compress",
    "image-crop",
    "image-rotate",
    "pdf-merge",
    "pdf-split",
    "pdf-compress",
    "image-watermark",
    "image-to-pdf",
    "pdf-to-image",
  ],
```

- [ ] **Step 5: Verify no TypeScript errors**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors referencing `ImageDown`, `pdf-to-image`, or the modified file.

Commit:

```bash
git add libs/tools.ts
git commit -m "feat(pdf-to-image): register tool in tools registry"
```

---

### Task 2: Core Types Module

**Files:**

- Create: `libs/pdf-to-image/types.ts`

- [ ] **Step 1: Create `libs/pdf-to-image/` directory**

```bash
mkdir -p libs/pdf-to-image/__tests__
```

- [ ] **Step 2: Write `libs/pdf-to-image/types.ts`**

```typescript
import type { OutputFormat } from "../image/types";

export interface DpiPreset {
  label: string;
  scale: number;
}

export const DPI_PRESETS: DpiPreset[] = [
  { label: "preview", scale: 1.0 },
  { label: "standard", scale: 2.0 },
  { label: "high", scale: 3.0 },
  { label: "print", scale: 4.0 },
];

export const CUSTOM_DPI_MIN = 72;
export const CUSTOM_DPI_MAX = 600;
export const DPI_BASE = 72; // PDF points-per-inch

export interface RenderOptions {
  format: OutputFormat;
  quality: number; // 1-100, only for jpeg/webp
  scale: number; // DPI preset scale or custom value
}

export interface RenderResult {
  blob: Blob;
  width: number;
  height: number;
  pageIndex: number; // 0-indexed
}

export interface RenderProgress {
  current: number;
  total: number;
}
```

- [ ] **Step 3: Verify no TypeScript errors**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: PASS

Commit:

```bash
git add libs/pdf-to-image/types.ts
git commit -m "feat(pdf-to-image): add core types module"
```

---

### Task 3: Core Render Module

**Files:**

- Create: `libs/pdf-to-image/render.ts`

- [ ] **Step 1: Write `libs/pdf-to-image/render.ts`**

```typescript
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
 * Does NOT call pdf.destroy() — caller manages the PDF lifecycle via the returned cleanup function.
 */
async function renderPage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: PASS

Commit:

```bash
git add libs/pdf-to-image/render.ts
git commit -m "feat(pdf-to-image): add core render module"
```

---

### Task 4: Unit Tests for Render Module

**Files:**

- Create: `libs/pdf-to-image/__tests__/render.test.ts`

- [ ] **Step 1: Write the test file**

Create a minimal valid PDF for testing `getPdfPageCount`. For canvas-dependent `renderPagesToBlobs`, tests use mocks since the vitest environment is `node` (no DOM).

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { DPI_PRESETS, CUSTOM_DPI_MIN, CUSTOM_DPI_MAX, DPI_BASE } from "../types";

describe("DPI presets", () => {
  it("should have 4 presets", () => {
    expect(DPI_PRESETS).toHaveLength(4);
  });

  it("should have scales 1.0, 2.0, 3.0, 4.0", () => {
    expect(DPI_PRESETS.map((p) => p.scale)).toEqual([1.0, 2.0, 3.0, 4.0]);
  });

  it("should have correct labels", () => {
    expect(DPI_PRESETS.map((p) => p.label)).toEqual(["preview", "standard", "high", "print"]);
  });
});

describe("DPI constants", () => {
  it("CUSTOM_DPI_MIN should be 72", () => {
    expect(CUSTOM_DPI_MIN).toBe(72);
  });

  it("CUSTOM_DPI_MAX should be 600", () => {
    expect(CUSTOM_DPI_MAX).toBe(600);
  });

  it("DPI_BASE should be 72", () => {
    expect(DPI_BASE).toBe(72);
  });
});

describe("getPdfPageCount", () => {
  // Dynamic import so we can mock pdfjs-dist
  let getPdfPageCount: typeof import("../render").getPdfPageCount;

  // Minimal valid PDF: 1-page empty PDF (PDF 1.4 header + minimal structure)
  const MINIMAL_PDF = new Uint8Array([
    0x25,
    0x50,
    0x44,
    0x46,
    0x2d,
    0x31,
    0x2e,
    0x34,
    0x0a, // %PDF-1.4\n
    0x31,
    0x20,
    0x30,
    0x20,
    0x6f,
    0x62,
    0x6a,
    0x0a, // 1 0 obj\n
    0x3c,
    0x3c,
    0x2f,
    0x54,
    0x79,
    0x70,
    0x65,
    0x2f,
    0x43,
    0x61,
    0x74,
    0x61,
    0x6c,
    0x6f,
    0x67,
    0x2f,
    0x50,
    0x61,
    0x67,
    0x65,
    0x73,
    0x20,
    0x32,
    0x20,
    0x30,
    0x20,
    0x52,
    0x2f,
    0x3e,
    0x3e,
    0x0a, // <</Type/Catalog/Pages 2 0 R/>>\n
    0x65,
    0x6e,
    0x64,
    0x6f,
    0x62,
    0x6a,
    0x0a, // endobj\n
    0x32,
    0x20,
    0x30,
    0x20,
    0x6f,
    0x62,
    0x6a,
    0x0a, // 2 0 obj\n
    0x3c,
    0x3c,
    0x2f,
    0x54,
    0x79,
    0x70,
    0x65,
    0x2f,
    0x50,
    0x61,
    0x67,
    0x65,
    0x73,
    0x2f,
    0x43,
    0x6f,
    0x75,
    0x6e,
    0x74,
    0x20,
    0x31,
    0x2f,
    0x4b,
    0x69,
    0x64,
    0x73,
    0x5b,
    0x20,
    0x33,
    0x20,
    0x30,
    0x20,
    0x52,
    0x5d,
    0x2f,
    0x3e,
    0x3e,
    0x0a, // <</Type/Pages/Count 1/Kids[ 3 0 R]/>>\n
    0x65,
    0x6e,
    0x64,
    0x6f,
    0x62,
    0x6a,
    0x0a, // endobj\n
    0x33,
    0x20,
    0x30,
    0x20,
    0x6f,
    0x62,
    0x6a,
    0x0a, // 3 0 obj\n
    0x3c,
    0x3c,
    0x2f,
    0x54,
    0x79,
    0x70,
    0x65,
    0x2f,
    0x50,
    0x61,
    0x67,
    0x65,
    0x2f,
    0x50,
    0x61,
    0x72,
    0x65,
    0x6e,
    0x74,
    0x20,
    0x32,
    0x20,
    0x30,
    0x20,
    0x52,
    0x2f,
    0x4d,
    0x65,
    0x64,
    0x69,
    0x61,
    0x42,
    0x6f,
    0x78,
    0x5b,
    0x30,
    0x20,
    0x30,
    0x20,
    0x36,
    0x31,
    0x32,
    0x20,
    0x37,
    0x39,
    0x32,
    0x5d,
    0x2f,
    0x3e,
    0x3e,
    0x0a, // <</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/>>\n
    0x65,
    0x6e,
    0x64,
    0x6f,
    0x62,
    0x6a,
    0x0a, // endobj\n
    0x78,
    0x72,
    0x65,
    0x66,
    0x0a, // xref\n
    0x30,
    0x20,
    0x34,
    0x0a, // 0 4\n
    0x30,
    0x30,
    0x30,
    0x30,
    0x30,
    0x30,
    0x30,
    0x30,
    0x30,
    0x30,
    0x20,
    0x36,
    0x35,
    0x35,
    0x33,
    0x35,
    0x20,
    0x66,
    0x20,
    0x0a, // 0000000000 65535 f \n
    0x30,
    0x30,
    0x30,
    0x30,
    0x30,
    0x30,
    0x30,
    0x30,
    0x30,
    0x39,
    0x20,
    0x30,
    0x30,
    0x30,
    0x30,
    0x30,
    0x20,
    0x6e,
    0x20,
    0x0a, // 0000000009 00000 n \n
    0x30,
    0x30,
    0x30,
    0x30,
    0x30,
    0x30,
    0x30,
    0x35,
    0x38,
    0x20,
    0x30,
    0x30,
    0x30,
    0x30,
    0x30,
    0x20,
    0x6e,
    0x20,
    0x0a, // 0000000058 00000 n \n
    0x30,
    0x30,
    0x30,
    0x30,
    0x30,
    0x30,
    0x30,
    0x31,
    0x31,
    0x35,
    0x20,
    0x30,
    0x30,
    0x30,
    0x30,
    0x30,
    0x20,
    0x6e,
    0x20,
    0x0a, // 0000000115 00000 n \n
    0x74,
    0x72,
    0x61,
    0x69,
    0x6c,
    0x65,
    0x72,
    0x0a, // trailer\n
    0x3c,
    0x3c,
    0x2f,
    0x53,
    0x69,
    0x7a,
    0x65,
    0x20,
    0x33,
    0x2f,
    0x52,
    0x6f,
    0x6f,
    0x74,
    0x20,
    0x31,
    0x20,
    0x30,
    0x20,
    0x52,
    0x2f,
    0x3e,
    0x3e,
    0x0a,
    // <</Size 3/Root 1 0 R/>>\n
    0x73,
    0x74,
    0x61,
    0x72,
    0x74,
    0x78,
    0x72,
    0x65,
    0x66,
    0x0a, // startxref\n
    0x31,
    0x37,
    0x30,
    0x0a, // 170\n
    0x25,
    0x25,
    0x45,
    0x4f,
    0x46,
    0x0a, // %%EOF\n
  ]).buffer as ArrayBuffer;

  beforeEach(async () => {
    // Reset module cache between tests
    vi.resetModules();
  });

  it("should return page count for a valid 1-page PDF", async () => {
    const mod = await import("../render");
    getPdfPageCount = mod.getPdfPageCount;
    const count = await getPdfPageCount(MINIMAL_PDF.slice(0));
    expect(count).toBe(1);
  });

  it("should throw for an invalid PDF", async () => {
    const mod = await import("../render");
    getPdfPageCount = mod.getPdfPageCount;
    const invalid = new ArrayBuffer(10);
    await expect(getPdfPageCount(invalid)).rejects.toThrow();
  });

  it("should not detach the original ArrayBuffer", async () => {
    const mod = await import("../render");
    getPdfPageCount = mod.getPdfPageCount;
    const original = new Uint8Array(MINIMAL_PDF.slice(0));
    await getPdfPageCount(original.buffer);
    // Original should still be accessible (not detached)
    expect(original.byteLength).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Add test scope to `vitest.config.ts`**

In `vitest.config.ts`, add to the `include` array (after `libs/sqlformat/**/*.test.ts`, line 32):

```typescript
      "libs/sqlformat/**/*.test.ts",
      "libs/pdf-to-image/**/*.test.ts",
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `npx vitest run libs/pdf-to-image --reporter=verbose`
Expected: DPI preset tests PASS, getPdfPageCount tests PASS (tests that depend on canvas are skipped since environment is node)

- [ ] **Step 4: Commit**

```bash
git add libs/pdf-to-image/__tests__/render.test.ts vitest.config.ts
git commit -m "test(pdf-to-image): add unit tests for render module"
```

---

### Task 5: English Translation Files

**Files:**

- Modify: `public/locales/en/tools.json`
- Create: `public/locales/en/pdf-to-image.json`

- [ ] **Step 1: Add tool entry to `public/locales/en/tools.json`**

Insert before the `"categories"` key (before line 258). Place it after the `"image-to-pdf"` entry:

```json
  "pdf-to-image": {
    "title": "PDF to Image - Convert PDF Pages to PNG, JPG, WebP",
    "shortTitle": "PDF to Image",
    "description": "Convert PDF pages to PNG, JPG, or WebP images with DPI control. Select pages, adjust quality, download individually or as ZIP. All processing runs in your browser."
  },
```

- [ ] **Step 2: Create `public/locales/en/pdf-to-image.json`**

```json
{
  "dropPdf": "Drop a PDF here or click to select",
  "supportedFormats": "Supports PDF files only",
  "onlyPdfSupported": "Only PDF files are supported",
  "outputFormat": "Output Format",
  "dpi": "DPI",
  "dpiPreview": "Preview (72 DPI)",
  "dpiStandard": "Standard (144 DPI)",
  "dpiHigh": "High Quality (216 DPI)",
  "dpiPrint": "Print (288 DPI)",
  "dpiCustom": "Custom",
  "customDpi": "Custom DPI",
  "outputDimensions": "Output dimensions: {width} × {height} px",
  "quality": "Quality",
  "selectAll": "Select All",
  "deselectAll": "Deselect All",
  "pageSelection": "{selected} of {total} pages selected",
  "reselect": "Reselect",
  "convertButton": "Convert to Images",
  "converting": "Converting...",
  "convertProgress": "Processing page {current} of {total}...",
  "convertSuccess": "Conversion Complete",
  "totalPages": "{count} pages converted",
  "totalSize": "Total size: {size}",
  "page": "Page {num}",
  "dimensions": "{width} × {height} px",
  "download": "Download",
  "downloadZip": "Download All as ZIP",
  "startOver": "Start Over",
  "processing": "Processing...",
  "encryptedPdf": "This PDF is encrypted and cannot be converted",
  "corruptedPdf": "This PDF file is corrupted",
  "outOfMemory": "Out of memory. Try reducing DPI or selecting fewer pages.",
  "renderFailed": "Failed to render page {page}. Skipping.",
  "largePdf": "Large PDF ({size}) — processing may be slow",
  "manyPages": "PDF has {count} pages — processing may be slow",
  "largeExport": "Estimated output exceeds 2 GB. This may cause browser issues.",
  "noPagesSelected": "Please select at least one page",
  "descriptions": {
    "title": "About PDF to Image Converter",
    "aeoDefinition": "PDF to Image Converter is a free online tool that converts PDF pages to PNG, JPG, or WebP images directly in your browser. Select specific pages, adjust DPI and quality, then download individually or as a ZIP archive. No files are uploaded to any server.",
    "whatIsTitle": "What is the PDF to Image Converter?",
    "whatIs": "PDF to Image Converter transforms each page of a PDF document into a high-quality image. Choose between PNG (lossless), JPG (compressed), or WebP formats. Adjust DPI from 72 (preview) to 600 (ultra-high resolution) to match your needs.",
    "stepsTitle": "How to Convert PDF to Images",
    "step1Title": "Upload your PDF",
    "step1Text": "Drag and drop a PDF file or click to browse. The tool will generate page thumbnails for preview.",
    "step2Title": "Configure output settings",
    "step2Text": "Select pages to convert, choose output format (PNG, JPG, or WebP), set DPI, and adjust quality for compressed formats.",
    "step3Title": "Download your images",
    "step3Text": "Download individual images or all pages as a ZIP archive. All processing happens locally in your browser.",
    "p1": "All processing happens locally in your browser. Your PDF files are never uploaded to any server.",
    "p2": "Choose PNG for lossless quality, JPG for smaller file sizes, or WebP for modern web compatibility. Higher DPI settings produce larger, more detailed images suitable for printing. To merge images into a PDF instead, use [Images to PDF](/image-to-pdf).",
    "p3": "The conversion renders each PDF page at the selected resolution. For scanned documents, a DPI of 144–216 provides a good balance of quality and file size. To compress the resulting images, try [Image Compressor](/image-compress).",
    "faq1Q": "What DPI should I use?",
    "faq1A": "72 DPI is suitable for quick previews. 144 DPI works well for web display. 216 DPI provides high quality for most purposes. 288 DPI is recommended for printing. You can also set a custom DPI between 72 and 600.",
    "faq2Q": "Are my PDF files uploaded to a server?",
    "faq2A": "No. All PDF processing runs entirely in your browser. No data is sent to any server.",
    "faq3Q": "What is the maximum PDF size I can convert?",
    "faq3A": "There is no strict file size limit, but very large PDFs (>100MB) or PDFs with many pages (>200) may be slow to process. The tool will warn you before processing large files. Memory usage depends on the DPI setting and number of pages selected."
  }
}
```

- [ ] **Step 3: Verify JSON is valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('public/locales/en/pdf-to-image.json','utf8')); console.log('OK')"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add public/locales/en/tools.json public/locales/en/pdf-to-image.json
git commit -m "feat(pdf-to-image): add English translations"
```

---

### Task 6: Route Entry Page

**Files:**

- Create: `app/[locale]/pdf-to-image/page.tsx`

- [ ] **Step 1: Create directory and file**

```bash
mkdir -p app/\[locale\]/pdf-to-image
```

- [ ] **Step 2: Write `app/[locale]/pdf-to-image/page.tsx`**

Follows the exact pattern from `app/[locale]/pdf-split/page.tsx`:

```typescript
import { getTranslations } from "next-intl/server";
import { generatePageMeta } from "../../../libs/seo";
import { buildToolSchemas } from "../../../components/json-ld";
import { TOOLS, TOOL_CATEGORIES, CATEGORY_SLUGS } from "../../../libs/tools";
import PdfToImagePage from "./pdf-to-image-page";

const PATH = "/pdf-to-image";
const TOOL_KEY = "pdf-to-image";
const tool = TOOLS.find((t) => t.key === TOOL_KEY)!;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "tools" });
  return generatePageMeta({
    locale,
    path: PATH,
    title: t("pdf-to-image.title"),
    description: t("pdf-to-image.description"),
    ogImage: { type: "tool", key: TOOL_KEY },
  });
}

export default async function PdfToImageRoute({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "tools" });
  const tx = await getTranslations({ locale, namespace: "pdf-to-image" });
  const tc = await getTranslations({ locale, namespace: "categories" });
  const category = TOOL_CATEGORIES.find((c) => c.tools.includes(TOOL_KEY))!;
  const categorySlug = CATEGORY_SLUGS[category.key];

  const howToSteps = Array.from({ length: 3 }, (_, i) => ({
    name: tx(`descriptions.step${i + 1}Title`),
    text: tx(`descriptions.step${i + 1}Text`),
  })).filter((step) => step.name);

  const schemas = buildToolSchemas({
    name: t("pdf-to-image.title"),
    description: tx.has("descriptions.aeoDefinition")
      ? tx("descriptions.aeoDefinition")
      : t("pdf-to-image.description"),
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
      <PdfToImagePage />
    </>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add app/[locale]/pdf-to-image/page.tsx
git commit -m "feat(pdf-to-image): add route entry page"
```

---

### Task 7: Page Component — Upload + Configure + Results

**Files:**

- Create: `app/[locale]/pdf-to-image/pdf-to-image-page.tsx`

This is the largest task. The component implements a three-state UI matching the pdf-split pattern.

- [ ] **Step 1: Write the complete page component**

```tsx
"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import Layout from "../../../components/layout";
import PrivacyBanner from "../../../components/privacy-banner";
import DescriptionSection from "../../../components/description-section";
import RelatedTools from "../../../components/related-tools";
import { Button } from "../../../components/ui/button";
import { showToast } from "../../../libs/toast";
import { formatBytes } from "../../../utils/storage";
import { fromEvent } from "file-selector";
import { Download, RotateCw, ImageDown } from "lucide-react";
import { zipSync } from "fflate";
import { getPdfPageCount, renderPagesToBlobs } from "../../../libs/pdf-to-image/render";
import { renderPageThumbnail } from "../../../libs/pdf-split/thumbnail";
import {
  DPI_PRESETS,
  CUSTOM_DPI_MIN,
  CUSTOM_DPI_MAX,
  DPI_BASE,
} from "../../../libs/pdf-to-image/types";
import type { RenderResult, RenderProgress } from "../../../libs/pdf-to-image/types";
import type { OutputFormat } from "../../../libs/image/types";
import { FORMAT_EXTENSIONS, FORMAT_DISPLAY_NAMES } from "../../../libs/image/types";
import "rc-slider/assets/index.css";

const Slider = dynamic(() => import("rc-slider"), {
  ssr: false,
  loading: () => <div className="h-6 w-full animate-pulse bg-bg-input rounded" />,
});

const THUMBNAIL_CONCURRENCY = 3;

const sliderStyles = {
  rail: { backgroundColor: "var(--border-default)", height: 4 },
  track: { backgroundColor: "var(--accent-cyan)", height: 4 },
  handle: {
    borderColor: "var(--accent-cyan)",
    backgroundColor: "var(--bg-surface)",
    height: 16,
    width: 16,
    marginLeft: -6,
    marginTop: -6,
    boxShadow: "0 0 4px var(--accent-cyan)",
  },
};

const FORMATS: OutputFormat[] = ["png", "jpeg", "webp"];

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadAsZip(results: RenderResult[], format: OutputFormat) {
  const zipData: Record<string, Uint8Array> = {};
  const ext = FORMAT_EXTENSIONS[format];

  Promise.all(
    results.map(async (r, i) => {
      const buf = await r.blob.arrayBuffer();
      zipData[`page_${i + 1}${ext}`] = new Uint8Array(buf);
    })
  ).then(() => {
    const zipBytes = zipSync(zipData);
    const blob = new Blob([new Uint8Array(zipBytes)], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "pdf-images.zip";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}

async function renderThumbnails(
  sourceData: ArrayBuffer,
  pageCount: number,
  onThumbnail: (index: number, url: string) => void
) {
  let running = 0;
  let idx = 0;

  await new Promise<void>((resolve) => {
    function next() {
      while (running < THUMBNAIL_CONCURRENCY && idx < pageCount) {
        const currentIdx = idx;
        idx++;
        running++;

        (async () => {
          try {
            const url = await renderPageThumbnail(sourceData, currentIdx);
            onThumbnail(currentIdx, url);
          } catch {
            // thumbnail rendering failed for this page
          }

          running--;
          if (running === 0 && idx >= pageCount) resolve();
          else next();
        })();
      }
      if (running === 0 && idx >= pageCount) resolve();
    }
    next();
  });
}

function Conversion() {
  const t = useTranslations("pdf-to-image");
  const tc = useTranslations("common");

  // Source file
  const [sourceData, setSourceData] = useState<ArrayBuffer | null>(null);
  const [pageCount, setPageCount] = useState(0);

  // Thumbnails (pageIndex → data URL)
  const [thumbnails, setThumbnails] = useState<Map<number, string>>(new Map());

  // Page selection
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());

  // Output settings
  const [format, setFormat] = useState<OutputFormat>("png");
  const [dpiPresetIndex, setDpiPresetIndex] = useState(1); // default: standard
  const [customDpi, setCustomDpi] = useState(144);
  const [quality, setQuality] = useState(90);

  // Processing
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState<RenderProgress | null>(null);
  const [results, setResults] = useState<RenderResult[]>([]);

  // Refs
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sourceDataRef = useRef<ArrayBuffer | null>(null);
  const thumbnailsRef = useRef<Map<number, string>>(new Map());

  useEffect(() => {
    sourceDataRef.current = sourceData;
  }, [sourceData]);
  useEffect(() => {
    thumbnailsRef.current = thumbnails;
  }, [thumbnails]);
  useEffect(() => {
    return () => {
      sourceDataRef.current = null;
      thumbnailsRef.current.clear();
    };
  }, []);

  // Computed DPI scale
  const scale =
    dpiPresetIndex < DPI_PRESETS.length ? DPI_PRESETS[dpiPresetIndex].scale : customDpi / DPI_BASE;

  // Drag-and-drop
  useEffect(() => {
    const dropZone = dropZoneRef.current;
    if (!dropZone) return;

    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    const onDrop = async (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const dropped = await fromEvent(e);
      if (!dropped || dropped.length === 0) return;
      const pdfFiles = (dropped as File[]).filter((f) => f.name.toLowerCase().endsWith(".pdf"));
      if (pdfFiles.length === 0) {
        showToast(t("onlyPdfSupported"), "warning");
        return;
      }
      await loadPdf(pdfFiles[0]);
    };

    dropZone.addEventListener("dragover", onDragOver);
    dropZone.addEventListener("drop", onDrop);
    return () => {
      dropZone.removeEventListener("dragover", onDragOver);
      dropZone.removeEventListener("drop", onDrop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);

  async function loadPdf(file: File) {
    try {
      const data = await file.arrayBuffer();

      // Large file warning
      if (file.size > 100 * 1024 * 1024) {
        showToast(t("largePdf", { size: formatBytes(file.size, 1000, 1) }), "warning");
      }

      const count = await getPdfPageCount(data);

      // Many pages warning
      if (count > 200) {
        showToast(t("manyPages", { count }), "warning");
      }

      // Default: all pages selected
      const allPages = new Set(Array.from({ length: count }, (_, i) => i));

      setSourceData(data);
      setPageCount(count);
      setSelectedPages(allPages);
      setResults([]);
      setThumbnails(new Map());

      // Render thumbnails with bounded concurrency
      await renderThumbnails(data, count, (index, url) => {
        setThumbnails((prev) => {
          const next = new Map(prev);
          next.set(index, url);
          return next;
        });
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message.toLowerCase() : "";
      if (msg.includes("password") || msg.includes("encrypt")) {
        showToast(t("encryptedPdf"), "warning");
      } else {
        showToast(t("corruptedPdf"), "danger");
      }
    }
  }

  async function handleFileInput(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const file = fileList[0];
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      showToast(t("onlyPdfSupported"), "warning");
      return;
    }
    await loadPdf(file);
  }

  // Page selection helpers
  function togglePage(pageIndex: number) {
    setSelectedPages((prev) => {
      const next = new Set(prev);
      if (next.has(pageIndex)) next.delete(pageIndex);
      else next.add(pageIndex);
      return next;
    });
  }

  function selectAll() {
    setSelectedPages(new Set(Array.from({ length: pageCount }, (_, i) => i)));
  }

  function deselectAll() {
    setSelectedPages(new Set());
  }

  // Estimate memory for selected pages
  function estimateMemory(): number {
    // Rough estimate: width * scale * height * scale * 4 bytes (RGBA) per page
    // Use average thumbnail aspect ratio as proxy
    let total = 0;
    for (const idx of selectedPages) {
      const thumb = thumbnails.get(idx);
      // Default PDF letter size ratio: 612×792 pts
      total += 612 * scale * 792 * scale * 4;
    }
    return total;
  }

  // Convert
  async function handleConvert() {
    if (!sourceData || selectedPages.size === 0) return;

    // Memory warning
    const memEstimate = estimateMemory();
    if (memEstimate > 2 * 1024 * 1024 * 1024) {
      showToast(t("largeExport"), "warning");
    }

    setProcessing(true);
    setProgress(null);
    setResults([]);

    const pageIndices = Array.from(selectedPages).sort((a, b) => a - b);

    try {
      const renderResults = await renderPagesToBlobs(
        sourceData,
        pageIndices,
        { format, quality, scale },
        (p) => setProgress(p)
      );
      setResults(renderResults);
    } catch (err) {
      if (err instanceof Error && err.message.toLowerCase().includes("memory")) {
        showToast(t("outOfMemory"), "danger");
      } else {
        showToast(t("corruptedPdf"), "danger");
      }
    } finally {
      setProcessing(false);
      setProgress(null);
    }
  }

  function handleStartOver() {
    setSourceData(null);
    setPageCount(0);
    setThumbnails(new Map());
    setSelectedPages(new Set());
    setResults([]);
    setProcessing(false);
    setProgress(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // Compute output dimensions for display (based on first page aspect ratio)
  const firstPageViewport = thumbnails.size > 0 ? { w: 612, h: 792 } : null;

  const canConvert = !processing && sourceData !== null && pageCount > 0 && selectedPages.size > 0;

  // --- Result state ---
  if (results.length > 0) {
    const totalSize = results.reduce((sum, r) => sum + r.blob.size, 0);
    return (
      <section className="mt-4">
        <div className="rounded-xl border border-accent-cyan/30 bg-accent-cyan-dim/10 p-6 text-center">
          <div className="text-2xl mb-2">✅</div>
          <p className="text-fg-primary font-semibold text-lg mb-2">{t("convertSuccess")}</p>
          <p className="text-fg-secondary text-sm mb-6">
            {t("totalPages", { count: results.length })} —{" "}
            {t("totalSize", { size: formatBytes(totalSize) })}
          </p>

          <div className="space-y-2 max-w-lg mx-auto text-left">
            {results.map((result, i) => {
              const ext = FORMAT_EXTENSIONS[format];
              const filename = `page_${i + 1}${ext}`;
              return (
                <div
                  key={i}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border-default bg-bg-surface p-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-fg-primary truncate">{filename}</p>
                    <p className="text-xs text-fg-muted">
                      {t("dimensions", { width: result.width, height: result.height })} —{" "}
                      {formatBytes(result.blob.size)}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => downloadBlob(result.blob, filename)}
                  >
                    <Download size={14} className="me-1" />
                    {t("download")}
                  </Button>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-center gap-3 mt-6">
            <Button variant="primary" size="md" onClick={() => downloadAsZip(results, format)}>
              <Download size={16} className="me-1.5" />
              {t("downloadZip")}
            </Button>
            <Button variant="outline" size="md" onClick={handleStartOver}>
              <RotateCw size={16} className="me-1.5" />
              {t("startOver")}
            </Button>
          </div>
        </div>
      </section>
    );
  }

  // --- Empty state — drop zone ---
  if (!sourceData) {
    return (
      <section className="mt-4">
        <div
          ref={dropZoneRef}
          className="relative text-xl rounded-lg border-2 border-dashed border-accent-cyan/30 bg-accent-cyan-dim/10 text-accent-cyan"
          style={{ width: "100%", height: "12rem" }}
        >
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center justify-center px-4 pointer-events-none">
            <span className="text-3xl mb-2">📄</span>
            <span className="font-bold">{t("dropPdf")}</span>
            <span className="text-sm mt-1 text-accent-cyan/70">{t("supportedFormats")}</span>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
            onClick={() => {
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
            onChange={(e) => handleFileInput(e.target.files)}
          />
        </div>
      </section>
    );
  }

  // --- Loaded state — settings sidebar + thumbnail grid ---
  return (
    <section className="mt-4">
      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6">
        {/* Left sidebar — settings */}
        <div className="space-y-4">
          {/* Format selector */}
          <div>
            <label className="block text-sm font-medium text-fg-secondary mb-1">
              {t("outputFormat")}
            </label>
            <div className="flex gap-1">
              {FORMATS.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFormat(f)}
                  className={`flex-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    format === f
                      ? "bg-accent-cyan text-bg-base"
                      : "bg-bg-surface text-fg-secondary hover:text-fg-primary border border-border-default"
                  }`}
                >
                  {FORMAT_DISPLAY_NAMES[f]}
                </button>
              ))}
            </div>
          </div>

          {/* DPI selector */}
          <div>
            <label className="block text-sm font-medium text-fg-secondary mb-1">{t("dpi")}</label>
            <div className="flex flex-col gap-1">
              {DPI_PRESETS.map((preset, i) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setDpiPresetIndex(i)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium text-left transition-colors ${
                    dpiPresetIndex === i
                      ? "bg-accent-cyan text-bg-base"
                      : "bg-bg-surface text-fg-secondary hover:text-fg-primary border border-border-default"
                  }`}
                >
                  {t(`dpi${preset.label.charAt(0).toUpperCase() + preset.label.slice(1)}`)}
                </button>
              ))}
              {/* Custom DPI option */}
              <button
                type="button"
                onClick={() => setDpiPresetIndex(DPI_PRESETS.length)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium text-left transition-colors ${
                  dpiPresetIndex === DPI_PRESETS.length
                    ? "bg-accent-cyan text-bg-base"
                    : "bg-bg-surface text-fg-secondary hover:text-fg-primary border border-border-default"
                }`}
              >
                {t("dpiCustom")}
              </button>
              {dpiPresetIndex === DPI_PRESETS.length && (
                <div className="px-1 pt-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-fg-muted">{t("customDpi")}</span>
                    <span className="font-mono text-sm font-bold text-accent-cyan">
                      {customDpi} DPI
                    </span>
                  </div>
                  <Slider
                    min={CUSTOM_DPI_MIN}
                    max={CUSTOM_DPI_MAX}
                    step={1}
                    value={customDpi}
                    onChange={(v) => setCustomDpi(typeof v === "number" ? v : v[0])}
                    styles={sliderStyles}
                  />
                </div>
              )}
            </div>
            {/* Output dimensions preview */}
            {firstPageViewport && (
              <p className="text-xs text-fg-muted mt-2">
                {t("outputDimensions", {
                  width: Math.round(612 * scale),
                  height: Math.round(792 * scale),
                })}
              </p>
            )}
          </div>

          {/* Quality slider (JPG/WebP only) */}
          {format !== "png" && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-medium text-fg-secondary">{t("quality")}</label>
                <span className="font-mono text-sm font-bold text-accent-cyan">{quality}%</span>
              </div>
              <div className="px-1">
                <Slider
                  min={1}
                  max={100}
                  step={1}
                  value={quality}
                  onChange={(v) => setQuality(typeof v === "number" ? v : v[0])}
                  styles={sliderStyles}
                />
              </div>
            </div>
          )}

          {/* Page selection controls */}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={selectAll}>
              {t("selectAll")}
            </Button>
            <Button variant="outline" size="sm" onClick={deselectAll}>
              {t("deselectAll")}
            </Button>
          </div>

          {/* Page count summary */}
          <p className="text-sm text-fg-secondary">
            {t("pageSelection", { selected: selectedPages.size, total: pageCount })}
          </p>

          {/* Action buttons */}
          <div className="flex flex-col gap-2 pt-2 border-t border-border-default">
            <Button variant="secondary" size="md" onClick={handleStartOver}>
              <RotateCw size={14} className="me-1" />
              {t("reselect")}
            </Button>
          </div>
        </div>

        {/* Right area — thumbnail grid */}
        <div>
          <div
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 max-h-[560px] overflow-y-auto"
            style={{ scrollbarGutter: "stable" }}
          >
            {Array.from({ length: pageCount }, (_, i) => {
              const isSelected = selectedPages.has(i);
              return (
                /* eslint-disable-next-line jsx-a11y/no-static-element-interactions */
                <div
                  key={i}
                  onClick={() => togglePage(i)}
                  onKeyDown={() => {}}
                  className={`relative rounded-lg border overflow-hidden transition-all cursor-pointer ${
                    isSelected
                      ? "border-accent-cyan ring-2 ring-accent-cyan/30"
                      : "border-border-default hover:border-accent-cyan/50 opacity-60"
                  }`}
                >
                  {/* Checkbox overlay */}
                  <div className="absolute top-1 left-1 z-10">
                    <div
                      className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                        isSelected
                          ? "bg-accent-cyan border-accent-cyan"
                          : "bg-bg-surface/80 border-fg-muted"
                      }`}
                    >
                      {isSelected && (
                        <svg className="w-3 h-3 text-bg-base" viewBox="0 0 12 12" fill="none">
                          <path
                            d="M2 6L5 9L10 3"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </div>
                  </div>

                  <div className="aspect-[3/4] bg-bg-input flex items-center justify-center">
                    {thumbnails.has(i) ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={thumbnails.get(i)!}
                        alt={`Page ${i + 1}`}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div className="w-5 h-5 border-2 border-accent-cyan border-t-transparent rounded-full animate-spin" />
                    )}
                  </div>
                  <div className="px-2 py-1 text-xs text-fg-muted text-center truncate">
                    {i + 1}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Progress bar */}
          {processing && progress && (
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs text-fg-muted mb-1">
                <span>
                  {t("convertProgress", { current: progress.current, total: progress.total })}
                </span>
                <span>{Math.round((progress.current / progress.total) * 100)}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-bg-input overflow-hidden">
                <div
                  className="h-full bg-accent-cyan rounded-full transition-all duration-300"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Convert button */}
          <div className="mt-4 flex justify-center">
            <Button
              variant="primary"
              size="lg"
              disabled={!canConvert}
              onClick={handleConvert}
              className="w-full max-w-md rounded-full uppercase font-bold"
            >
              <ImageDown size={18} className="me-1.5" />
              {processing ? t("converting") : t("convertButton")}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function PdfToImagePage() {
  const t = useTranslations("tools");
  const title = t("pdf-to-image.shortTitle");
  return (
    <Layout title={title} categoryLabel={t("categories.visual")} categorySlug="visual-media">
      <div className="container mx-auto px-4 pt-3 pb-6">
        <PrivacyBanner variant="files" />
        <Conversion />
        <DescriptionSection namespace="pdf-to-image" />
        <RelatedTools currentTool="pdf-to-image" />
      </div>
    </Layout>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors in `pdf-to-image-page.tsx` or `page.tsx`

- [ ] **Step 3: Verify dev server renders**

Run: `npm run dev`
Navigate to `http://localhost:3000/pdf-to-image`
Expected: Upload drop zone renders. No console errors.

- [ ] **Step 4: Commit**

```bash
git add app/[locale]/pdf-to-image/pdf-to-image-page.tsx
git commit -m "feat(pdf-to-image): add page component with upload, configure, and results"
```

---

### Task 8: CJK Locale Translations (zh-CN, zh-TW, ja, ko)

**Files:**

- Modify: `public/locales/{zh-CN,zh-TW,ja,ko}/tools.json`
- Create: `public/locales/{zh-CN,zh-TW,ja,ko}/pdf-to-image.json`

- [ ] **Step 1: Add tool entries to each locale's `tools.json`**

For each of zh-CN, zh-TW, ja, ko, add a `"pdf-to-image"` entry before the `"categories"` key in the respective `tools.json`. Follow the pattern from existing PDF tools in that locale.

**zh-CN** (`public/locales/zh-CN/tools.json`):

```json
  "pdf-to-image": {
    "title": "PDF 转图片 - 将 PDF 页面转换为 PNG、JPG、WebP",
    "shortTitle": "PDF 转图片",
    "description": "将 PDF 页面转换为 PNG、JPG 或 WebP 图片，支持 DPI 调节、页面选择、单独或批量 ZIP 下载。所有处理在浏览器本地完成。",
    "searchTerms": "pdftupian pftp zhuanhuan tupian daochu"
  },
```

**zh-TW** (`public/locales/zh-TW/tools.json`):

```json
  "pdf-to-image": {
    "title": "PDF 轉圖片 - 將 PDF 頁面轉換為 PNG、JPG、WebP",
    "shortTitle": "PDF 轉圖片",
    "description": "將 PDF 頁面轉換為 PNG、JPG 或 WebP 圖片，支援 DPI 調節、頁面選擇、單獨或批次 ZIP 下載。所有處理在瀏覽器本機完成。",
    "searchTerms": "pdftupian pftp zhuanhuan tupian daochu"
  },
```

**ja** (`public/locales/ja/tools.json`):

```json
  "pdf-to-image": {
    "title": "PDF 画像変換 - PDF ページを PNG、JPG、WebP に変換",
    "shortTitle": "PDF 画像変換",
    "description": "PDFページをPNG、JPG、WebP画像に変換。DPI調整、ページ選択、個別またはZIP一括ダウンロードに対応。すべてブラウザで処理。",
    "searchTerms": "pdftogazou ptfp gazou henkan"
  },
```

**ko** (`public/locales/ko/tools.json`):

```json
  "pdf-to-image": {
    "title": "PDF 이미지 변환 - PDF 페이지를 PNG, JPG, WebP로 변환",
    "shortTitle": "PDF 이미지 변환",
    "description": "PDF 페이지를 PNG, JPG, WebP 이미지로 변환합니다. DPI 조절, 페이지 선택, 개별 또는 ZIP 일괄 다운로드를 지원합니다. 모든 처리는 브라우저에서 실행됩니다.",
    "searchTerms": "pdfimiji pfi imiji bunhwan"
  },
```

- [ ] **Step 2: Create `pdf-to-image.json` for zh-CN**

```json
{
  "dropPdf": "拖拽 PDF 到此处或点击选择",
  "supportedFormats": "仅支持 PDF 文件",
  "onlyPdfSupported": "仅支持 PDF 文件",
  "outputFormat": "输出格式",
  "dpi": "DPI",
  "dpiPreview": "预览（72 DPI）",
  "dpiStandard": "标准（144 DPI）",
  "dpiHigh": "高清（216 DPI）",
  "dpiPrint": "打印（288 DPI）",
  "dpiCustom": "自定义",
  "customDpi": "自定义 DPI",
  "outputDimensions": "输出尺寸：{width} × {height} px",
  "quality": "质量",
  "selectAll": "全选",
  "deselectAll": "取消全选",
  "pageSelection": "共 {total} 页，已选 {selected} 页",
  "reselect": "重新选择",
  "convertButton": "转换为图片",
  "converting": "转换中...",
  "convertProgress": "正在处理第 {current} 页，共 {total} 页...",
  "convertSuccess": "转换完成",
  "totalPages": "共转换 {count} 页",
  "totalSize": "总大小：{size}",
  "page": "第 {num} 页",
  "dimensions": "{width} × {height} px",
  "download": "下载",
  "downloadZip": "全部下载为 ZIP",
  "startOver": "重新开始",
  "processing": "处理中...",
  "encryptedPdf": "此 PDF 已加密，无法转换",
  "corruptedPdf": "此 PDF 文件已损坏",
  "outOfMemory": "内存不足，请尝试降低 DPI 或减少选择页数。",
  "renderFailed": "第 {page} 页渲染失败，已跳过。",
  "largePdf": "PDF 文件较大（{size}），处理可能较慢",
  "manyPages": "PDF 共 {count} 页，处理可能较慢",
  "largeExport": "预计输出超过 2 GB，可能导致浏览器卡顿。",
  "noPagesSelected": "请至少选择一页",
  "descriptions": {
    "title": "关于 PDF 转图片工具",
    "aeoDefinition": "PDF 转图片工具是一款免费的在线工具，可将 PDF 页面转换为 PNG、JPG 或 WebP 图片。所有处理在浏览器本地完成，文件不会上传到任何服务器。",
    "whatIsTitle": "什么是 PDF 转图片工具？",
    "whatIs": "PDF 转图片工具将 PDF 文档的每一页转换为高质量图片。支持 PNG（无损）、JPG（压缩）或 WebP 格式，DPI 可从 72（预览）到 600（超高分辨率）自由调节。",
    "stepsTitle": "如何将 PDF 转换为图片",
    "step1Title": "上传 PDF 文件",
    "step1Text": "拖拽 PDF 文件到上传区域，或点击浏览选择文件。工具会自动生成页面缩略图预览。",
    "step2Title": "配置输出设置",
    "step2Text": "选择要转换的页面、输出格式（PNG、JPG 或 WebP）、DPI 和压缩质量。",
    "step3Title": "下载图片",
    "step3Text": "逐页下载或打包为 ZIP 一次性下载。所有处理在浏览器本地完成。",
    "p1": "所有处理均在浏览器本地完成，PDF 文件不会上传到任何服务器。",
    "p2": "选择 PNG 获得无损质量，JPG 获得更小的文件体积，或 WebP 获得现代 Web 兼容性。较高的 DPI 设置可生成更大、更精细的图片，适合打印。如需将图片合并为 PDF，请使用 [图片转 PDF](/image-to-pdf)。",
    "p3": "转换以选定的分辨率渲染每一页 PDF。对于扫描文档，144–216 DPI 可在质量和文件大小之间取得良好平衡。如需压缩生成的图片，请尝试 [图片压缩](/image-compress)。",
    "faq1Q": "应该使用什么 DPI？",
    "faq1A": "72 DPI 适合快速预览，144 DPI 适合网页显示，216 DPI 适合大多数高质量用途，288 DPI 推荐用于打印。您也可以设置 72 到 600 之间的自定义 DPI。",
    "faq2Q": "PDF 文件会上传到服务器吗？",
    "faq2A": "不会。所有 PDF 处理完全在浏览器中运行，不会将数据发送到任何服务器。",
    "faq3Q": "最大支持多大的 PDF 文件？",
    "faq3A": "没有严格的文件大小限制，但超过 100MB 或页数超过 200 的 PDF 可能处理较慢。工具会在处理大文件前发出警告。内存使用取决于 DPI 设置和选择的页数。"
  }
}
```

- [ ] **Step 3: Create `pdf-to-image.json` for zh-TW**

Use the zh-CN content as base, with Traditional Chinese characters:

```json
{
  "dropPdf": "拖曳 PDF 到此處或點擊選擇",
  "supportedFormats": "僅支援 PDF 檔案",
  "onlyPdfSupported": "僅支援 PDF 檔案",
  "outputFormat": "輸出格式",
  "dpi": "DPI",
  "dpiPreview": "預覽（72 DPI）",
  "dpiStandard": "標準（144 DPI）",
  "dpiHigh": "高清（216 DPI）",
  "dpiPrint": "列印（288 DPI）",
  "dpiCustom": "自訂",
  "customDpi": "自訂 DPI",
  "outputDimensions": "輸出尺寸：{width} × {height} px",
  "quality": "品質",
  "selectAll": "全選",
  "deselectAll": "取消全選",
  "pageSelection": "共 {total} 頁，已選 {selected} 頁",
  "reselect": "重新選擇",
  "convertButton": "轉換為圖片",
  "converting": "轉換中...",
  "convertProgress": "正在處理第 {current} 頁，共 {total} 頁...",
  "convertSuccess": "轉換完成",
  "totalPages": "共轉換 {count} 頁",
  "totalSize": "總大小：{size}",
  "page": "第 {num} 頁",
  "dimensions": "{width} × {height} px",
  "download": "下載",
  "downloadZip": "全部下載為 ZIP",
  "startOver": "重新開始",
  "processing": "處理中...",
  "encryptedPdf": "此 PDF 已加密，無法轉換",
  "corruptedPdf": "此 PDF 檔案已損壞",
  "outOfMemory": "記憶體不足，請嘗試降低 DPI 或減少選擇頁數。",
  "renderFailed": "第 {page} 頁渲染失敗，已跳過。",
  "largePdf": "PDF 檔案較大（{size}），處理可能較慢",
  "manyPages": "PDF 共 {count} 頁，處理可能較慢",
  "largeExport": "預計輸出超過 2 GB，可能導致瀏覽器卡頓。",
  "noPagesSelected": "請至少選擇一頁",
  "descriptions": {
    "title": "關於 PDF 轉圖片工具",
    "aeoDefinition": "PDF 轉圖片工具是一款免費的線上工具，可將 PDF 頁面轉換為 PNG、JPG 或 WebP 圖片。所有處理在瀏覽器本機完成，檔案不會上傳到任何伺服器。",
    "whatIsTitle": "什麼是 PDF 轉圖片工具？",
    "whatIs": "PDF 轉圖片工具將 PDF 文件的每一頁轉換為高品質圖片。支援 PNG（無損）、JPG（壓縮）或 WebP 格式，DPI 可從 72（預覽）到 600（超高解析度）自由調節。",
    "stepsTitle": "如何將 PDF 轉換為圖片",
    "step1Title": "上傳 PDF 檔案",
    "step1Text": "拖曳 PDF 檔案到上傳區域，或點擊瀏覽選擇檔案。工具會自動產生頁面縮圖預覽。",
    "step2Title": "設定輸出選項",
    "step2Text": "選擇要轉換的頁面、輸出格式（PNG、JPG 或 WebP）、DPI 和壓縮品質。",
    "step3Title": "下載圖片",
    "step3Text": "逐頁下載或打包為 ZIP 一次下載。所有處理在瀏覽器本機完成。",
    "p1": "所有處理均在瀏覽器本機完成，PDF 檔案不會上傳到任何伺服器。",
    "p2": "選擇 PNG 獲得無損品質，JPG 獲得更小的檔案大小，或 WebP 獲得現代 Web 相容性。較高的 DPI 設定可產生更大、更精細的圖片，適合列印。如需將圖片合併為 PDF，請使用 [圖片轉 PDF](/image-to-pdf)。",
    "p3": "轉換以選定的解析度渲染每一頁 PDF。對於掃描文件，144–216 DPI 可在品質和檔案大小之間取得良好平衡。如需壓縮產生的圖片，請嘗試 [圖片壓縮](/image-compress)。",
    "faq1Q": "應該使用什麼 DPI？",
    "faq1A": "72 DPI 適合快速預覽，144 DPI 適合網頁顯示，216 DPI 適合大多數高品質用途，288 DPI 推薦用於列印。您也可以設定 72 到 600 之間的自訂 DPI。",
    "faq2Q": "PDF 檔案會上傳到伺服器嗎？",
    "faq2A": "不會。所有 PDF 處理完全在瀏覽器中執行，不會將資料傳送到任何伺服器。",
    "faq3Q": "最大支援多大的 PDF 檔案？",
    "faq3A": "沒有嚴格的檔案大小限制，但超過 100MB 或頁數超過 200 的 PDF 可能處理較慢。工具會在處理大檔案前發出警告。記憶體使用取決於 DPI 設定和選擇的頁數。"
  }
}
```

- [ ] **Step 4: Create `pdf-to-image.json` for ja and ko**

**ja** (`public/locales/ja/pdf-to-image.json`):

```json
{
  "dropPdf": "PDF をドラッグ＆ドロップまたはクリックして選択",
  "supportedFormats": "PDF ファイルのみ対応",
  "onlyPdfSupported": "PDF ファイルのみ対応しています",
  "outputFormat": "出力形式",
  "dpi": "DPI",
  "dpiPreview": "プレビュー（72 DPI）",
  "dpiStandard": "標準（144 DPI）",
  "dpiHigh": "高画質（216 DPI）",
  "dpiPrint": "印刷（288 DPI）",
  "dpiCustom": "カスタム",
  "customDpi": "カスタム DPI",
  "outputDimensions": "出力サイズ：{width} × {height} px",
  "quality": "品質",
  "selectAll": "全選択",
  "deselectAll": "全解除",
  "pageSelection": "{total} ページ中 {selected} ページ選択",
  "reselect": "再選択",
  "convertButton": "画像に変換",
  "converting": "変換中...",
  "convertProgress": "{total} ページ中 {current} ページを処理中...",
  "convertSuccess": "変換完了",
  "totalPages": "{count} ページ変換済み",
  "totalSize": "合計サイズ：{size}",
  "page": "{num} ページ",
  "dimensions": "{width} × {height} px",
  "download": "ダウンロード",
  "downloadZip": "ZIP で一括ダウンロード",
  "startOver": "最初からやり直す",
  "processing": "処理中...",
  "encryptedPdf": "この PDF は暗号化されているため変換できません",
  "corruptedPdf": "この PDF ファイルは破損しています",
  "outOfMemory": "メモリ不足です。DPI を下げるか、選択ページ数を減らしてください。",
  "renderFailed": "{page} ページのレンダリングに失敗しました。スキップします。",
  "largePdf": "大きな PDF（{size}）— 処理に時間がかかる場合があります",
  "manyPages": "PDF は {count} ページあります — 処理に時間がかかる場合があります",
  "largeExport": "推定出力サイズが 2 GB を超えています。ブラウザに負荷がかかる可能性があります。",
  "noPagesSelected": "少なくとも1ページを選択してください",
  "descriptions": {
    "title": "PDF 画像変換ツールについて",
    "aeoDefinition": "PDF 画像変換ツールは、ブラウザ上で PDF ページを PNG、JPG、WebP 画像に変換する無料のオンラインツールです。ファイルはサーバーにアップロードされません。",
    "whatIsTitle": "PDF 画像変換ツールとは？",
    "whatIs": "PDF の各ページを高品質な画像に変換します。PNG（ロスレス）、JPG（圧縮）、WebP フォーマットに対応。DPI は 72（プレビュー）から 600（超高解像度）まで調整可能です。",
    "stepsTitle": "PDF を画像に変換する方法",
    "step1Title": "PDF をアップロード",
    "step1Text": "PDF ファイルをドラッグ＆ドロップするか、クリックして選択。自動的にページのサムネイルが生成されます。",
    "step2Title": "出力設定を構成",
    "step2Text": "変換するページを選択し、出力形式（PNG、JPG、WebP）、DPI、圧縮品質を設定します。",
    "step3Title": "画像をダウンロード",
    "step3Text": "個別にダウンロードするか、ZIP アーカイブで一括ダウンロード。すべての処理はブラウザで実行されます。",
    "p1": "すべての処理はブラウザ上でローカルに行われます。PDF ファイルがサーバーにアップロードされることはありません。",
    "p2": "PNG でロスレス品質、JPG で小さいファイルサイズ、WebP でモダンな Web 互換性を選択できます。高い DPI 設定では印刷に適した大型で精細な画像が生成されます。画像を PDF に結合するには [画像から PDF](/image-to-pdf) をご利用ください。",
    "p3": "変換は選択した解像度で各 PDF ページをレンダリングします。スキャン文書の場合、144–216 DPI が品質とファイルサイズのバランスに優れています。生成された画像を圧縮するには [画像圧縮](/image-compress) をお試しください。",
    "faq1Q": "どの DPI を使うべきですか？",
    "faq1A": "72 DPI はプレビューに適しています。144 DPI は Web 表示、216 DPI は高品質用途、288 DPI は印刷に推奨されます。72 から 600 の間でカスタム DPI を設定することも可能です。",
    "faq2Q": "PDF ファイルはサーバーにアップロードされますか？",
    "faq2A": "いいえ。すべての PDF 処理はブラウザ内で完結します。データがサーバーに送信されることはありません。",
    "faq3Q": "変換できる PDF の最大サイズは？",
    "faq3A": "厳密なファイルサイズ制限はありませんが、100MB を超える PDF や 200 ページ以上の PDF は処理に時間がかかる場合があります。大きなファイルを処理する前に警告が表示されます。メモリ使用量は DPI 設定と選択ページ数に依存します。"
  }
}
```

**ko** (`public/locales/ko/pdf-to-image.json`):

```json
{
  "dropPdf": "PDF를 드래그 앤 드롭하거나 클릭하여 선택",
  "supportedFormats": "PDF 파일만 지원",
  "onlyPdfSupported": "PDF 파일만 지원합니다",
  "outputFormat": "출력 형식",
  "dpi": "DPI",
  "dpiPreview": "미리보기 (72 DPI)",
  "dpiStandard": "표준 (144 DPI)",
  "dpiHigh": "고화질 (216 DPI)",
  "dpiPrint": "인쇄 (288 DPI)",
  "dpiCustom": "사용자 정의",
  "customDpi": "사용자 정의 DPI",
  "outputDimensions": "출력 크기: {width} × {height} px",
  "quality": "품질",
  "selectAll": "전체 선택",
  "deselectAll": "전체 해제",
  "pageSelection": "전체 {total}페이지 중 {selected}페이지 선택",
  "reselect": "다시 선택",
  "convertButton": "이미지로 변환",
  "converting": "변환 중...",
  "convertProgress": "{total}페이지 중 {current}페이지 처리 중...",
  "convertSuccess": "변환 완료",
  "totalPages": "{count}페이지 변환됨",
  "totalSize": "총 크기: {size}",
  "page": "{num}페이지",
  "dimensions": "{width} × {height} px",
  "download": "다운로드",
  "downloadZip": "ZIP으로 일괄 다운로드",
  "startOver": "처음부터 다시",
  "processing": "처리 중...",
  "encryptedPdf": "이 PDF는 암호화되어 변환할 수 없습니다",
  "corruptedPdf": "이 PDF 파일이 손상되었습니다",
  "outOfMemory": "메모리가 부족합니다. DPI를 낮추거나 선택 페이지 수를 줄여보세요.",
  "renderFailed": "{page}페이지 렌더링 실패. 건너뜁니다.",
  "largePdf": "대용량 PDF ({size}) — 처리가 느릴 수 있습니다",
  "manyPages": "PDF가 {count}페이지입니다 — 처리가 느릴 수 있습니다",
  "largeExport": "예상 출력이 2 GB를 초과합니다. 브라우저에 부하가 걸릴 수 있습니다.",
  "noPagesSelected": "최소 한 페이지를 선택하세요",
  "descriptions": {
    "title": "PDF 이미지 변환 도구 정보",
    "aeoDefinition": "PDF 이미지 변환 도구는 브라우저에서 PDF 페이지를 PNG, JPG, WebP 이미지로 변환하는 무료 온라인 도구입니다. 파일은 서버에 업로드되지 않습니다.",
    "whatIsTitle": "PDF 이미지 변환 도구란?",
    "whatIs": "PDF 문서의 각 페이지를 고품질 이미지로 변환합니다. PNG(무손실), JPG(압축), WebP 형식을 지원하며 DPI는 72(미리보기)에서 600(초고해상도)까지 조절 가능합니다.",
    "stepsTitle": "PDF를 이미지로 변환하는 방법",
    "step1Title": "PDF 업로드",
    "step1Text": "PDF 파일을 드래그 앤 드롭하거나 클릭하여 선택하세요. 자동으로 페이지 썸네일이 생성됩니다.",
    "step2Title": "출력 설정 구성",
    "step2Text": "변환할 페이지를 선택하고 출력 형식(PNG, JPG, WebP), DPI, 압축 품질을 설정합니다.",
    "step3Title": "이미지 다운로드",
    "step3Text": "개별 다운로드 또는 ZIP 아카이브로 일괄 다운로드. 모든 처리는 브라우저에서 실행됩니다.",
    "p1": "모든 처리는 브라우저에서 로컬로 이루어집니다. PDF 파일이 서버에 업로드되지 않습니다.",
    "p2": "PNG로 무손실 품질, JPG로 작은 파일 크기, WebP로 최신 웹 호환성을 선택할 수 있습니다. 높은 DPI 설정은 인쇄에 적합한 크고 선명한 이미지를 생성합니다. 이미지를 PDF로 병합하려면 [이미지를 PDF로](/image-to-pdf)를 사용하세요.",
    "p3": "변환은 선택한 해상도로 각 PDF 페이지를 렌더링합니다. 스캔 문서의 경우 144–216 DPI가 품질과 파일 크기의 균형에 적합합니다. 생성된 이미지를 압축하려면 [이미지 압축](/image-compress)을 사용해 보세요.",
    "faq1Q": "어떤 DPI를 사용해야 하나요?",
    "faq1A": "72 DPI는 빠른 미리보기에 적합합니다. 144 DPI는 웹 표시, 216 DPI는 대부분의 고품질 용도, 288 DPI는 인쇄에 권장됩니다. 72에서 600 사이의 사용자 정의 DPI도 설정할 수 있습니다.",
    "faq2Q": "PDF 파일이 서버에 업로드되나요?",
    "faq2A": "아니요. 모든 PDF 처리는 브라우저에서 완전히 실행됩니다. 데이터가 서버로 전송되지 않습니다.",
    "faq3Q": "변환할 수 있는 PDF의 최대 크기는?",
    "faq3A": "엄격한 파일 크기 제한은 없지만, 100MB 이상의 PDF나 200페이지 이상의 PDF는 처리가 느릴 수 있습니다. 큰 파일을 처리하기 전에 경고가 표시됩니다. 메모리 사용량은 DPI 설정과 선택한 페이지 수에 따라 다릅니다."
  }
}
```

- [ ] **Step 5: Verify all JSON files are valid and commit**

```bash
for f in public/locales/{zh-CN,zh-TW,ja,ko}/pdf-to-image.json; do node -e "JSON.parse(require('fs').readFileSync('$f','utf8')); console.log('$f OK')"; done
```

Expected: All 4 files print `OK`

```bash
git add public/locales/zh-CN/tools.json public/locales/zh-CN/pdf-to-image.json \
  public/locales/zh-TW/tools.json public/locales/zh-TW/pdf-to-image.json \
  public/locales/ja/tools.json public/locales/ja/pdf-to-image.json \
  public/locales/ko/tools.json public/locales/ko/pdf-to-image.json
git commit -m "feat(pdf-to-image): add CJK translations (zh-CN, zh-TW, ja, ko)"
```

---

### Task 9: Latin Locale Translations (es, pt-BR, fr, de, ru)

**Files:**

- Modify: `public/locales/{es,pt-BR,fr,de,ru}/tools.json`
- Create: `public/locales/{es,pt-BR,fr,de,ru}/pdf-to-image.json`

- [ ] **Step 1: Add `"pdf-to-image"` entry to each locale's `tools.json`**

Add before the `"categories"` key in each file. Same structure, native language title/description:

**es** (`public/locales/es/tools.json`):

```json
  "pdf-to-image": {
    "title": "PDF a Imagen - Convertir páginas PDF a PNG, JPG, WebP",
    "shortTitle": "PDF a Imagen",
    "description": "Convierte páginas PDF a imágenes PNG, JPG o WebP con control de DPI. Selección de páginas, ajuste de calidad, descarga individual o ZIP. Todo en tu navegador."
  },
```

**pt-BR** (`public/locales/pt-BR/tools.json`):

```json
  "pdf-to-image": {
    "title": "PDF para Imagem - Converter páginas PDF para PNG, JPG, WebP",
    "shortTitle": "PDF para Imagem",
    "description": "Converta páginas PDF em imagens PNG, JPG ou WebP com controle de DPI. Selecione páginas, ajuste a qualidade, baixe individualmente ou em ZIP. Tudo no seu navegador."
  },
```

**fr** (`public/locales/fr/tools.json`):

```json
  "pdf-to-image": {
    "title": "PDF en Image - Convertir des pages PDF en PNG, JPG, WebP",
    "shortTitle": "PDF en Image",
    "description": "Convertissez des pages PDF en images PNG, JPG ou WebP avec contrôle DPI. Sélection de pages, réglage qualité, téléchargement individuel ou ZIP. Tout dans votre navigateur."
  },
```

**de** (`public/locales/de/tools.json`):

```json
  "pdf-to-image": {
    "title": "PDF zu Bild - PDF-Seiten als PNG, JPG, WebP konvertieren",
    "shortTitle": "PDF zu Bild",
    "description": "Konvertieren Sie PDF-Seiten in PNG-, JPG- oder WebP-Bilder mit DPI-Kontrolle. Seitenauswahl, Qualitätsanpassung, Einzel- oder ZIP-Download. Alles im Browser."
  },
```

**ru** (`public/locales/ru/tools.json`):

```json
  "pdf-to-image": {
    "title": "PDF в изображение — конвертация страниц PDF в PNG, JPG, WebP",
    "shortTitle": "PDF в изображение",
    "description": "Конвертируйте страницы PDF в изображения PNG, JPG или WebP с контролем DPI. Выбор страниц, настройка качества, загрузка по одному или в ZIP. Всё в браузере."
  },
```

- [ ] **Step 2: Create `pdf-to-image.json` for each Latin locale**

Each file follows the same key structure as the English version. Translate all values into the target language. Use native technical terminology (e.g., German "Qualität" not "Quality", French "qualité" not "quality").

The files are large but follow the exact same key structure as the English `pdf-to-image.json` from Task 5. **Every key must be present in every locale file** — no missing keys.

Create the files with idiomatic translations. The key structure is:

- UI strings: `dropPdf`, `supportedFormats`, `onlyPdfSupported`, `outputFormat`, `dpi`, `dpiPreview`, `dpiStandard`, `dpiHigh`, `dpiPrint`, `dpiCustom`, `customDpi`, `outputDimensions`, `quality`, `selectAll`, `deselectAll`, `pageSelection`, `reselect`, `convertButton`, `converting`, `convertProgress`, `convertSuccess`, `totalPages`, `totalSize`, `page`, `dimensions`, `download`, `downloadZip`, `startOver`, `processing`, `encryptedPdf`, `corruptedPdf`, `outOfMemory`, `renderFailed`, `largePdf`, `manyPages`, `largeExport`, `noPagesSelected`
- Description block: `descriptions.title`, `descriptions.aeoDefinition`, `descriptions.whatIsTitle`, `descriptions.whatIs`, `descriptions.stepsTitle`, `descriptions.step1Title`, `descriptions.step1Text`, `descriptions.step2Title`, `descriptions.step2Text`, `descriptions.step3Title`, `descriptions.step3Text`, `descriptions.p1`, `descriptions.p2`, `descriptions.p3`, `descriptions.faq1Q`, `descriptions.faq1A`, `descriptions.faq2Q`, `descriptions.faq2A`, `descriptions.faq3Q`, `descriptions.faq3A`

- [ ] **Step 3: Verify JSON validity and commit**

```bash
for locale in es pt-BR fr de ru; do
  node -e "JSON.parse(require('fs').readFileSync('public/locales/$locale/pdf-to-image.json','utf8')); console.log('$locale OK')"
done
```

Expected: All 5 files print `OK`

```bash
git add public/locales/{es,pt-BR,fr,de,ru}/tools.json \
  public/locales/{es,pt-BR,fr,de,ru}/pdf-to-image.json
git commit -m "feat(pdf-to-image): add Latin locale translations (es, pt-BR, fr, de, ru)"
```

---

### Task 10: Config & Doc Updates

**Files:**

- Modify: `AGENTS.md`

- [ ] **Step 1: Update AGENTS.md — Available Tools table**

Add a row to the Available Tools table (after the `image-to-pdf` entry):

```markdown
| `/pdf-to-image` | PDF to Image | Convert PDF pages to PNG, JPG, or WebP images with DPI control |
```

- [ ] **Step 2: Update AGENTS.md — Tool Categories**

In the Tool Categories table, find the Visual & Media row and add `pdf-to-image` to the Tools column (after `image-to-pdf`):

```markdown
| Visual & Media | `visual-media` | color, image-resize, image-compress, image-convert, image-watermark, image-crop, image-rotate, image-to-pdf, pdf-to-image, pdf-merge, pdf-split, pdf-compress, pdf-watermark |
```

- [ ] **Step 3: Update AGENTS.md — Business Logic table**

Add a row to the Business Logic table:

```markdown
| `pdf-to-image/` | PDF page rendering to image (renderPageToBlob, getPdfPageCount) |
```

- [ ] **Step 4: Update AGENTS.md — Configured test scopes**

In the Testing section's "Configured test scopes" list, add `pdf-to-image`:

```markdown
Configured test scopes (`vitest.config.ts`): `dbviewer`, `unixtime`, `cron`, `qrcode`, `textcase`, `color`, `regex`, `csv`, `numbase`, `deduplines`, `image`, `extractor`, `password`, `wordcounter`, `token-counter`, `sshkey`, `httpclient`, `wallet`, `cssunit`, `jsonts`, `subnet`, `sqlformat`, `pdf-to-image`.
```

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md
git commit -m "docs(pdf-to-image): update AGENTS.md with new tool"
```

---

### Task 11: Final Verification

- [ ] **Step 1: Run TypeScript type check**

Run: `npx tsc --noEmit --pretty 2>&1 | tail -5`
Expected: No errors

- [ ] **Step 2: Run tests**

Run: `npx vitest run --reporter=verbose 2>&1 | tail -20`
Expected: All existing tests pass, new pdf-to-image tests pass

- [ ] **Step 3: Run linter**

Run: `npx eslint app/\[locale\]/pdf-to-image/ libs/pdf-to-image/ --max-warnings=0 2>&1 | tail -10`
Expected: No errors or warnings

- [ ] **Step 4: Manual smoke test**

Run: `npm run dev`
Navigate to `http://localhost:3000/pdf-to-image` and verify:

1. Upload drop zone renders
2. Upload a PDF → thumbnails generate, all pages selected by default
3. DPI presets and custom slider work
4. Format selector (PNG/JPG/WebP) toggles
5. Quality slider visible only for JPG/WebP
6. Select/Deselect all works
7. Convert button triggers rendering with progress bar
8. Results page shows per-page cards with download buttons
9. ZIP download works
10. Start Over resets state

- [ ] **Step 5: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix(pdf-to-image): address verification findings"
```
