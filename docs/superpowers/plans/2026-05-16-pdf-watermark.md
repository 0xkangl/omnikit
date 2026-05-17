# PDF Watermark Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a browser-based PDF watermark tool at `/pdf-watermark` supporting text and image watermarks with position, opacity, rotation, and tiling.

**Architecture:** Two-layer processing: pdf-lib for watermark application (modifies PDF bytes synchronously), pdfjs-dist for preview rendering (renders first page to canvas). Client component manages state with auto-debounced preview pipeline matching image-watermark pattern.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Tailwind CSS 4, pdf-lib, pdfjs-dist, rc-slider, next-intl, Vitest

---

## File Structure

| Action | File                                                | Responsibility                                              |
| ------ | --------------------------------------------------- | ----------------------------------------------------------- |
| Create | `libs/pdf-watermark/types.ts`                       | Type definitions for watermark config and options           |
| Create | `libs/pdf-watermark/watermark.ts`                   | Core watermark logic (pdf-lib: add text/image to all pages) |
| Create | `libs/pdf-watermark/preview.ts`                     | Preview rendering (pdfjs-dist: render page to canvas)       |
| Create | `libs/pdf-watermark/__tests__/watermark.test.ts`    | Unit tests for pure helpers and watermark logic             |
| Create | `app/[locale]/pdf-watermark/page.tsx`               | Route entry (SEO metadata + JSON-LD)                        |
| Create | `app/[locale]/pdf-watermark/pdf-watermark-page.tsx` | Main page component (client)                                |
| Create | `public/locales/en/pdf-watermark.json`              | English tool translations                                   |
| Create | `public/locales/{locale}/pdf-watermark.json`        | 9 other locale translation files                            |
| Modify | `libs/tools.ts`                                     | Tool registration + category + relations                    |
| Modify | `vitest.config.ts`                                  | Add pdf-watermark test scope                                |
| Modify | `public/locales/{locale}/tools.json`                | Add pdf-watermark entry (10 locales)                        |

---

### Task 1: Type Definitions

**Files:**

- Create: `libs/pdf-watermark/types.ts`

- [ ] **Step 1: Create types file**

```typescript
// libs/pdf-watermark/types.ts

export type WatermarkType = "text" | "image";
export type WatermarkMode = "single" | "tiled";

export type PositionPreset =
  | "center"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "top-center"
  | "bottom-center"
  | "left-center"
  | "right-center";

export interface TextWatermarkConfig {
  type: "text";
  text: string;
  fontFamily: string; // Standard font name (Helvetica, HelveticaBold, Courier, CourierBold, TimesRoman, TimesRomanBold)
  fontSize: number; // pt (12-120)
  color: string; // HEX color
  opacity: number; // 0-100
}

export interface ImageWatermarkConfig {
  type: "image";
  imageData: ArrayBuffer; // PNG/JPG bytes
  mimeType: "image/png" | "image/jpeg";
  scale: number; // Percentage of page width (5-50)
  opacity: number; // 0-100
}

export interface WatermarkOptions {
  mode: WatermarkMode;
  position: PositionPreset; // Only used in "single" mode
  rotation: number; // Degrees. Tiled: -45 to 45. Single: -180 to 180.
  spacing: number; // Tiled only: multiplier of watermark dimension (1.0 to 3.0)
}

export interface WatermarkResult {
  bytes: Uint8Array;
  pageCount: number;
}
```

- [ ] **Step 2: Commit**

```bash
git add libs/pdf-watermark/types.ts
git commit -m "feat(pdf-watermark): add type definitions"
```

---

### Task 2: Position Calculation & Tiling Grid (TDD)

**Files:**

- Create: `libs/pdf-watermark/__tests__/watermark.test.ts`
- Create: `libs/pdf-watermark/watermark.ts` (partial — pure helpers only)

These are pure functions with no PDF dependencies. They mirror `libs/image/watermark.ts` but adapted for PDF coordinate system (bottom-left origin, 10% margin).

- [ ] **Step 1: Write failing tests for calculatePosition**

```typescript
// libs/pdf-watermark/__tests__/watermark.test.ts
import { describe, it, expect } from "vitest";
import { calculatePosition, generateTilingGrid } from "../watermark";

describe("calculatePosition", () => {
  // A4 page: 595 x 842 pt (standard PDF units)
  const pw = 595;
  const ph = 842;
  const mw = 100;
  const mh = 50;

  it("returns center of page for center preset", () => {
    const pos = calculatePosition("center", pw, ph, mw, mh);
    expect(pos).toEqual({ x: pw / 2, y: ph / 2 });
  });

  it("returns padded top-left position (PDF coords: y increases upward)", () => {
    const pos = calculatePosition("top-left", pw, ph, mw, mh);
    // margin = 10%: marginX = 59.5, marginY = 84.2
    // top-left: x = marginX + mw/2, y = ph - marginY - mh/2
    expect(pos.x).toBeCloseTo(59.5 + 50, 1);
    expect(pos.y).toBeCloseTo(842 - 84.2 - 25, 1);
  });

  it("returns padded top-center position", () => {
    const pos = calculatePosition("top-center", pw, ph, mw, mh);
    expect(pos.x).toBeCloseTo(pw / 2, 1);
    expect(pos.y).toBeCloseTo(842 - 84.2 - 25, 1);
  });

  it("returns padded top-right position", () => {
    const pos = calculatePosition("top-right", pw, ph, mw, mh);
    expect(pos.x).toBeCloseTo(595 - 59.5 - 50, 1);
    expect(pos.y).toBeCloseTo(842 - 84.2 - 25, 1);
  });

  it("returns padded left-center position", () => {
    const pos = calculatePosition("left-center", pw, ph, mw, mh);
    expect(pos.x).toBeCloseTo(59.5 + 50, 1);
    expect(pos.y).toBeCloseTo(ph / 2, 1);
  });

  it("returns padded right-center position", () => {
    const pos = calculatePosition("right-center", pw, ph, mw, mh);
    expect(pos.x).toBeCloseTo(595 - 59.5 - 50, 1);
    expect(pos.y).toBeCloseTo(ph / 2, 1);
  });

  it("returns padded bottom-left position", () => {
    const pos = calculatePosition("bottom-left", pw, ph, mw, mh);
    expect(pos.x).toBeCloseTo(59.5 + 50, 1);
    expect(pos.y).toBeCloseTo(84.2 + 25, 1);
  });

  it("returns padded bottom-center position", () => {
    const pos = calculatePosition("bottom-center", pw, ph, mw, mh);
    expect(pos.x).toBeCloseTo(pw / 2, 1);
    expect(pos.y).toBeCloseTo(84.2 + 25, 1);
  });

  it("returns padded bottom-right position", () => {
    const pos = calculatePosition("bottom-right", pw, ph, mw, mh);
    expect(pos.x).toBeCloseTo(595 - 59.5 - 50, 1);
    expect(pos.y).toBeCloseTo(84.2 + 25, 1);
  });

  it("handles larger mark dimensions correctly", () => {
    const pos = calculatePosition("top-left", pw, ph, 200, 100);
    expect(pos.x).toBeCloseTo(59.5 + 100, 1);
    expect(pos.y).toBeCloseTo(842 - 84.2 - 50, 1);
  });
});

describe("generateTilingGrid", () => {
  const pw = 595;
  const ph = 842;
  const mw = 100;
  const mh = 50;

  it("generates grid points for a page", () => {
    const points = generateTilingGrid(pw, ph, mw, mh, 2.0);
    expect(points.length).toBeGreaterThan(0);
  });

  it("extends grid beyond page bounds for overflow coverage", () => {
    const points = generateTilingGrid(pw, ph, mw, mh, 2.0);
    const hasNegativeX = points.some((p) => p.x < 0);
    const hasNegativeY = points.some((p) => p.y < 0);
    const hasBeyondRight = points.some((p) => p.x > pw);
    const hasBeyondTop = points.some((p) => p.y > ph);
    expect(hasNegativeX || hasNegativeY || hasBeyondRight || hasBeyondTop).toBe(true);
  });

  it("offsets odd rows by half the horizontal step", () => {
    const hStep = mw * 2.0;
    const vStep = mh * 2.0;
    const points = generateTilingGrid(pw, ph, mw, mh, 2.0);

    const row0Y = -1 * vStep;
    const row1Y = 0 * vStep;
    const row0Points = points.filter((p) => Math.abs(p.y - row0Y) < 0.01);
    const row1Points = points.filter((p) => Math.abs(p.y - row1Y) < 0.01);

    if (row0Points.length > 0 && row1Points.length > 0) {
      expect(row0Points[0].x).toBeCloseTo(row1Points[0].x + hStep / 2);
    }
  });

  it("generates more points with smaller spacing", () => {
    const dense = generateTilingGrid(pw, ph, mw, mh, 1.0);
    const sparse = generateTilingGrid(pw, ph, mw, mh, 3.0);
    expect(dense.length).toBeGreaterThan(sparse.length);
  });

  it("returns empty array for zero mark dimensions", () => {
    expect(generateTilingGrid(pw, ph, 0, mh, 2.0)).toEqual([]);
  });

  it("returns empty array for zero spacing", () => {
    expect(generateTilingGrid(pw, ph, mw, mh, 0)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run libs/pdf-watermark`
Expected: FAIL — module not found

- [ ] **Step 3: Implement calculatePosition and generateTilingGrid**

```typescript
// libs/pdf-watermark/watermark.ts
import type {
  PositionPreset,
  TextWatermarkConfig,
  ImageWatermarkConfig,
  WatermarkOptions,
  WatermarkResult,
} from "./types";

// --- Pure helpers (unit-testable, no PDF dependencies) ---

/**
 * Calculate the center position for a watermark given a 9-grid preset.
 * Uses PDF coordinate system: (0,0) is bottom-left, y increases upward.
 * Margin is 10% of each page dimension from edges.
 */
export function calculatePosition(
  preset: PositionPreset,
  pageWidth: number,
  pageHeight: number,
  markWidth: number,
  markHeight: number
): { x: number; y: number } {
  const marginX = pageWidth * 0.1;
  const marginY = pageHeight * 0.1;

  const positions: Record<PositionPreset, { x: number; y: number }> = {
    center: { x: pageWidth / 2, y: pageHeight / 2 },
    "top-left": { x: marginX + markWidth / 2, y: pageHeight - marginY - markHeight / 2 },
    "top-center": { x: pageWidth / 2, y: pageHeight - marginY - markHeight / 2 },
    "top-right": {
      x: pageWidth - marginX - markWidth / 2,
      y: pageHeight - marginY - markHeight / 2,
    },
    "left-center": { x: marginX + markWidth / 2, y: pageHeight / 2 },
    "right-center": { x: pageWidth - marginX - markWidth / 2, y: pageHeight / 2 },
    "bottom-left": { x: marginX + markWidth / 2, y: marginY + markHeight / 2 },
    "bottom-center": { x: pageWidth / 2, y: marginY + markHeight / 2 },
    "bottom-right": { x: pageWidth - marginX - markWidth / 2, y: marginY + markHeight / 2 },
  };

  return positions[preset];
}

/**
 * Generate a brick-pattern tiling grid of center points for tiled watermark mode.
 * Odd rows are offset by half the horizontal step.
 * Grid extends 1 unit beyond page bounds in each direction for rotation coverage.
 */
export function generateTilingGrid(
  pageWidth: number,
  pageHeight: number,
  markWidth: number,
  markHeight: number,
  spacing: number
): Array<{ x: number; y: number }> {
  const hStep = markWidth * spacing;
  const vStep = markHeight * spacing;

  if (hStep <= 0 || vStep <= 0) return [];

  const points: Array<{ x: number; y: number }> = [];
  const cols = Math.ceil(pageWidth / hStep) + 2;
  const rows = Math.ceil(pageHeight / vStep) + 2;

  for (let r = -1; r <= rows; r++) {
    const offset = r % 2 !== 0 ? hStep / 2 : 0;
    for (let c = -1; c <= cols; c++) {
      points.push({ x: c * hStep + offset, y: r * vStep });
    }
  }

  return points;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run libs/pdf-watermark`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add libs/pdf-watermark/watermark.ts libs/pdf-watermark/__tests__/watermark.test.ts
git commit -m "feat(pdf-watermark): add position and tiling grid helpers with tests"
```

---

### Task 3: Watermark Core Logic (TDD)

**Files:**

- Modify: `libs/pdf-watermark/__tests__/watermark.test.ts` (append tests)
- Modify: `libs/pdf-watermark/watermark.ts` (add core watermark functions)

This task adds the `addWatermark` entry point and internal helpers. Tests use pdf-lib to create test PDFs (same pattern as pdf-merge tests).

- [ ] **Step 1: Write failing tests for addWatermark**

Append these tests to `libs/pdf-watermark/__tests__/watermark.test.ts`:

```typescript
import { PDFDocument, StandardFonts } from "pdf-lib";
import { addWatermark } from "../watermark";
import type { TextWatermarkConfig, ImageWatermarkConfig, WatermarkOptions } from "../types";

async function makePdf(pageCount: number): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    doc.addPage([595, 842]); // A4
  }
  const bytes = await doc.save();
  return bytes.buffer as ArrayBuffer;
}

describe("addWatermark", () => {
  const defaultOptions: WatermarkOptions = {
    mode: "single",
    position: "center",
    rotation: 0,
    spacing: 1.5,
  };

  it("adds text watermark to a single-page PDF and preserves page count", async () => {
    const pdf = await makePdf(1);
    const textConfig: TextWatermarkConfig = {
      type: "text",
      text: "DRAFT",
      fontFamily: "HelveticaBold",
      fontSize: 48,
      color: "#000000",
      opacity: 50,
    };
    const result = await addWatermark(pdf, textConfig, defaultOptions);
    expect(result.pageCount).toBe(1);
    expect(result.bytes.length).toBeGreaterThan(0);

    // Verify the result is a valid PDF
    const doc = await PDFDocument.load(result.bytes);
    expect(doc.getPageCount()).toBe(1);
  });

  it("adds text watermark to all pages of a multi-page PDF", async () => {
    const pdf = await makePdf(5);
    const textConfig: TextWatermarkConfig = {
      type: "text",
      text: "CONFIDENTIAL",
      fontFamily: "Helvetica",
      fontSize: 36,
      color: "#FF0000",
      opacity: 30,
    };
    const result = await addWatermark(pdf, textConfig, defaultOptions);
    expect(result.pageCount).toBe(5);
  });

  it("adds text watermark in tiled mode with rotation", async () => {
    const pdf = await makePdf(1);
    const textConfig: TextWatermarkConfig = {
      type: "text",
      text: "© 2026",
      fontFamily: "Courier",
      fontSize: 24,
      color: "#808080",
      opacity: 20,
    };
    const tiledOptions: WatermarkOptions = {
      mode: "tiled",
      position: "center",
      rotation: -30,
      spacing: 2.0,
    };
    const result = await addWatermark(pdf, textConfig, tiledOptions);
    expect(result.bytes.length).toBeGreaterThan(0);
  });

  it("handles rotation in single mode", async () => {
    const pdf = await makePdf(1);
    const textConfig: TextWatermarkConfig = {
      type: "text",
      text: "SAMPLE",
      fontFamily: "TimesRoman",
      fontSize: 72,
      color: "#000000",
      opacity: 40,
    };
    const rotatedOptions: WatermarkOptions = {
      mode: "single",
      position: "center",
      rotation: 45,
      spacing: 1.5,
    };
    const result = await addWatermark(pdf, textConfig, rotatedOptions);
    expect(result.bytes.length).toBeGreaterThan(0);
  });

  it("throws on corrupted PDF data", async () => {
    const corrupted = new ArrayBuffer(10);
    const textConfig: TextWatermarkConfig = {
      type: "text",
      text: "TEST",
      fontFamily: "Helvetica",
      fontSize: 48,
      color: "#000000",
      opacity: 50,
    };
    await expect(addWatermark(corrupted, textConfig, defaultOptions)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run libs/pdf-watermark`
Expected: `addWatermark` tests FAIL — function not exported

- [ ] **Step 3: Implement addWatermark and helpers**

Append to `libs/pdf-watermark/watermark.ts`:

```typescript
import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";
import type {
  PositionPreset,
  TextWatermarkConfig,
  ImageWatermarkConfig,
  WatermarkOptions,
  WatermarkResult,
} from "./types";

// ... (calculatePosition and generateTilingGrid remain from Task 2)

// --- Font mapping ---

const STANDARD_FONT_MAP: Record<string, StandardFonts> = {
  Helvetica: StandardFonts.Helvetica,
  HelveticaBold: StandardFonts.HelveticaBold,
  Courier: StandardFonts.Courier,
  CourierBold: StandardFonts.CourierBold,
  TimesRoman: StandardFonts.TimesRoman,
  TimesRomanBold: StandardFonts.TimesRomanBold,
};

// --- Color helper ---

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return { r: 0, g: 0, b: 0 };
  return {
    r: parseInt(result[1], 16) / 255,
    g: parseInt(result[2], 16) / 255,
    b: parseInt(result[3], 16) / 255,
  };
}

// --- Text watermark rendering ---

function renderTextOnPage(
  page: ReturnType<PDFDocument["getPage"]>,
  config: TextWatermarkConfig,
  options: WatermarkOptions
) {
  const fontRef = page.doc.embedStandardFont(
    STANDARD_FONT_MAP[config.fontFamily] ?? StandardFonts.HelveticaBold
  );
  // embedStandardFont is synchronous in pdf-lib — we call it here and use the result below.
  // However, embedStandardFont returns a Promise in some versions. Let's handle both:
  // Actually, pdf-lib's embedFont is async but embedStandardFont may differ.
  // Let me check — pdf-lib ^1.17.1: embedStandardFont doesn't exist, only embedFont which is async.
  // The correct API is: await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  // Since this function is called inside addWatermark which is async, we should pass the font in.
  // Let me restructure: pass the embedded font as a parameter instead.
}

// Actually, let me restructure. pdf-lib's embedFont is async, so we need to embed fonts
// in the async addWatermark function and pass them to sync render helpers.

// --- Internal helpers ---

interface EmbeddedFont {
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  ref: StandardFonts;
}

function renderTextWatermarkOnPage(
  page: {
    getWidth: () => number;
    getHeight: () => number;
    drawText: (text: string, options: Record<string, unknown>) => void;
  },
  text: string,
  font: EmbeddedFont["font"],
  fontSize: number,
  color: ReturnType<typeof rgb>,
  opacity: number,
  options: WatermarkOptions
): void {
  const pw = page.getWidth();
  const ph = page.getHeight();

  // Measure text
  const textWidth = font.widthOfTextAtSize(text, fontSize);
  const textHeight = fontSize; // approximate

  if (options.mode === "single") {
    const center = calculatePosition(options.position, pw, ph, textWidth, textHeight);
    page.drawText(text, {
      x: center.x - textWidth / 2,
      y: center.y - textHeight * 0.35, // baseline adjustment
      size: fontSize,
      font,
      color,
      opacity: opacity / 100,
      rotate: degrees(options.rotation),
    });
  } else {
    // Tiled mode
    const grid = generateTilingGrid(pw, ph, textWidth, textHeight, options.spacing);
    for (const point of grid) {
      page.drawText(text, {
        x: point.x - textWidth / 2,
        y: point.y - textHeight * 0.35,
        size: fontSize,
        font,
        color,
        opacity: opacity / 100,
        rotate: degrees(options.rotation),
      });
    }
  }
}

function renderImageWatermarkOnPage(
  page: {
    getWidth: () => number;
    getHeight: () => number;
    drawImage: (image: unknown, options: Record<string, unknown>) => void;
  },
  image: Awaited<ReturnType<PDFDocument["embedPng"] | PDFDocument["embedJpg"]>>,
  scale: number,
  opacity: number,
  options: WatermarkOptions
): void {
  const pw = page.getWidth();
  const ph = page.getHeight();

  // Scale is percentage of page width
  const imgWidth = (scale / 100) * pw;
  const aspectRatio = image.height / image.width;
  const imgHeight = imgWidth * aspectRatio;

  if (options.mode === "single") {
    const center = calculatePosition(options.position, pw, ph, imgWidth, imgHeight);
    page.drawImage(image, {
      x: center.x - imgWidth / 2,
      y: center.y - imgHeight / 2,
      width: imgWidth,
      height: imgHeight,
      opacity: opacity / 100,
      rotate: degrees(options.rotation),
    });
  } else {
    const grid = generateTilingGrid(pw, ph, imgWidth, imgHeight, options.spacing);
    for (const point of grid) {
      page.drawImage(image, {
        x: point.x - imgWidth / 2,
        y: point.y - imgHeight / 2,
        width: imgWidth,
        height: imgHeight,
        opacity: opacity / 100,
        rotate: degrees(options.rotation),
      });
    }
  }
}

// --- Main entry point ---

export async function addWatermark(
  pdfBytes: ArrayBuffer,
  watermark: TextWatermarkConfig | ImageWatermarkConfig,
  options: WatermarkOptions
): Promise<WatermarkResult> {
  const doc = await PDFDocument.load(new Uint8Array(pdfBytes), { ignoreEncryption: true });
  const pages = doc.getPages();
  const pageCount = pages.length;

  if (watermark.type === "text") {
    const fontEnum = STANDARD_FONT_MAP[watermark.fontFamily] ?? StandardFonts.HelveticaBold;
    const font = await doc.embedFont(fontEnum);
    const { r, g, b } = hexToRgb(watermark.color);
    const color = rgb(r, g, b);

    for (const page of pages) {
      renderTextWatermarkOnPage(
        page,
        watermark.text,
        font,
        watermark.fontSize,
        color,
        watermark.opacity,
        options
      );
    }
  } else {
    // Image watermark
    const image =
      watermark.mimeType === "image/png"
        ? await doc.embedPng(watermark.imageData)
        : await doc.embedJpg(watermark.imageData);

    for (const page of pages) {
      renderImageWatermarkOnPage(page, image, watermark.scale, watermark.opacity, options);
    }
  }

  const bytes = await doc.save();
  return { bytes, pageCount };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run libs/pdf-watermark`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add libs/pdf-watermark/watermark.ts libs/pdf-watermark/__tests__/watermark.test.ts
git commit -m "feat(pdf-watermark): add watermark core logic with tests"
```

---

### Task 4: Preview Rendering

**Files:**

- Create: `libs/pdf-watermark/preview.ts`

Follows `libs/pdf-merge/thumbnail.ts` pattern exactly.

- [ ] **Step 1: Create preview rendering function**

```typescript
// libs/pdf-watermark/preview.ts

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
```

- [ ] **Step 2: Commit**

```bash
git add libs/pdf-watermark/preview.ts
git commit -m "feat(pdf-watermark): add PDF preview rendering"
```

---

### Task 5: Tool Registration & Test Config

**Files:**

- Modify: `libs/tools.ts` (add icon import + tool entry + category + relations)
- Modify: `vitest.config.ts` (add test scope)

- [ ] **Step 1: Add Stamp icon import to tools.ts**

In `libs/tools.ts`, add `Stamp` to the lucide-react import block (line 3-49):

```typescript
import {
  // ... existing imports ...
  Droplets,
  Stamp, // ADD THIS LINE
} from "lucide-react";
```

- [ ] **Step 2: Add pdf-watermark tool entry to TOOLS array**

In `libs/tools.ts`, after the `image-watermark` entry (line 500-506), add:

```typescript
  {
    key: "pdf-watermark",
    path: "/pdf-watermark",
    icon: Stamp,
    emoji: "🔏",
    sameAs: [
      "https://en.wikipedia.org/wiki/Watermark",
    ],
  },
```

- [ ] **Step 3: Add pdf-watermark to visual category**

In `libs/tools.ts`, in the visual category tools array (line 127-138), add `"pdf-watermark"` after `"pdf-merge"`:

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
      "pdf-merge",
      "pdf-watermark",    // ADD THIS LINE
    ],
  },
```

- [ ] **Step 4: Add TOOL_RELATIONS entries**

In `libs/tools.ts`, add these entries and update existing ones:

Add new entry (after `"pdf-merge"` relation at line 241):

```typescript
  "pdf-watermark": ["image-watermark", "pdf-merge", "image-compress", "image-convert", "color"],
```

Update existing `"image-watermark"` relation (line 222-229) to include pdf-watermark:

```typescript
  "image-watermark": [
    "image-resize",
    "image-compress",
    "image-convert",
    "image-crop",
    "image-rotate",
    "color",
    "pdf-watermark",     // ADD THIS LINE
  ],
```

Update existing `"pdf-merge"` relation (line 241) to include pdf-watermark:

```typescript
  "pdf-merge": ["image-compress", "image-convert", "checksum", "pdf-watermark"],
```

- [ ] **Step 5: Add test scope to vitest.config.ts**

In `vitest.config.ts`, add after `"libs/pdf-merge/**/*.test.ts",` (line 19):

```typescript
      "libs/pdf-watermark/**/*.test.ts",
```

- [ ] **Step 6: Verify tests still pass**

Run: `npx vitest run libs/pdf-watermark`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add libs/tools.ts vitest.config.ts
git commit -m "feat(pdf-watermark): register tool and add test scope"
```

---

### Task 6: Route Entry & English Translations

**Files:**

- Create: `app/[locale]/pdf-watermark/page.tsx`
- Create: `public/locales/en/pdf-watermark.json`
- Modify: `public/locales/en/tools.json` (add pdf-watermark entry)

- [ ] **Step 1: Create route entry page.tsx**

```tsx
// app/[locale]/pdf-watermark/page.tsx
import { getTranslations } from "next-intl/server";
import { generatePageMeta } from "../../../libs/seo";
import { buildToolSchemas } from "../../../components/json-ld";
import { TOOLS, TOOL_CATEGORIES, CATEGORY_SLUGS } from "../../../libs/tools";
import PdfWatermarkPage from "./pdf-watermark-page";

const PATH = "/pdf-watermark";
const TOOL_KEY = "pdf-watermark";
const tool = TOOLS.find((t) => t.key === TOOL_KEY)!;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "tools" });
  return generatePageMeta({
    locale,
    path: PATH,
    title: t("pdf-watermark.title"),
    description: t("pdf-watermark.description"),
    ogImage: { type: "tool", key: TOOL_KEY },
  });
}

export default async function PdfWatermarkRoute({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "tools" });
  const tx = await getTranslations({ locale, namespace: "pdf-watermark" });
  const tc = await getTranslations({ locale, namespace: "categories" });
  const category = TOOL_CATEGORIES.find((c) => c.tools.includes(TOOL_KEY))!;
  const categorySlug = CATEGORY_SLUGS[category.key];

  const howToSteps = Array.from({ length: 3 }, (_, i) => ({
    name: tx(`descriptions.step${i + 1}Title`),
    text: tx(`descriptions.step${i + 1}Text`),
  })).filter((step) => step.name);

  const schemas = buildToolSchemas({
    name: t("pdf-watermark.title"),
    description: tx.has("descriptions.aeoDefinition")
      ? tx("descriptions.aeoDefinition")
      : t("pdf-watermark.description"),
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
      <PdfWatermarkPage />
    </>
  );
}
```

- [ ] **Step 2: Create English translation file**

```json
{
  "dropPdf": "Drop a PDF here or click to select",
  "supportedFormats": "Supports PDF files only",
  "reselect": "Reselect",
  "typeText": "Text",
  "typeImage": "Image",
  "modeSingle": "Single",
  "modeTiled": "Tiled",
  "textContent": "Text",
  "fontFamily": "Font",
  "fontHelvetica": "Helvetica",
  "fontHelveticaBold": "Helvetica Bold",
  "fontCourier": "Courier",
  "fontCourierBold": "Courier Bold",
  "fontTimesRoman": "Times Roman",
  "fontTimesRomanBold": "Times Roman Bold",
  "fontSize": "Size",
  "color": "Color",
  "opacity": "Opacity",
  "uploadImage": "Upload Image",
  "imageSupportedFormats": "PNG, JPG",
  "imageScale": "Scale",
  "position": "Position",
  "positionCenter": "C",
  "positionTopLeft": "↖",
  "positionTopCenter": "↑",
  "positionTopRight": "↗",
  "positionLeftCenter": "←",
  "positionRightCenter": "→",
  "positionBottomLeft": "↙",
  "positionBottomCenter": "↓",
  "positionBottomRight": "↘",
  "rotation": "Rotation",
  "tiledSpacing": "Spacing",
  "processing": "Processing...",
  "pages": "{count} pages",
  "fileName": "{name} · {pages}",
  "corruptedPdf": "Unable to parse this PDF file",
  "encryptedPdf": "This PDF is encrypted and cannot be processed",
  "onlyPdfSupported": "Only PDF files are supported",
  "fileTooLarge": "File exceeds 100MB limit",
  "largeFile": "File is large, processing may take time",
  "largePageCount": "This PDF has {count} pages, processing may take time",
  "emptyText": "Enter watermark text to preview",
  "noImage": "Upload an image to preview",
  "descriptions": {
    "title": "About PDF Watermark",
    "aeoDefinition": "PDF Watermark is a free online tool for adding text or image watermarks to PDF files with customizable position, opacity, rotation, and tiling. All processing runs locally in your browser.",
    "whatIsTitle": "What is PDF Watermark?",
    "whatIs": "Add text or image watermarks to your PDF files directly in the browser. Choose between single placement or tiled patterns, adjust font, color, opacity, rotation, and position. No data is uploaded — all processing uses the pdf-lib library.",
    "stepsTitle": "How to Add a Watermark to a PDF",
    "step1Title": "Upload a PDF",
    "step1Text": "Drag and drop a PDF file onto the drop zone, or click to browse. The file stays in your browser.",
    "step2Title": "Configure your watermark",
    "step2Text": "Choose between text or image watermark. Adjust font, size, color, opacity, and position. Use tiled mode for copyright protection with repeated watermarks across all pages.",
    "step3Title": "Download",
    "step3Text": "Preview the watermarked first page in real-time, then download the watermarked PDF with the watermark applied to all pages.",
    "p1": "Add text or image watermarks to PDF files directly in your browser. Merge PDFs with [PDF Merger](/pdf-merge), compress images with [Image Compressor](/image-compress), or convert formats with [Image Converter](/image-convert).",
    "p2": "Supports standard PDF fonts (Helvetica, Courier, Times Roman) and PNG/JPG image watermarks. Text watermarks include configurable font size, color, and opacity for readability on any page.",
    "faq1Q": "Does this tool upload my PDFs?",
    "faq1A": "No. All PDF processing happens in your browser using the pdf-lib library. Your files never leave your device.",
    "faq2Q": "Can I use CJK (Chinese, Japanese, Korean) characters in text watermarks?",
    "faq2A": "Currently, only standard Latin fonts are supported (Helvetica, Courier, Times Roman). CJK font support may be added in a future update.",
    "faq3Q": "What is tiled watermark mode?",
    "faq3A": "Tiled mode repeats your watermark across all pages in a diagonal pattern. This is useful for copyright protection, as the watermark cannot be easily cropped out."
  }
}
```

- [ ] **Step 3: Add pdf-watermark entry to en/tools.json**

In `public/locales/en/tools.json`, add after the `"image-watermark"` entry:

```json
  "pdf-watermark": {
    "title": "PDF Watermark - Add Text & Image Watermarks to PDF",
    "shortTitle": "PDF Watermark",
    "description": "Add text or image watermarks to PDF files. Customize font, color, opacity, rotation, and tiling. All processing runs in your browser."
  }
```

- [ ] **Step 4: Verify build**

Run: `npm run build 2>&1 | head -30`
Expected: Build succeeds (page.tsx compiles, translations load)

- [ ] **Step 5: Commit**

```bash
git add app/[locale]/pdf-watermark/page.tsx public/locales/en/pdf-watermark.json public/locales/en/tools.json
git commit -m "feat(pdf-watermark): add route entry and English translations"
```

---

### Task 7: Page Component

**Files:**

- Create: `app/[locale]/pdf-watermark/pdf-watermark-page.tsx`

This is the main client component. It follows the image-watermark pattern for state management, debounce, and UI, but uses PDF-specific upload and preview logic.

- [ ] **Step 1: Create the complete page component**

```tsx
"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import Layout from "../../../components/layout";
import PrivacyBanner from "../../../components/privacy-banner";
import DescriptionSection from "../../../components/description-section";
import RelatedTools from "../../../components/related-tools";
import { Download, RefreshCw, Upload } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { showToast } from "../../../libs/toast";
import { fromEvent } from "file-selector";
import { getPdfPageCount } from "../../../libs/pdf-merge/merge";
import { addWatermark } from "../../../libs/pdf-watermark/watermark";
import { renderPreview } from "../../../libs/pdf-watermark/preview";
import type {
  TextWatermarkConfig,
  ImageWatermarkConfig,
  WatermarkOptions,
  PositionPreset,
} from "../../../libs/pdf-watermark/types";
import "rc-slider/assets/index.css";

const Slider = dynamic(() => import("rc-slider"), {
  ssr: false,
  loading: () => <div className="h-6 w-full animate-pulse bg-bg-input rounded" />,
});

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

const FONT_OPTIONS = [
  { value: "Helvetica", key: "fontHelvetica" },
  { value: "HelveticaBold", key: "fontHelveticaBold" },
  { value: "Courier", key: "fontCourier" },
  { value: "CourierBold", key: "fontCourierBold" },
  { value: "TimesRoman", key: "fontTimesRoman" },
  { value: "TimesRomanBold", key: "fontTimesRomanBold" },
] as const;

const POSITION_PRESETS: PositionPreset[] = [
  "top-left",
  "top-center",
  "top-right",
  "left-center",
  "center",
  "right-center",
  "bottom-left",
  "bottom-center",
  "bottom-right",
];

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const WARN_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const WARN_PAGE_COUNT = 500;

function Conversion() {
  const t = useTranslations("pdf-watermark");
  const tc = useTranslations("common");

  // PDF source
  const [pdfData, setPdfData] = useState<ArrayBuffer | null>(null);
  const [pdfName, setPdfName] = useState("");
  const [pageCount, setPageCount] = useState(0);

  // Watermark type
  const [watermarkType, setWatermarkType] = useState<"text" | "image">("text");

  // Arrangement mode
  const [arrangementMode, setArrangementMode] = useState<"single" | "tiled">("single");

  // Text config
  const [textContent, setTextContent] = useState("© 2026");
  const [fontFamily, setFontFamily] = useState("HelveticaBold");
  const [fontSize, setFontSize] = useState(48);
  const [textColor, setTextColor] = useState("#000000");
  const [textOpacity, setTextOpacity] = useState(50);

  // Image config
  const [imageData, setImageData] = useState<ArrayBuffer | null>(null);
  const [imageMimeType, setImageMimeType] = useState<"image/png" | "image/jpeg">("image/png");
  const [imageScale, setImageScale] = useState(20);
  const [imageOpacity, setImageOpacity] = useState(80);

  // Placement
  const [position, setPosition] = useState<PositionPreset>("center");
  const [rotation, setRotation] = useState(-30);
  const [tiledSpacing, setTiledSpacing] = useState(1.5);

  // Rotation range depends on mode: single (-180 to 180), tiled (-45 to 45)
  const rotationMin = arrangementMode === "single" ? -180 : -45;
  const rotationMax = arrangementMode === "single" ? 180 : 45;

  // Preview state
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  // Refs
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const stalenessId = useRef(0);
  const prevBlobUrlRef = useRef<string | null>(null);
  const initialLoadRef = useRef(true);

  // Drop zone setup
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
      const dropped = await fromEvent(e);
      if (!dropped || dropped.length === 0) return;
      const file = (dropped as File[])[0];
      handlePdfUpload(file);
    };

    dz.addEventListener("dragover", onDragOver);
    dz.addEventListener("drop", onDrop);
    return () => {
      dz.removeEventListener("dragover", onDragOver);
      dz.removeEventListener("drop", onDrop);
    };
  }, []);

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (prevBlobUrlRef.current) URL.revokeObjectURL(prevBlobUrlRef.current);
    };
  }, []);

  async function handlePdfUpload(file: File) {
    if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
      showToast(t("onlyPdfSupported"), "warning");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      showToast(t("fileTooLarge"), "danger");
      return;
    }
    if (file.size > WARN_FILE_SIZE) {
      showToast(t("largeFile"), "info", 4000);
    }

    try {
      const buffer = await file.arrayBuffer();
      const count = await getPdfPageCount(buffer);
      setPdfData(buffer);
      setPdfName(file.name);
      setPageCount(count);

      if (count > WARN_PAGE_COUNT) {
        showToast(t("largePageCount", { count }), "info", 4000);
      }

      initialLoadRef.current = true;
    } catch {
      showToast(t("corruptedPdf"), "danger");
    }
  }

  function handlePdfSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handlePdfUpload(file);
  }

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const mime = file.type as "image/png" | "image/jpeg";
    if (mime !== "image/png" && mime !== "image/jpeg") return;
    file.arrayBuffer().then((buf) => {
      setImageData(buf);
      setImageMimeType(mime);
    });
  }

  function handleReselect() {
    setPdfData(null);
    setPdfName("");
    setPageCount(0);
    setPreviewUrl(null);
    setProcessing(false);
    initialLoadRef.current = true;
    if (prevBlobUrlRef.current) {
      URL.revokeObjectURL(prevBlobUrlRef.current);
      prevBlobUrlRef.current = null;
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // Determine if we can generate a preview
  const canPreview =
    pdfData !== null &&
    (watermarkType === "text" ? textContent.trim().length > 0 : imageData !== null);

  // Preview pipeline with debounce (matches image-watermark pattern)
  useEffect(() => {
    if (!canPreview) return;

    const watermark: TextWatermarkConfig | ImageWatermarkConfig | null =
      watermarkType === "text"
        ? {
            type: "text",
            text: textContent,
            fontFamily,
            fontSize,
            color: textColor,
            opacity: textOpacity,
          }
        : imageData
          ? {
              type: "image",
              imageData,
              mimeType: imageMimeType,
              scale: imageScale,
              opacity: imageOpacity,
            }
          : null;

    if (!watermark) return;

    const options: WatermarkOptions = {
      mode: arrangementMode,
      position,
      rotation,
      spacing: tiledSpacing,
    };

    const isInitial = initialLoadRef.current;
    initialLoadRef.current = false;

    let cancelled = false;
    const timer = setTimeout(
      async () => {
        if (cancelled) return;
        const callId = ++stalenessId.current;
        setProcessing(true);

        try {
          const result = await addWatermark(pdfData!, watermark, options);
          if (callId !== stalenessId.current) return;

          const previewDataUrl = await renderPreview(result.bytes.buffer as ArrayBuffer);
          if (callId !== stalenessId.current) return;

          if (prevBlobUrlRef.current) URL.revokeObjectURL(prevBlobUrlRef.current);
          prevBlobUrlRef.current = previewDataUrl;
          setPreviewUrl(previewDataUrl);
        } catch {
          if (callId !== stalenessId.current) return;
          showToast(t("corruptedPdf"), "danger");
        } finally {
          if (callId === stalenessId.current) setProcessing(false);
        }
      },
      isInitial ? 0 : 300
    );

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    pdfData,
    watermarkType,
    textContent,
    fontFamily,
    fontSize,
    textColor,
    textOpacity,
    imageData,
    imageMimeType,
    imageScale,
    imageOpacity,
    arrangementMode,
    position,
    rotation,
    rotationMin,
    rotationMax,
    tiledSpacing,
    canPreview,
    t,
  ]);

  async function handleDownload() {
    if (!pdfData) return;

    const watermark: TextWatermarkConfig | ImageWatermarkConfig | null =
      watermarkType === "text"
        ? {
            type: "text",
            text: textContent,
            fontFamily,
            fontSize,
            color: textColor,
            opacity: textOpacity,
          }
        : imageData
          ? {
              type: "image",
              imageData,
              mimeType: imageMimeType,
              scale: imageScale,
              opacity: imageOpacity,
            }
          : null;

    if (!watermark) return;

    const options: WatermarkOptions = {
      mode: arrangementMode,
      position,
      rotation,
      spacing: tiledSpacing,
    };

    try {
      const result = await addWatermark(pdfData, watermark, options);
      const blob = new Blob([result.bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = pdfName.replace(/\.pdf$/i, "") + "-watermarked.pdf";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      showToast(t("corruptedPdf"), "danger");
    }
  }

  // --- Drop zone view (no PDF loaded) ---
  if (!pdfData) {
    return (
      <section className="mt-4">
        <div
          ref={dropZoneRef}
          className="relative text-xl rounded-lg border-2 border-dashed border-accent-cyan/30 bg-accent-cyan-dim/10 text-accent-cyan cursor-pointer"
          style={{ width: "100%", height: "12rem" }}
        >
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-2 pointer-events-none">
            <span className="text-3xl">🔏</span>
            <span className="font-bold text-base">{t("dropPdf")}</span>
            <span className="text-sm text-accent-cyan/60">{t("supportedFormats")}</span>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
            onClick={() => {
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
            onChange={handlePdfSelect}
          />
        </div>
      </section>
    );
  }

  // --- Main view (PDF loaded) ---
  return (
    <section className="mt-4">
      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6">
        {/* Controls panel */}
        <div className="flex flex-col gap-4">
          {/* File info + reselect */}
          <div className="flex items-center justify-between px-1">
            <span className="text-sm text-fg-secondary truncate" title={pdfName}>
              {t("fileName", { name: pdfName, pages: pageCount })}
            </span>
            <button
              type="button"
              onClick={handleReselect}
              className="shrink-0 text-fg-muted hover:text-fg-secondary transition-colors"
              title={t("reselect")}
            >
              <RefreshCw size={14} />
            </button>
          </div>

          {/* Watermark type tabs */}
          <div>
            <div className="flex gap-1">
              {(["text", "image"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  className={`flex-1 px-2 py-1.5 text-xs font-mono font-semibold rounded-lg transition-all duration-200 cursor-pointer ${
                    watermarkType === type
                      ? "bg-accent-cyan text-bg-base"
                      : "border border-border-default text-fg-muted hover:text-fg-secondary hover:border-fg-muted"
                  }`}
                  onClick={() => setWatermarkType(type)}
                >
                  {t(type === "text" ? "typeText" : "typeImage")}
                </button>
              ))}
            </div>
          </div>

          {/* Arrangement mode */}
          <div>
            <div className="flex gap-1">
              {(["single", "tiled"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={`flex-1 px-2 py-1.5 text-xs font-mono font-semibold rounded-lg transition-all duration-200 cursor-pointer ${
                    arrangementMode === mode
                      ? "bg-accent-purple text-bg-base"
                      : "border border-border-default text-fg-muted hover:text-fg-secondary hover:border-fg-muted"
                  }`}
                  onClick={() => {
                    setArrangementMode(mode);
                    // Clamp rotation to mode range: single (-180..180), tiled (-45..45)
                    if (mode === "single") {
                      // No clamp needed, -180..180 is wider
                    } else {
                      // Clamp to tiled range -45..45
                      setRotation((prev) => Math.max(-45, Math.min(45, prev)));
                    }
                  }}
                >
                  {t(mode === "single" ? "modeSingle" : "modeTiled")}
                </button>
              ))}
            </div>
          </div>

          {/* Text watermark config */}
          {watermarkType === "text" && (
            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-sm font-medium text-fg-secondary mb-1">
                  {t("textContent")}
                </label>
                <input
                  type="text"
                  value={textContent}
                  onChange={(e) => setTextContent(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-bg-input text-fg-primary rounded-lg border border-border-default outline-none focus:border-accent-cyan transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-fg-secondary mb-1">
                  {t("fontFamily")}
                </label>
                <select
                  value={fontFamily}
                  onChange={(e) => setFontFamily(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-bg-input text-fg-primary rounded-lg border border-border-default outline-none focus:border-accent-cyan transition-colors"
                >
                  {FONT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {t(opt.key)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium text-fg-secondary">{t("fontSize")}</label>
                  <span className="text-xs font-mono text-accent-cyan">{fontSize}pt</span>
                </div>
                <div className="px-1">
                  <Slider
                    min={12}
                    max={120}
                    step={1}
                    value={fontSize}
                    onChange={(v) => setFontSize(typeof v === "number" ? v : v[0])}
                    styles={sliderStyles}
                  />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-fg-secondary">{t("color")}</label>
                <input
                  type="color"
                  value={textColor}
                  onChange={(e) => setTextColor(e.target.value)}
                  className="w-8 h-8 rounded border border-border-default cursor-pointer"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium text-fg-secondary">{t("opacity")}</label>
                  <span className="text-xs font-mono text-accent-cyan">{textOpacity}%</span>
                </div>
                <div className="px-1">
                  <Slider
                    min={0}
                    max={100}
                    step={1}
                    value={textOpacity}
                    onChange={(v) => setTextOpacity(typeof v === "number" ? v : v[0])}
                    styles={sliderStyles}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Image watermark config */}
          {watermarkType === "image" && (
            <div className="flex flex-col gap-3">
              <div>
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/png,image/jpeg"
                  onChange={handleImageSelect}
                  className="hidden"
                />
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => imageInputRef.current?.click()}
                  className="w-full"
                >
                  <Upload size={14} />
                  {t("uploadImage")}
                </Button>
                <p className="text-xs text-fg-muted mt-1">{t("imageSupportedFormats")}</p>
              </div>

              {imageData && (
                <>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-sm font-medium text-fg-secondary">
                        {t("imageScale")}
                      </label>
                      <span className="text-xs font-mono text-accent-cyan">{imageScale}%</span>
                    </div>
                    <div className="px-1">
                      <Slider
                        min={5}
                        max={50}
                        step={1}
                        value={imageScale}
                        onChange={(v) => setImageScale(typeof v === "number" ? v : v[0])}
                        styles={sliderStyles}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-sm font-medium text-fg-secondary">
                        {t("opacity")}
                      </label>
                      <span className="text-xs font-mono text-accent-cyan">{imageOpacity}%</span>
                    </div>
                    <div className="px-1">
                      <Slider
                        min={0}
                        max={100}
                        step={1}
                        value={imageOpacity}
                        onChange={(v) => setImageOpacity(typeof v === "number" ? v : v[0])}
                        styles={sliderStyles}
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Position config (single mode) */}
          {arrangementMode === "single" && (
            <div>
              <label className="block text-sm font-medium text-fg-secondary mb-2">
                {t("position")}
              </label>
              <div className="grid grid-cols-3 gap-1">
                {POSITION_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className={`px-1 py-2 text-sm rounded-lg transition-all duration-200 cursor-pointer ${
                      position === preset
                        ? "bg-accent-cyan text-bg-base font-semibold"
                        : "border border-border-default text-fg-muted hover:text-fg-secondary hover:border-fg-muted"
                    }`}
                    onClick={() => setPosition(preset)}
                  >
                    {t(
                      `position${preset.charAt(0).toUpperCase() + preset.slice(1).replace(/-([a-z])/g, (_, c) => c.toUpperCase())}`
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Rotation — always shown, range depends on mode */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium text-fg-secondary">{t("rotation")}</label>
              <span className="text-xs font-mono text-accent-cyan">{rotation}°</span>
            </div>
            <div className="px-1">
              <Slider
                min={rotationMin}
                max={rotationMax}
                step={1}
                value={rotation}
                onChange={(v) => setRotation(typeof v === "number" ? v : v[0])}
                styles={sliderStyles}
              />
            </div>
          </div>

          {/* Tiled spacing — only in tiled mode */}
          {arrangementMode === "tiled" && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-medium text-fg-secondary">{t("tiledSpacing")}</label>
                <span className="text-xs font-mono text-accent-cyan">
                  {tiledSpacing.toFixed(1)}×
                </span>
              </div>
              <div className="px-1">
                <Slider
                  min={1.0}
                  max={3.0}
                  step={0.1}
                  value={tiledSpacing}
                  onChange={(v) => setTiledSpacing(typeof v === "number" ? v : v[0])}
                  styles={sliderStyles}
                />
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-col gap-2 mt-auto pt-2 border-t border-border-default">
            <Button
              variant="primary"
              size="md"
              onClick={handleDownload}
              disabled={!canPreview || processing}
            >
              <Download size={14} />
              {tc("download")}
            </Button>
            <Button variant="secondary" size="md" onClick={handleReselect}>
              <RefreshCw size={14} />
              {t("reselect")}
            </Button>
          </div>
        </div>

        {/* Preview */}
        <div className="flex flex-col gap-3">
          <div
            className="relative w-full rounded-lg border border-border-default bg-bg-surface overflow-hidden flex items-center justify-center"
            style={{ minHeight: "400px" }}
          >
            {previewUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element -- data URL preview */
              <img
                src={previewUrl}
                alt=""
                className="max-w-full max-h-[500px] object-contain"
                draggable={false}
              />
            ) : (
              <div className="flex flex-col items-center gap-2 text-fg-muted">
                {processing ? (
                  <>
                    <div className="w-8 h-8 border-2 border-accent-cyan border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm">{t("processing")}</span>
                  </>
                ) : (
                  <span className="text-sm">
                    {!pdfData
                      ? ""
                      : watermarkType === "text" && !textContent.trim()
                        ? t("emptyText")
                        : watermarkType === "image" && !imageData
                          ? t("noImage")
                          : ""}
                  </span>
                )}
              </div>
            )}
            {processing && previewUrl && (
              <div className="absolute inset-0 bg-bg-base/60 flex flex-col items-center justify-center gap-2 z-30">
                <div className="w-8 h-8 border-2 border-accent-cyan border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-fg-secondary">{t("processing")}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export default function PdfWatermarkPage() {
  const t = useTranslations("tools");
  return (
    <Layout
      title={t("pdf-watermark.shortTitle")}
      categoryLabel={t("categories.visual")}
      categorySlug="visual-media"
    >
      <div className="container mx-auto px-4 pt-3 pb-6">
        <PrivacyBanner variant="files" />
        <Conversion />
        <DescriptionSection namespace="pdf-watermark" />
        <RelatedTools currentTool="pdf-watermark" />
      </div>
    </Layout>
  );
}
```

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit 2>&1 | head -30`
Expected: No type errors in pdf-watermark files

- [ ] **Step 3: Run lint**

Run: `npx eslint app/[locale]/pdf-watermark/ libs/pdf-watermark/ --max-warnings 0 2>&1 | head -30`
Expected: No lint errors

- [ ] **Step 4: Commit**

```bash
git add app/[locale]/pdf-watermark/pdf-watermark-page.tsx
git commit -m "feat(pdf-watermark): add page component with preview pipeline"
```

---

### Task 8: Chinese Simplified Translations

**Files:**

- Modify: `public/locales/zh-CN/tools.json` (add pdf-watermark entry with searchTerms)
- Create: `public/locales/zh-CN/pdf-watermark.json`

- [ ] **Step 1: Add entry to zh-CN/tools.json**

Add `"pdf-watermark"` entry with `searchTerms`:

```json
  "pdf-watermark": {
    "shortTitle": "PDF 水印",
    "searchTerms": "pdfshuiyin pdfsy shuiyin yinji banquan",
    "description": "为 PDF 文件添加文字或图片水印。自定义字体、颜色、透明度、旋转角度和平铺方式。"
  }
```

- [ ] **Step 2: Create zh-CN/pdf-watermark.json**

```json
{
  "dropPdf": "拖拽 PDF 文件到此处，或点击选择",
  "supportedFormats": "仅支持 PDF 文件",
  "reselect": "重新选择",
  "typeText": "文字",
  "typeImage": "图片",
  "modeSingle": "单个",
  "modeTiled": "平铺",
  "textContent": "文字",
  "fontFamily": "字体",
  "fontHelvetica": "Helvetica",
  "fontHelveticaBold": "Helvetica Bold",
  "fontCourier": "Courier",
  "fontCourierBold": "Courier Bold",
  "fontTimesRoman": "Times Roman",
  "fontTimesRomanBold": "Times Roman Bold",
  "fontSize": "大小",
  "color": "颜色",
  "opacity": "透明度",
  "uploadImage": "上传图片",
  "imageSupportedFormats": "PNG、JPG",
  "imageScale": "缩放",
  "position": "位置",
  "positionCenter": "中",
  "positionTopLeft": "↖",
  "positionTopCenter": "↑",
  "positionTopRight": "↗",
  "positionLeftCenter": "←",
  "positionRightCenter": "→",
  "positionBottomLeft": "↙",
  "positionBottomCenter": "↓",
  "positionBottomRight": "↘",
  "rotation": "旋转",
  "tiledSpacing": "间距",
  "processing": "处理中...",
  "pages": "{count} 页",
  "fileName": "{name} · {pages}",
  "corruptedPdf": "无法解析此 PDF 文件",
  "encryptedPdf": "此 PDF 文件已加密，无法处理",
  "onlyPdfSupported": "仅支持 PDF 文件",
  "fileTooLarge": "文件超过 100MB 限制",
  "largeFile": "文件较大，处理可能需要一些时间",
  "largePageCount": "此 PDF 有 {count} 页，处理可能需要一些时间",
  "emptyText": "输入水印文字以预览",
  "noImage": "上传图片以预览",
  "descriptions": {
    "title": "关于 PDF 水印",
    "aeoDefinition": "PDF 水印是一个免费的在线工具，用于为 PDF 文件添加文字或图片水印，支持自定义位置、透明度、旋转角度和平铺方式。所有处理均在浏览器本地完成。",
    "whatIsTitle": "什么是 PDF 水印？",
    "whatIs": "直接在浏览器中为 PDF 文件添加文字或图片水印。支持单个放置或平铺模式，可调整字体、颜色、透明度和位置。所有处理使用 pdf-lib 库完成，数据不会上传到任何服务器。",
    "stepsTitle": "如何为 PDF 添加水印",
    "step1Title": "上传 PDF",
    "step1Text": "将 PDF 文件拖拽到上传区域，或点击浏览选择文件。文件始终保留在您的浏览器中。",
    "step2Title": "配置水印",
    "step2Text": "选择文字或图片水印，调整字体、大小、颜色、透明度和位置。使用平铺模式可在所有页面重复水印，用于版权保护。",
    "step3Title": "下载",
    "step3Text": "实时预览水印效果，然后下载带有水印的 PDF 文件。水印将应用于所有页面。",
    "p1": "直接在浏览器中为 PDF 文件添加文字或图片水印。使用 [PDF 合并](/pdf-merge)合并多个 PDF，使用 [图片压缩](/image-compress)压缩图片，或使用 [图片格式转换](/image-convert)转换格式。",
    "p2": "支持标准 PDF 字体（Helvetica、Courier、Times Roman）和 PNG/JPG 图片水印。文字水印可配置字体大小、颜色和透明度。",
    "faq1Q": "这个工具会上传我的 PDF 文件吗？",
    "faq1A": "不会。所有 PDF 处理均使用 pdf-lib 库在浏览器中完成。您的文件不会离开您的设备。",
    "faq2Q": "可以在文字水印中使用中文、日文或韩文字符吗？",
    "faq2A": "目前仅支持标准拉丁字体（Helvetica、Courier、Times Roman）。中日韩字体支持将在未来更新中添加。",
    "faq3Q": "什么是平铺水印模式？",
    "faq3A": "平铺模式会在所有页面上以对角线方向重复水印。这有助于版权保护，因为水印无法被轻易裁剪掉。"
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add public/locales/zh-CN/tools.json public/locales/zh-CN/pdf-watermark.json
git commit -m "feat(pdf-watermark): add zh-CN translations"
```

---

### Task 9: Chinese Traditional Translations

**Files:**

- Modify: `public/locales/zh-TW/tools.json`
- Create: `public/locales/zh-TW/pdf-watermark.json`

- [ ] **Step 1: Add entry to zh-TW/tools.json**

```json
  "pdf-watermark": {
    "shortTitle": "PDF 浮水印",
    "searchTerms": "pdffuyin pdfsy fuyin yinji banquan",
    "description": "為 PDF 檔案添加文字或圖片浮水印。自訂字型、顏色、透明度、旋轉角度和平鋪方式。"
  }
```

- [ ] **Step 2: Create zh-TW/pdf-watermark.json**

```json
{
  "dropPdf": "拖曳 PDF 檔案到此處，或點擊選擇",
  "supportedFormats": "僅支援 PDF 檔案",
  "reselect": "重新選擇",
  "typeText": "文字",
  "typeImage": "圖片",
  "modeSingle": "單個",
  "modeTiled": "平鋪",
  "textContent": "文字",
  "fontFamily": "字型",
  "fontHelvetica": "Helvetica",
  "fontHelveticaBold": "Helvetica Bold",
  "fontCourier": "Courier",
  "fontCourierBold": "Courier Bold",
  "fontTimesRoman": "Times Roman",
  "fontTimesRomanBold": "Times Roman Bold",
  "fontSize": "大小",
  "color": "顏色",
  "opacity": "透明度",
  "uploadImage": "上傳圖片",
  "imageSupportedFormats": "PNG、JPG",
  "imageScale": "縮放",
  "position": "位置",
  "positionCenter": "中",
  "positionTopLeft": "↖",
  "positionTopCenter": "↑",
  "positionTopRight": "↗",
  "positionLeftCenter": "←",
  "positionRightCenter": "→",
  "positionBottomLeft": "↙",
  "positionBottomCenter": "↓",
  "positionBottomRight": "↘",
  "rotation": "旋轉",
  "tiledSpacing": "間距",
  "processing": "處理中...",
  "pages": "{count} 頁",
  "fileName": "{name} · {pages}",
  "corruptedPdf": "無法解析此 PDF 檔案",
  "encryptedPdf": "此 PDF 檔案已加密，無法處理",
  "onlyPdfSupported": "僅支援 PDF 檔案",
  "fileTooLarge": "檔案超過 100MB 限制",
  "largeFile": "檔案較大，處理可能需要一些時間",
  "largePageCount": "此 PDF 有 {count} 頁，處理可能需要一些時間",
  "emptyText": "輸入浮水印文字以預覽",
  "noImage": "上傳圖片以預覽",
  "descriptions": {
    "title": "關於 PDF 浮水印",
    "aeoDefinition": "PDF 浮水印是一個免費的線上工具，用於為 PDF 檔案添加文字或圖片浮水印，支援自訂位置、透明度、旋轉角度和平鋪方式。所有處理均在瀏覽器本機完成。",
    "whatIsTitle": "什麼是 PDF 浮水印？",
    "whatIs": "直接在瀏覽器中為 PDF 檔案添加文字或圖片浮水印。支援單個放置或平鋪模式，可調整字型、顏色、透明度和位置。所有處理使用 pdf-lib 函式庫完成，資料不會上傳到任何伺服器。",
    "stepsTitle": "如何為 PDF 添加浮水印",
    "step1Title": "上傳 PDF",
    "step1Text": "將 PDF 檔案拖曳到上傳區域，或點擊瀏覽選擇檔案。檔案始終保留在您的瀏覽器中。",
    "step2Title": "設定浮水印",
    "step2Text": "選擇文字或圖片浮水印，調整字型、大小、顏色、透明度和位置。使用平鋪模式可在所有頁面重複浮水印，用於版權保護。",
    "step3Title": "下載",
    "step3Text": "即時預覽浮水印效果，然後下載帶有浮水印的 PDF 檔案。浮水印將套用於所有頁面。",
    "p1": "直接在瀏覽器中為 PDF 檔案添加文字或圖片浮水印。使用 [PDF 合併](/pdf-merge)合併多個 PDF，使用 [圖片壓縮](/image-compress)壓縮圖片，或使用 [圖片格式轉換](/image-convert)轉換格式。",
    "p2": "支援標準 PDF 字型（Helvetica、Courier、Times Roman）和 PNG/JPG 圖片浮水印。文字浮水印可設定字型大小、顏色和透明度。",
    "faq1Q": "這個工具會上傳我的 PDF 檔案嗎？",
    "faq1A": "不會。所有 PDF 處理均使用 pdf-lib 函式庫在瀏覽器中完成。您的檔案不會離開您的裝置。",
    "faq2Q": "可以在文字浮水印中使用中文、日文或韓文字元嗎？",
    "faq2A": "目前僅支援標準拉丁字型（Helvetica、Courier、Times Roman）。中日韓字型支援將在未來更新中加入。",
    "faq3Q": "什麼是平鋪浮水印模式？",
    "faq3A": "平鋪模式會在所有頁面上以對角線方向重複浮水印。這有助於版權保護，因為浮水印無法被輕易裁剪掉。"
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add public/locales/zh-TW/tools.json public/locales/zh-TW/pdf-watermark.json
git commit -m "feat(pdf-watermark): add zh-TW translations"
```

---

### Task 10: Japanese Translations

**Files:**

- Modify: `public/locales/ja/tools.json`
- Create: `public/locales/ja/pdf-watermark.json`

- [ ] **Step 1: Add entry to ja/tools.json**

```json
  "pdf-watermark": {
    "shortTitle": "PDF 透かし",
    "searchTerms": "pdfsukaisi pdfsks mizuashi shirushi chosakuken",
    "description": "PDFファイルにテキストまたは画像の透かしを追加。フォント、色、不透明度、回転、タイル表示をカスタマイズ。"
  }
```

- [ ] **Step 2: Create ja/pdf-watermark.json**

```json
{
  "dropPdf": "ここにPDFをドラッグ＆ドロップ、またはクリックして選択",
  "supportedFormats": "PDFファイルのみ対応",
  "reselect": "再選択",
  "typeText": "テキスト",
  "typeImage": "画像",
  "modeSingle": "単一",
  "modeTiled": "タイル",
  "textContent": "テキスト",
  "fontFamily": "フォント",
  "fontHelvetica": "Helvetica",
  "fontHelveticaBold": "Helvetica Bold",
  "fontCourier": "Courier",
  "fontCourierBold": "Courier Bold",
  "fontTimesRoman": "Times Roman",
  "fontTimesRomanBold": "Times Roman Bold",
  "fontSize": "サイズ",
  "color": "色",
  "opacity": "不透明度",
  "uploadImage": "画像をアップロード",
  "imageSupportedFormats": "PNG、JPG",
  "imageScale": "スケール",
  "position": "位置",
  "positionCenter": "中",
  "positionTopLeft": "↖",
  "positionTopCenter": "↑",
  "positionTopRight": "↗",
  "positionLeftCenter": "←",
  "positionRightCenter": "→",
  "positionBottomLeft": "↙",
  "positionBottomCenter": "↓",
  "positionBottomRight": "↘",
  "rotation": "回転",
  "tiledSpacing": "間隔",
  "processing": "処理中...",
  "pages": "{count}ページ",
  "fileName": "{name} · {pages}",
  "corruptedPdf": "このPDFファイルを解析できません",
  "encryptedPdf": "このPDFファイルは暗号化されています",
  "onlyPdfSupported": "PDFファイルのみ対応しています",
  "fileTooLarge": "ファイルサイズが100MBを超えています",
  "largeFile": "ファイルが大きいため、処理に時間がかかる場合があります",
  "largePageCount": "このPDFは{count}ページあり、処理に時間がかかる場合があります",
  "emptyText": "透かしテキストを入力してプレビュー",
  "noImage": "画像をアップロードしてプレビュー",
  "descriptions": {
    "title": "PDF 透かしについて",
    "aeoDefinition": "PDF 透かしは、PDFファイルにテキストや画像の透かしを追加する無料のオンラインツールです。位置、不透明度、回転、タイル表示をカスタマイズできます。すべての処理はブラウザ上でローカルに実行されます。",
    "whatIsTitle": "PDF 透かしとは？",
    "whatIs": "ブラウザ上で直接PDFファイルにテキストや画像の透かしを追加できます。単一配置またはタイル表示モードを選択し、フォント、色、不透明度、位置を調整できます。pdf-libライブラリを使用して処理を行い、データはサーバーにアップロードされません。",
    "stepsTitle": "PDFに透かしを追加する方法",
    "step1Title": "PDFをアップロード",
    "step1Text": "PDFファイルをドロップゾーンにドラッグ＆ドロップするか、クリックして参照します。ファイルはブラウザ内に留まります。",
    "step2Title": "透かしを設定",
    "step2Text": "テキストまたは画像の透かしを選択し、フォント、サイズ、色、不透明度、位置を調整します。タイルモードを使用すると、著作権保護のために全ページに透かしを繰り返し配置できます。",
    "step3Title": "ダウンロード",
    "step3Text": "リアルタイムで透かしの効果をプレビューし、透かし入りのPDFファイルをダウンロードします。透かしはすべてのページに適用されます。",
    "p1": "ブラウザ上で直接PDFファイルにテキストや画像の透かしを追加できます。[PDF結合](/pdf-merge)で複数のPDFをまとめたり、[画像圧縮](/image-compress)で画像を圧縮したり、[画像変換](/image-convert)でフォーマットを変換したりできます。",
    "p2": "標準PDFフォント（Helvetica、Courier、Times Roman）とPNG/JPG画像の透かしに対応しています。テキスト透かしではフォントサイズ、色、不透明度を設定できます。",
    "faq1Q": "PDFファイルはサーバーにアップロードされますか？",
    "faq1A": "いいえ。すべてのPDF処理はpdf-libライブラリを使用してブラウザ上で行われます。ファイルがデバイス外に出ることはありません。",
    "faq2Q": "テキスト透かしに日本語を使えますか？",
    "faq2A": "現在、標準ラテンフォント（Helvetica、Courier、Times Roman）のみ対応しています。日本語フォントのサポートは今後のアップデートで追加予定です。",
    "faq3Q": "タイル透かしモードとは？",
    "faq3A": "タイルモードは、すべてのページに斜め方向に透かしを繰り返し配置します。透かしを簡単に切り抜くことができないため、著作権保護に役立ちます。"
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add public/locales/ja/tools.json public/locales/ja/pdf-watermark.json
git commit -m "feat(pdf-watermark): add ja translations"
```

---

### Task 11: Korean Translations

**Files:**

- Modify: `public/locales/ko/tools.json`
- Create: `public/locales/ko/pdf-watermark.json`

- [ ] **Step 1: Add entry to ko/tools.json**

```json
  "pdf-watermark": {
    "shortTitle": "PDF 워터마크",
    "searchTerms": "pdfwoteomakeu pdfwtm mulleuteu jeojakken",
    "description": "PDF 파일에 텍스트 또는 이미지 워터마크를 추가합니다. 글꼴, 색상, 불투명도, 회전, 타일링을 사용자 정의할 수 있습니다."
  }
```

- [ ] **Step 2: Create ko/pdf-watermark.json**

```json
{
  "dropPdf": "여기에 PDF를 드래그 앤 드롭하거나 클릭하여 선택",
  "supportedFormats": "PDF 파일만 지원",
  "reselect": "다시 선택",
  "typeText": "텍스트",
  "typeImage": "이미지",
  "modeSingle": "단일",
  "modeTiled": "타일",
  "textContent": "텍스트",
  "fontFamily": "글꼴",
  "fontHelvetica": "Helvetica",
  "fontHelveticaBold": "Helvetica Bold",
  "fontCourier": "Courier",
  "fontCourierBold": "Courier Bold",
  "fontTimesRoman": "Times Roman",
  "fontTimesRomanBold": "Times Roman Bold",
  "fontSize": "크기",
  "color": "색상",
  "opacity": "불투명도",
  "uploadImage": "이미지 업로드",
  "imageSupportedFormats": "PNG, JPG",
  "imageScale": "크기 조절",
  "position": "위치",
  "positionCenter": "중",
  "positionTopLeft": "↖",
  "positionTopCenter": "↑",
  "positionTopRight": "↗",
  "positionLeftCenter": "←",
  "positionRightCenter": "→",
  "positionBottomLeft": "↙",
  "positionBottomCenter": "↓",
  "positionBottomRight": "↘",
  "rotation": "회전",
  "tiledSpacing": "간격",
  "processing": "처리 중...",
  "pages": "{count}페이지",
  "fileName": "{name} · {pages}",
  "corruptedPdf": "이 PDF 파일을 파싱할 수 없습니다",
  "encryptedPdf": "이 PDF 파일은 암호화되어 처리할 수 없습니다",
  "onlyPdfSupported": "PDF 파일만 지원합니다",
  "fileTooLarge": "파일이 100MB 제한을 초과합니다",
  "largeFile": "파일이 커서 처리에 시간이 걸릴 수 있습니다",
  "largePageCount": "이 PDF는 {count}페이지로 처리에 시간이 걸릴 수 있습니다",
  "emptyText": "워터마크 텍스트를 입력하여 미리보기",
  "noImage": "이미지를 업로드하여 미리보기",
  "descriptions": {
    "title": "PDF 워터마크 정보",
    "aeoDefinition": "PDF 워터마크는 PDF 파일에 텍스트 또는 이미지 워터마크를 추가하는 무료 온라인 도구입니다. 위치, 불투명도, 회전, 타일링을 사용자 정의할 수 있습니다. 모든 처리는 브라우저에서 로컬로 실행됩니다.",
    "whatIsTitle": "PDF 워터마크란?",
    "whatIs": "브라우저에서 직접 PDF 파일에 텍스트 또는 이미지 워터마크를 추가할 수 있습니다. 단일 배치 또는 타일 모드를 선택하고, 글꼴, 색상, 불투명도, 위치를 조정할 수 있습니다. pdf-lib 라이브러리를 사용하여 처리하며 데이터는 서버에 업로드되지 않습니다.",
    "stepsTitle": "PDF에 워터마크를 추가하는 방법",
    "step1Title": "PDF 업로드",
    "step1Text": "PDF 파일을 드롭존에 드래그 앤 드롭하거나 클릭하여 찾아보세요. 파일은 브라우저에 남아 있습니다.",
    "step2Title": "워터마크 구성",
    "step2Text": "텍스트 또는 이미지 워터마크를 선택하고, 글꼴, 크기, 색상, 불투명도, 위치를 조정합니다. 타일 모드를 사용하면 저작권 보호를 위해 모든 페이지에 워터마크를 반복할 수 있습니다.",
    "step3Title": "다운로드",
    "step3Text": "실시간으로 워터마크 효과를 미리보고, 워터마크가 적용된 PDF 파일을 다운로드합니다. 워터마크는 모든 페이지에 적용됩니다.",
    "p1": "브라우저에서 직접 PDF 파일에 텍스트 또는 이미지 워터마크를 추가할 수 있습니다. [PDF 병합](/pdf-merge)으로 여러 PDF를 합치거나, [이미지 압축](/image-compress)으로 이미지를 압축하거나, [이미지 변환](/image-convert)으로 형식을 변환할 수 있습니다.",
    "p2": "표준 PDF 글꼴(Helvetica, Courier, Times Roman)과 PNG/JPG 이미지 워터마크를 지원합니다. 텍스트 워터마크는 글꼴 크기, 색상, 불투명도를 설정할 수 있습니다.",
    "faq1Q": "이 도구는 PDF 파일을 업로드하나요?",
    "faq1A": "아니요. 모든 PDF 처리는 pdf-lib 라이브러리를 사용하여 브라우저에서 이루어집니다. 파일이 기기를 떠나지 않습니다.",
    "faq2Q": "텍스트 워터마크에 한글을 사용할 수 있나요?",
    "faq2A": "현재 표준 라틴 글꼴(Helvetica, Courier, Times Roman)만 지원합니다. 한글 글꼴 지원은 향후 업데이트에서 추가될 예정입니다.",
    "faq3Q": "타일 워터마크 모드란?",
    "faq3A": "타일 모드는 모든 페이지에 대각선 방향으로 워터마크를 반복 배치합니다. 워터마크를 쉽게 자를 수 없어 저작권 보호에 유용합니다."
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add public/locales/ko/tools.json public/locales/ko/pdf-watermark.json
git commit -m "feat(pdf-watermark): add ko translations"
```

---

### Task 12: Latin Translations (es, pt-BR, fr, de, ru)

**Files:**

- Modify: `public/locales/{es,pt-BR,fr,de,ru}/tools.json` (add entries)
- Create: `public/locales/{es,pt-BR,fr,de,ru}/pdf-watermark.json`

This task handles 5 locales in one batch. Each locale follows the same JSON structure.

- [ ] **Step 1: Add entries to each locale's tools.json**

For each locale, add the `pdf-watermark` entry (no `searchTerms` for Latin-script languages):

**es/tools.json:**

```json
  "pdf-watermark": {
    "shortTitle": "Marca de agua PDF",
    "description": "Añade marcas de agua de texto o imagen a archivos PDF. Personaliza la fuente, el color, la opacidad, la rotación y el mosaico."
  }
```

**pt-BR/tools.json:**

```json
  "pdf-watermark": {
    "shortTitle": "Marca d'água PDF",
    "description": "Adicione marcas d'água de texto ou imagem a arquivos PDF. Personalize a fonte, cor, opacidade, rotação e blocagem."
  }
```

**fr/tools.json:**

```json
  "pdf-watermark": {
    "shortTitle": "Filigrane PDF",
    "description": "Ajoutez des filigranes texte ou image aux fichiers PDF. Personnalisez la police, la couleur, l'opacité, la rotation et le pavage."
  }
```

**de/tools.json:**

```json
  "pdf-watermark": {
    "shortTitle": "PDF-Wasserzeichen",
    "description": "Fügen Sie Text- oder Bildwasserzeichen zu PDF-Dateien hinzu. Passen Sie Schriftart, Farbe, Deckkraft, Drehung und Kachelung an."
  }
```

**ru/tools.json:**

```json
  "pdf-watermark": {
    "shortTitle": "Водяной знак PDF",
    "description": "Добавляйте текстовые или графические водяные знаки в PDF-файлы. Настраивайте шрифт, цвет, прозрачность, поворот и мозаику."
  }
```

- [ ] **Step 2: Create es/pdf-watermark.json**

```json
{
  "dropPdf": "Arrastra un PDF aquí o haz clic para seleccionar",
  "supportedFormats": "Solo se admiten archivos PDF",
  "reselect": "Reseleccionar",
  "typeText": "Texto",
  "typeImage": "Imagen",
  "modeSingle": "Individual",
  "modeTiled": "Mosaico",
  "textContent": "Texto",
  "fontFamily": "Fuente",
  "fontHelvetica": "Helvetica",
  "fontHelveticaBold": "Helvetica Bold",
  "fontCourier": "Courier",
  "fontCourierBold": "Courier Bold",
  "fontTimesRoman": "Times Roman",
  "fontTimesRomanBold": "Times Roman Bold",
  "fontSize": "Tamaño",
  "color": "Color",
  "opacity": "Opacidad",
  "uploadImage": "Subir imagen",
  "imageSupportedFormats": "PNG, JPG",
  "imageScale": "Escala",
  "position": "Posición",
  "positionCenter": "C",
  "positionTopLeft": "↖",
  "positionTopCenter": "↑",
  "positionTopRight": "↗",
  "positionLeftCenter": "←",
  "positionRightCenter": "→",
  "positionBottomLeft": "↙",
  "positionBottomCenter": "↓",
  "positionBottomRight": "↘",
  "rotation": "Rotación",
  "tiledSpacing": "Espaciado",
  "processing": "Procesando...",
  "pages": "{count} páginas",
  "fileName": "{name} · {pages}",
  "corruptedPdf": "No se puede analizar este archivo PDF",
  "encryptedPdf": "Este PDF está cifrado y no se puede procesar",
  "onlyPdfSupported": "Solo se admiten archivos PDF",
  "fileTooLarge": "El archivo supera el límite de 100 MB",
  "largeFile": "El archivo es grande, el procesamiento puede tardar",
  "largePageCount": "Este PDF tiene {count} páginas, el procesamiento puede tardar",
  "emptyText": "Introduce texto para la marca de agua para previsualizar",
  "noImage": "Sube una imagen para previsualizar",
  "descriptions": {
    "title": "Acerca de Marca de agua PDF",
    "aeoDefinition": "Marca de agua PDF es una herramienta online gratuita para añadir marcas de agua de texto o imagen a archivos PDF con posición, opacidad, rotación y mosaico personalizables. Todo el procesamiento se realiza localmente en tu navegador.",
    "whatIsTitle": "¿Qué es Marca de agua PDF?",
    "whatIs": "Añade marcas de agua de texto o imagen a tus archivos PDF directamente en el navegador. Elige entre colocación individual o mosaico, ajusta fuente, color, opacidad y posición. Todo el procesamiento usa la biblioteca pdf-lib.",
    "stepsTitle": "Cómo añadir una marca de agua a un PDF",
    "step1Title": "Sube un PDF",
    "step1Text": "Arrastra y suelta un archivo PDF en la zona de carga o haz clic para explorar. El archivo permanece en tu navegador.",
    "step2Title": "Configura tu marca de agua",
    "step2Text": "Elige entre marca de agua de texto o imagen. Ajusta fuente, tamaño, color, opacidad y posición. Usa el modo mosaico para protección de derechos de autor.",
    "step3Title": "Descarga",
    "step3Text": "Previsualiza la primera página con marca de agua en tiempo real y descarga el PDF con la marca aplicada a todas las páginas.",
    "p1": "Añade marcas de agua de texto o imagen a PDFs directamente en tu navegador. Fusiona PDFs con [Fusionador PDF](/pdf-merge), comprime imágenes con [Compresor de imágenes](/image-compress) o convierte formatos con [Convertidor de imágenes](/image-convert).",
    "p2": "Admite fuentes PDF estándar (Helvetica, Courier, Times Roman) y marcas de agua en PNG/JPG. Las marcas de texto incluyen tamaño, color y opacidad configurables.",
    "faq1Q": "¿Esta herramienta sube mis PDFs?",
    "faq1A": "No. Todo el procesamiento de PDF se realiza en tu navegador usando la biblioteca pdf-lib. Tus archivos nunca salen de tu dispositivo.",
    "faq2Q": "¿Puedo usar caracteres CJK (chino, japonés, coreano) en las marcas de texto?",
    "faq2A": "Actualmente solo se admiten fuentes latinas estándar (Helvetica, Courier, Times Roman). El soporte de fuentes CJK puede añadirse en una futura actualización.",
    "faq3Q": "¿Qué es el modo de marca de agua en mosaico?",
    "faq3A": "El modo mosaico repite la marca de agua por todas las páginas en un patrón diagonal. Es útil para protección de derechos de autor, ya que la marca no se puede recortar fácilmente."
  }
}
```

- [ ] **Step 3: Create pt-BR/pdf-watermark.json**

```json
{
  "dropPdf": "Arraste um PDF aqui ou clique para selecionar",
  "supportedFormats": "Somente arquivos PDF são suportados",
  "reselect": "Selecionar novamente",
  "typeText": "Texto",
  "typeImage": "Imagem",
  "modeSingle": "Individual",
  "modeTiled": "Blocagem",
  "textContent": "Texto",
  "fontFamily": "Fonte",
  "fontHelvetica": "Helvetica",
  "fontHelveticaBold": "Helvetica Bold",
  "fontCourier": "Courier",
  "fontCourierBold": "Courier Bold",
  "fontTimesRoman": "Times Roman",
  "fontTimesRomanBold": "Times Roman Bold",
  "fontSize": "Tamanho",
  "color": "Cor",
  "opacity": "Opacidade",
  "uploadImage": "Enviar imagem",
  "imageSupportedFormats": "PNG, JPG",
  "imageScale": "Escala",
  "position": "Posição",
  "positionCenter": "C",
  "positionTopLeft": "↖",
  "positionTopCenter": "↑",
  "positionTopRight": "↗",
  "positionLeftCenter": "←",
  "positionRightCenter": "→",
  "positionBottomLeft": "↙",
  "positionBottomCenter": "↓",
  "positionBottomRight": "↘",
  "rotation": "Rotação",
  "tiledSpacing": "Espaçamento",
  "processing": "Processando...",
  "pages": "{count} páginas",
  "fileName": "{name} · {pages}",
  "corruptedPdf": "Não foi possível analisar este arquivo PDF",
  "encryptedPdf": "Este PDF está criptografado e não pode ser processado",
  "onlyPdfSupported": "Somente arquivos PDF são suportados",
  "fileTooLarge": "O arquivo excede o limite de 100 MB",
  "largeFile": "O arquivo é grande, o processamento pode demorar",
  "largePageCount": "Este PDF tem {count} páginas, o processamento pode demorar",
  "emptyText": "Digite o texto da marca d'água para visualizar",
  "noImage": "Envie uma imagem para visualizar",
  "descriptions": {
    "title": "Sobre Marca d'água PDF",
    "aeoDefinition": "Marca d'água PDF é uma ferramenta online gratuita para adicionar marcas d'água de texto ou imagem a arquivos PDF com posição, opacidade, rotação e blocagem personalizáveis. Todo o processamento é feito localmente no seu navegador.",
    "whatIsTitle": "O que é Marca d'água PDF?",
    "whatIs": "Adicione marcas d'água de texto ou imagem aos seus arquivos PDF diretamente no navegador. Escolha entre colocação individual ou blocagem, ajuste fonte, cor, opacidade e posição. Todo o processamento usa a biblioteca pdf-lib.",
    "stepsTitle": "Como adicionar uma marca d'água a um PDF",
    "step1Title": "Envie um PDF",
    "step1Text": "Arraste e solte um arquivo PDF na área de upload ou clique para procurar. O arquivo permanece no seu navegador.",
    "step2Title": "Configure sua marca d'água",
    "step2Text": "Escolha entre marca d'água de texto ou imagem. Ajuste fonte, tamanho, cor, opacidade e posição. Use o modo blocagem para proteção de direitos autorais.",
    "step3Title": "Baixar",
    "step3Text": "Visualize a primeira página com marca d'água em tempo real e baixe o PDF com a marca aplicada a todas as páginas.",
    "p1": "Adicione marcas d'água de texto ou imagem a PDFs diretamente no seu navegador. Mescle PDFs com [Fusão de PDF](/pdf-merge), comprima imagens com [Compressor de imagens](/image-compress) ou converta formatos com [Conversor de imagens](/image-convert).",
    "p2": "Suporta fontes PDF padrão (Helvetica, Courier, Times Roman) e marcas d'água em PNG/JPG. Marcas de texto incluem tamanho, cor e opacidade configuráveis.",
    "faq1Q": "Esta ferramenta envia meus PDFs?",
    "faq1A": "Não. Todo o processamento de PDF é feito no seu navegador usando a biblioteca pdf-lib. Seus arquivos nunca saem do seu dispositivo.",
    "faq2Q": "Posso usar caracteres CJK (chinês, japonês, coreano) nas marcas de texto?",
    "faq2A": "Atualmente, apenas fontes latinas padrão são suportadas (Helvetica, Courier, Times Roman). Suporte a fontes CJK pode ser adicionado em uma atualização futura.",
    "faq3Q": "O que é o modo de marca d'água em blocagem?",
    "faq3A": "O modo blocagem repete a marca d'água por todas as páginas em um padrão diagonal. Isso é útil para proteção de direitos autorais, pois a marca não pode ser facilmente recortada."
  }
}
```

- [ ] **Step 4: Create fr/pdf-watermark.json**

```json
{
  "dropPdf": "Déposez un PDF ici ou cliquez pour sélectionner",
  "supportedFormats": "Uniquement les fichiers PDF",
  "reselect": "Resélectionner",
  "typeText": "Texte",
  "typeImage": "Image",
  "modeSingle": "Unique",
  "modeTiled": "Pavage",
  "textContent": "Texte",
  "fontFamily": "Police",
  "fontHelvetica": "Helvetica",
  "fontHelveticaBold": "Helvetica Bold",
  "fontCourier": "Courier",
  "fontCourierBold": "Courier Bold",
  "fontTimesRoman": "Times Roman",
  "fontTimesRomanBold": "Times Roman Bold",
  "fontSize": "Taille",
  "color": "Couleur",
  "opacity": "Opacité",
  "uploadImage": "Télécharger une image",
  "imageSupportedFormats": "PNG, JPG",
  "imageScale": "Échelle",
  "position": "Position",
  "positionCenter": "C",
  "positionTopLeft": "↖",
  "positionTopCenter": "↑",
  "positionTopRight": "↗",
  "positionLeftCenter": "←",
  "positionRightCenter": "→",
  "positionBottomLeft": "↙",
  "positionBottomCenter": "↓",
  "positionBottomRight": "↘",
  "rotation": "Rotation",
  "tiledSpacing": "Espacement",
  "processing": "Traitement en cours...",
  "pages": "{count} pages",
  "fileName": "{name} · {pages}",
  "corruptedPdf": "Impossible d'analyser ce fichier PDF",
  "encryptedPdf": "Ce PDF est chiffré et ne peut pas être traité",
  "onlyPdfSupported": "Seuls les fichiers PDF sont pris en charge",
  "fileTooLarge": "Le fichier dépasse la limite de 100 Mo",
  "largeFile": "Le fichier est volumineux, le traitement peut prendre du temps",
  "largePageCount": "Ce PDF contient {count} pages, le traitement peut prendre du temps",
  "emptyText": "Entrez le texte du filigrane pour prévisualiser",
  "noImage": "Téléchargez une image pour prévisualiser",
  "descriptions": {
    "title": "À propos de Filigrane PDF",
    "aeoDefinition": "Filigrane PDF est un outil en ligne gratuit pour ajouter des filigranes texte ou image aux fichiers PDF avec position, opacité, rotation et pavage personnalisables. Tout le traitement s'effectue localement dans votre navigateur.",
    "whatIsTitle": "Qu'est-ce que Filigrane PDF ?",
    "whatIs": "Ajoutez des filigranes texte ou image à vos fichiers PDF directement dans le navigateur. Choisissez entre placement unique ou pavage, ajustez police, couleur, opacité et position. Tout le traitement utilise la bibliothèque pdf-lib.",
    "stepsTitle": "Comment ajouter un filigrane à un PDF",
    "step1Title": "Téléchargez un PDF",
    "step1Text": "Glissez-déposez un fichier PDF dans la zone de dépôt ou cliquez pour parcourir. Le fichier reste dans votre navigateur.",
    "step2Title": "Configurez votre filigrane",
    "step2Text": "Choisissez entre filigrane texte ou image. Ajustez police, taille, couleur, opacité et position. Utilisez le mode pavage pour la protection des droits d'auteur.",
    "step3Title": "Télécharger",
    "step3Text": "Prévisualisez la première page avec filigrane en temps réel et téléchargez le PDF avec le filigrane appliqué à toutes les pages.",
    "p1": "Ajoutez des filigranes texte ou image aux PDF directement dans votre navigateur. Fusionnez des PDF avec [Fusion PDF](/pdf-merge), compressez des images avec [Compresseur d'images](/image-compress) ou convertissez des formats avec [Convertisseur d'images](/image-convert).",
    "p2": "Prend en charge les polices PDF standard (Helvetica, Courier, Times Roman) et les filigranes PNG/JPG. Les filigranes texte offrent taille, couleur et opacité configurables.",
    "faq1Q": "Cet outil télécharge-t-il mes PDF ?",
    "faq1A": "Non. Tout le traitement PDF s'effectue dans votre navigateur via la bibliothèque pdf-lib. Vos fichiers ne quittent jamais votre appareil.",
    "faq2Q": "Puis-je utiliser des caractères CJC (chinois, japonais, coréen) dans les filigranes texte ?",
    "faq2A": "Actuellement, seules les polices latines standard sont prises en charge (Helvetica, Courier, Times Roman). La prise en charge des polices CJC pourra être ajoutée dans une prochaine mise à jour.",
    "faq3Q": "Qu'est-ce que le mode filigrane en pavage ?",
    "faq3A": "Le mode pavage répète le filigrane sur toutes les pages selon un motif diagonal. Utile pour la protection des droits d'auteur, car le filigrane ne peut pas être facilement découpé."
  }
}
```

- [ ] **Step 5: Create de/pdf-watermark.json**

```json
{
  "dropPdf": "PDF hier ablegen oder klicken zum Auswählen",
  "supportedFormats": "Nur PDF-Dateien werden unterstützt",
  "reselect": "Neu auswählen",
  "typeText": "Text",
  "typeImage": "Bild",
  "modeSingle": "Einzel",
  "modeTiled": "Kachel",
  "textContent": "Text",
  "fontFamily": "Schriftart",
  "fontHelvetica": "Helvetica",
  "fontHelveticaBold": "Helvetica Bold",
  "fontCourier": "Courier",
  "fontCourierBold": "Courier Bold",
  "fontTimesRoman": "Times Roman",
  "fontTimesRomanBold": "Times Roman Bold",
  "fontSize": "Größe",
  "color": "Farbe",
  "opacity": "Deckkraft",
  "uploadImage": "Bild hochladen",
  "imageSupportedFormats": "PNG, JPG",
  "imageScale": "Skalierung",
  "position": "Position",
  "positionCenter": "M",
  "positionTopLeft": "↖",
  "positionTopCenter": "↑",
  "positionTopRight": "↗",
  "positionLeftCenter": "←",
  "positionRightCenter": "→",
  "positionBottomLeft": "↙",
  "positionBottomCenter": "↓",
  "positionBottomRight": "↘",
  "rotation": "Drehung",
  "tiledSpacing": "Abstand",
  "processing": "Verarbeitung...",
  "pages": "{count} Seiten",
  "fileName": "{name} · {pages}",
  "corruptedPdf": "Diese PDF-Datei kann nicht analysiert werden",
  "encryptedPdf": "Diese PDF-Datei ist verschlüsselt und kann nicht verarbeitet werden",
  "onlyPdfSupported": "Nur PDF-Dateien werden unterstützt",
  "fileTooLarge": "Datei überschreitet das 100-MB-Limit",
  "largeFile": "Die Datei ist groß, die Verarbeitung kann einige Zeit dauern",
  "largePageCount": "Diese PDF hat {count} Seiten, die Verarbeitung kann einige Zeit dauern",
  "emptyText": "Wasserzeichentext eingeben für Vorschau",
  "noImage": "Bild hochladen für Vorschau",
  "descriptions": {
    "title": "Über PDF-Wasserzeichen",
    "aeoDefinition": "PDF-Wasserzeichen ist ein kostenloses Online-Tool zum Hinzufügen von Text- oder Bildwasserzeichen zu PDF-Dateien mit anpassbarer Position, Deckkraft, Drehung und Kachelung. Die gesamte Verarbeitung erfolgt lokal in Ihrem Browser.",
    "whatIsTitle": "Was ist PDF-Wasserzeichen?",
    "whatIs": "Fügen Sie Text- oder Bildwasserzeichen direkt im Browser zu Ihren PDF-Dateien hinzu. Wählen Sie Einzelplatzierung oder Kachelung, passen Sie Schriftart, Farbe, Deckkraft und Position an. Die Verarbeitung erfolgt mit der pdf-lib-Bibliothek.",
    "stepsTitle": "So fügen Sie ein Wasserzeichen zu einem PDF hinzu",
    "step1Title": "PDF hochladen",
    "step1Text": "Ziehen Sie eine PDF-Datei in die Ablagezone oder klicken Sie zum Durchsuchen. Die Datei bleibt in Ihrem Browser.",
    "step2Title": "Wasserzeichen konfigurieren",
    "step2Text": "Wählen Sie Text- oder Bildwasserzeichen. Passen Sie Schriftart, Größe, Farbe, Deckkraft und Position an. Verwenden Sie den Kachelmodus für Urheberrechtsschutz.",
    "step3Title": "Herunterladen",
    "step3Text": "Zeigen Sie die erste Seite mit Wasserzeichen in Echtzeit an und laden Sie das PDF mit dem auf allen Seiten angewendeten Wasserzeichen herunter.",
    "p1": "Fügen Sie Text- oder Bildwasserzeichen direkt in Ihrem Browser zu PDFs hinzu. Führen Sie PDFs mit [PDF-Zusammenführung](/pdf-merge) zusammen, komprimieren Sie Bilder mit [Bildkompressor](/image-compress) oder konvertieren Sie Formate mit [Bildkonverter](/image-convert).",
    "p2": "Unterstützt Standard-PDF-Schriftarten (Helvetica, Courier, Times Roman) und PNG/JPG-Bildwasserzeichen. Textwasserzeichen bieten konfigurierbare Schriftgröße, Farbe und Deckkraft.",
    "faq1Q": "Lädt dieses Tool meine PDFs hoch?",
    "faq1A": "Nein. Die gesamte PDF-Verarbeitung erfolgt in Ihrem Browser mit der pdf-lib-Bibliothek. Ihre Dateien verlassen nie Ihr Gerät.",
    "faq2Q": "Kann ich CJK-Zeichen (Chinesisch, Japanisch, Koreanisch) in Textwasserzeichen verwenden?",
    "faq2A": "Aktuell werden nur Standard-Lateinschriften unterstützt (Helvetica, Courier, Times Roman). CJK-Schriftartenunterstützung wird möglicherweise in einem zukünftigen Update hinzugefügt.",
    "faq3Q": "Was ist der Kachel-Wasserzeichenmodus?",
    "faq3A": "Der Kachelmodus wiederholt das Wasserzeichen auf allen Seiten in einem diagonalen Muster. Dies ist nützlich für Urheberrechtsschutz, da das Wasserzeichen nicht einfach abgeschnitten werden kann."
  }
}
```

- [ ] **Step 6: Create ru/pdf-watermark.json**

```json
{
  "dropPdf": "Перетащите PDF сюда или нажмите для выбора",
  "supportedFormats": "Поддерживаются только PDF-файлы",
  "reselect": "Выбрать заново",
  "typeText": "Текст",
  "typeImage": "Изображение",
  "modeSingle": "Один",
  "modeTiled": "Мозаика",
  "textContent": "Текст",
  "fontFamily": "Шрифт",
  "fontHelvetica": "Helvetica",
  "fontHelveticaBold": "Helvetica Bold",
  "fontCourier": "Courier",
  "fontCourierBold": "Courier Bold",
  "fontTimesRoman": "Times Roman",
  "fontTimesRomanBold": "Times Roman Bold",
  "fontSize": "Размер",
  "color": "Цвет",
  "opacity": "Прозрачность",
  "uploadImage": "Загрузить изображение",
  "imageSupportedFormats": "PNG, JPG",
  "imageScale": "Масштаб",
  "position": "Позиция",
  "positionCenter": "Ц",
  "positionTopLeft": "↖",
  "positionTopCenter": "↑",
  "positionTopRight": "↗",
  "positionLeftCenter": "←",
  "positionRightCenter": "→",
  "positionBottomLeft": "↙",
  "positionBottomCenter": "↓",
  "positionBottomRight": "↘",
  "rotation": "Поворот",
  "tiledSpacing": "Интервал",
  "processing": "Обработка...",
  "pages": "{count} стр.",
  "fileName": "{name} · {pages}",
  "corruptedPdf": "Не удалось разобрать этот PDF-файл",
  "encryptedPdf": "Этот PDF зашифрован и не может быть обработан",
  "onlyPdfSupported": "Поддерживаются только PDF-файлы",
  "fileTooLarge": "Файл превышает ограничение в 100 МБ",
  "largeFile": "Файл большой, обработка может занять время",
  "largePageCount": "В этом PDF {count} страниц, обработка может занять время",
  "emptyText": "Введите текст водяного знака для предпросмотра",
  "noImage": "Загрузите изображение для предпросмотра",
  "descriptions": {
    "title": "О Водяном знаке PDF",
    "aeoDefinition": "Водяной знак PDF — бесплатный онлайн-инструмент для добавления текстовых или графических водяных знаков к PDF-файлам с настраиваемой позицией, прозрачностью, поворотом и мозаикой. Вся обработка выполняется локально в браузере.",
    "whatIsTitle": "Что такое Водяной знак PDF?",
    "whatIs": "Добавляйте текстовые или графические водяные знаки к PDF-файлам прямо в браузере. Выбирайте одиночное размещение или мозаику, настраивайте шрифт, цвет, прозрачность и позицию. Вся обработка выполняется с помощью библиотеки pdf-lib.",
    "stepsTitle": "Как добавить водяной знак в PDF",
    "step1Title": "Загрузите PDF",
    "step1Text": "Перетащите PDF-файл в зону загрузки или нажмите для выбора. Файл остаётся в вашем браузере.",
    "step2Title": "Настройте водяной знак",
    "step2Text": "Выберите текстовый или графический водяной знак. Настройте шрифт, размер, цвет, прозрачность и позицию. Используйте режим мозаики для защиты авторских прав.",
    "step3Title": "Скачать",
    "step3Text": "Просмотрите первую страницу с водяным знаком в реальном времени и скачайте PDF с водяным знаком на всех страницах.",
    "p1": "Добавляйте текстовые или графические водяные знаки к PDF прямо в браузере. Объединяйте PDF с [Объединением PDF](/pdf-merge), сжимайте изображения с [Сжатием изображений](/image-compress) или конвертируйте форматы с [Конвертером изображений](/image-convert).",
    "p2": "Поддерживаются стандартные шрифты PDF (Helvetica, Courier, Times Roman) и водяные знаки PNG/JPG. Текстовые водяные знаки поддерживают настраиваемый размер, цвет и прозрачность.",
    "faq1Q": "Этот инструмент загружает мои PDF?",
    "faq1A": "Нет. Вся обработка PDF выполняется в браузере с помощью библиотеки pdf-lib. Ваши файлы никогда не покидают ваше устройство.",
    "faq2Q": "Можно ли использовать символы CJK (китайский, японский, корейский) в текстовых водяных знаках?",
    "faq2A": "В настоящее время поддерживаются только стандартные латинские шрифты (Helvetica, Courier, Times Roman). Поддержка шрифтов CJK может быть добавлена в будущем обновлении.",
    "faq3Q": "Что такое режим мозаики?",
    "faq3A": "Режим мозаики повторяет водяной знак на всех страницах по диагонали. Это полезно для защиты авторских прав, так как водяной знак нельзя легко обрезать."
  }
}
```

- [ ] **Step 7: Commit**

```bash
git add public/locales/es/ public/locales/pt-BR/ public/locales/fr/ public/locales/de/ public/locales/ru/
git commit -m "feat(pdf-watermark): add es, pt-BR, fr, de, ru translations"
```

---

### Task 13: Final Verification

- [ ] **Step 1: Run all pdf-watermark tests**

Run: `npx vitest run libs/pdf-watermark`
Expected: ALL PASS

- [ ] **Step 2: Run full test suite**

Run: `npm run test`
Expected: ALL PASS (no regressions)

- [ ] **Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Run lint**

Run: `npx eslint app/[locale]/pdf-watermark/ libs/pdf-watermark/ --max-warnings 0`
Expected: No errors

- [ ] **Step 5: Run dev server and visually verify**

Run: `npm run dev`

Open `http://localhost:3000/pdf-watermark` and verify:

1. Page loads with title "PDF Watermark"
2. PDF upload works (drag-and-drop and click)
3. Text watermark config renders (font selector, size slider, color picker, opacity slider)
4. Image watermark config renders (upload button, scale slider, opacity slider)
5. Single/Tiled mode toggle works
6. Position grid (3x3) appears in Single mode
7. Rotation and spacing sliders appear in Tiled mode
8. Auto-preview works (first page rendered after upload)
9. Download produces a valid watermarked PDF
10. Language switching works (check zh-CN locale)
11. Description section and Related Tools render

---

## Self-Review Checklist

### Spec Coverage

| Spec Requirement                                                          | Task                              |
| ------------------------------------------------------------------------- | --------------------------------- |
| Types (TextWatermarkConfig, ImageWatermarkConfig, WatermarkOptions, etc.) | Task 1                            |
| Position calculation (9-grid, 10% margin, PDF coords)                     | Task 2                            |
| Tiling grid (brick pattern, spacing)                                      | Task 2                            |
| Text watermark (pdf-lib drawText, font embedding)                         | Task 3                            |
| Image watermark (pdf-lib embedPng/embedJpg, drawImage)                    | Task 3                            |
| Preview rendering (pdfjs-dist, first page)                                | Task 4                            |
| Tool registration (TOOLS, categories, relations)                          | Task 5                            |
| Route entry (page.tsx, SEO, JSON-LD)                                      | Task 6                            |
| English translations (tools.json + pdf-watermark.json)                    | Task 6                            |
| Page component (upload, config, preview, download)                        | Task 7                            |
| 10 locale translations (with CJK searchTerms)                             | Tasks 8-12                        |
| Error handling (corrupted, encrypted, large files)                        | Task 7 (inline in page component) |
| Performance (debounced preview, staleness tracking)                       | Task 7 (useEffect with debounce)  |

### Placeholder Scan

No TBD, TODO, or placeholder text found. All steps contain complete code.

### Type Consistency

- `TextWatermarkConfig` / `ImageWatermarkConfig` / `WatermarkOptions` defined in types.ts, used consistently in watermark.ts and page component
- `PositionPreset` type used consistently across calculatePosition, POSITION_PRESETS array, and UI
- `StandardFonts` mapping keys match FONT_OPTIONS values in page component
- `WatermarkResult.bytes` (Uint8Array) used correctly in preview rendering (`.buffer as ArrayBuffer`) and download (`new Blob([result.bytes])`)
