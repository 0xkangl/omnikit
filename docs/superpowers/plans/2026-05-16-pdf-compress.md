# PDF Compressor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a browser-based PDF compression tool to OmniKit that re-renders each PDF page as JPEG via Canvas at adjustable quality, assembling a new smaller PDF using pdf-lib — all client-side with zero server uploads.

**Architecture:** pdf.js renders each page to an off-screen Canvas at 150 DPI, the Canvas is exported as JPEG at user-selected quality (1–100), and pdf-lib embeds each JPEG into a fresh PDF document. The page component handles file loading, preview rendering, debounce/staleness for quality changes, and download — following the same patterns as `image-compress`.

**Tech Stack:** pdfjs-dist (v4.10.38, already installed), pdf-lib (v1.17.1, already installed), rc-slider (already installed), next-intl, Tailwind CSS 4

---

## File Structure

### New Files

| File                                              | Responsibility                                                                         |
| ------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `libs/pdf-compress/types.ts`                      | Type definitions: `CompressProgress`                                                   |
| `libs/pdf-compress/compress.ts`                   | Core compression engine: `compressPdf()`, `validatePdfBuffer()`, `canvasToJpegBytes()` |
| `libs/pdf-compress/__tests__/compress.test.ts`    | Unit tests for validation and quality mapping                                          |
| `app/[locale]/pdf-compress/page.tsx`              | Route entry (server component): metadata, SEO, JSON-LD                                 |
| `app/[locale]/pdf-compress/pdf-compress-page.tsx` | Page component (client component): UI + business logic                                 |
| `public/locales/en/pdf-compress.json`             | English translations (source of truth)                                                 |
| `public/locales/zh-CN/pdf-compress.json`          | Simplified Chinese translations                                                        |
| `public/locales/zh-TW/pdf-compress.json`          | Traditional Chinese translations                                                       |
| `public/locales/ja/pdf-compress.json`             | Japanese translations                                                                  |
| `public/locales/ko/pdf-compress.json`             | Korean translations                                                                    |
| `public/locales/es/pdf-compress.json`             | Spanish translations                                                                   |
| `public/locales/pt-BR/pdf-compress.json`          | Brazilian Portuguese translations                                                      |
| `public/locales/fr/pdf-compress.json`             | French translations                                                                    |
| `public/locales/de/pdf-compress.json`             | German translations                                                                    |
| `public/locales/ru/pdf-compress.json`             | Russian translations                                                                   |

### Modified Files

| File                                       | Change                                                                                    |
| ------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `libs/tools.ts`                            | Add `pdf-compress` to `TOOLS` array, `TOOL_CATEGORIES.visual.tools`, and `TOOL_RELATIONS` |
| `public/locales/{locale}/tools.json` (×10) | Add `pdf-compress` title, shortTitle, description (and searchTerms for CJK)               |
| `vitest.config.ts`                         | Add `"libs/pdf-compress/**/*.test.ts"` to test scopes                                     |

### Reference Files (read-only, patterns to follow)

| File                                                  | What to copy                                                                  |
| ----------------------------------------------------- | ----------------------------------------------------------------------------- |
| `libs/pdf-merge/merge.ts`                             | pdf-lib import, `PDFDocument.create()`, `.save()` pattern                     |
| `libs/pdf-merge/thumbnail.ts`                         | pdfjs-dist dynamic import, `getDocument`, `page.render()`, Canvas cleanup     |
| `app/[locale]/pdf-merge/page.tsx`                     | Server component template for PDF tool routes                                 |
| `app/[locale]/image-compress/image-compress-page.tsx` | Debounce/staleness pattern, rc-slider config, ImageInfoBar usage, layout grid |
| `components/image/ImageInfoBar.tsx`                   | Props interface: `ImageInfoProps`, `ImageInfoBarProps`                        |
| `public/locales/en/pdf-merge.json`                    | Translation file structure with descriptions                                  |

---

### Task 1: Core Compression Engine

**Files:**

- Create: `libs/pdf-compress/types.ts`
- Create: `libs/pdf-compress/compress.ts`

- [ ] **Step 1: Create type definitions**

```typescript
// libs/pdf-compress/types.ts
export interface CompressProgress {
  current: number;
  total: number;
}
```

- [ ] **Step 2: Create the compression engine**

```typescript
// libs/pdf-compress/compress.ts
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
```

- [ ] **Step 3: Commit**

```bash
git add libs/pdf-compress/types.ts libs/pdf-compress/compress.ts
git commit -m "feat(pdf-compress): add core compression engine"
```

---

### Task 2: Compression Engine Unit Tests

**Files:**

- Create: `libs/pdf-compress/__tests__/compress.test.ts`

> **Note:** The `compressPdf()` function requires browser Canvas and pdf.js, which are unavailable in Node. Tests cover the pure validation and mapping functions. Full compression testing is done manually in the browser.

- [ ] **Step 1: Write unit tests**

```typescript
// libs/pdf-compress/__tests__/compress.test.ts
import { describe, it, expect } from "vitest";
import { validatePdfBuffer, mapQuality, SCALE_FACTOR } from "../compress";

describe("validatePdfBuffer", () => {
  it("accepts a valid PDF header", () => {
    const data = new TextEncoder().encode("%PDF-1.7 rest of file...").buffer;
    expect(() => validatePdfBuffer(data)).not.toThrow();
  });

  it("throws on empty buffer", () => {
    expect(() => validatePdfBuffer(new ArrayBuffer(0))).toThrow("Invalid PDF: empty buffer");
  });

  it("throws on non-PDF data", () => {
    const data = new TextEncoder().encode("Hello, world!").buffer;
    expect(() => validatePdfBuffer(data)).toThrow("Invalid PDF: not a valid PDF file");
  });

  it("throws on a buffer that starts with wrong magic bytes", () => {
    const data = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d]).buffer; // PNG header
    expect(() => validatePdfBuffer(data)).toThrow("Invalid PDF: not a valid PDF file");
  });
});

describe("mapQuality", () => {
  it("maps 1 to 0.01", () => {
    expect(mapQuality(1)).toBeCloseTo(0.01, 2);
  });

  it("maps 100 to 1.0", () => {
    expect(mapQuality(100)).toBe(1);
  });

  it("maps 75 to 0.75", () => {
    expect(mapQuality(75)).toBe(0.75);
  });

  it("maps 50 to 0.50", () => {
    expect(mapQuality(50)).toBe(0.5);
  });

  it("clamps values below 1 to 0.01", () => {
    expect(mapQuality(0)).toBeCloseTo(0.01, 2);
    expect(mapQuality(-10)).toBeCloseTo(0.01, 2);
  });

  it("clamps values above 100 to 1.0", () => {
    expect(mapQuality(150)).toBe(1);
  });
});

describe("SCALE_FACTOR", () => {
  it("equals 150/72 (render DPI / PDF DPI)", () => {
    expect(SCALE_FACTOR).toBeCloseTo(150 / 72, 4);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npm run test -- libs/pdf-compress`
Expected: All tests PASS (6 tests in 3 describe blocks)

- [ ] **Step 3: Commit**

```bash
git add libs/pdf-compress/__tests__/compress.test.ts
git commit -m "test(pdf-compress): add unit tests for validation and quality mapping"
```

---

### Task 3: Tool Registration + Vitest Config

**Files:**

- Modify: `libs/tools.ts`
- Modify: `vitest.config.ts`

- [ ] **Step 1: Register tool in `libs/tools.ts`**

Add `pdf-compress` to the `TOOLS` array (after the `pdf-merge` entry at line ~499):

```typescript
{
  key: "pdf-compress",
  path: "/pdf-compress",
  icon: FileText,
  emoji: "🗜️",
  sameAs: [
    "https://en.wikipedia.org/wiki/PDF",
    "https://developer.mozilla.org/en-US/docs/Glossary/PDF",
  ],
},
```

Add `"pdf-compress"` to `TOOL_CATEGORIES` visual category tools array (after `"pdf-merge"`):

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
    "pdf-compress", // NEW
  ],
},
```

Add `pdf-compress` to `TOOL_RELATIONS` and update reverse relations:

```typescript
"pdf-compress": ["pdf-merge", "image-compress", "checksum"],
```

Update the reverse relations — add `"pdf-compress"` to these existing entries:

```typescript
"pdf-merge": ["image-compress", "image-convert", "checksum", "pdf-compress"],
"image-compress": ["image-resize", "image-convert", "image-crop", "image-rotate", "pdf-merge", "image-watermark", "pdf-compress"],
"checksum": ["hashing", "cipher", "pdf-merge", "pdf-compress"],
```

- [ ] **Step 2: Update `vitest.config.ts`**

Add test scope after the existing `"libs/pdf-merge/**/*.test.ts"` line:

```typescript
"libs/pdf-merge/**/*.test.ts",
"libs/pdf-compress/**/*.test.ts",
```

- [ ] **Step 3: Verify tool relations test passes**

Run: `npm run test -- libs/__tests__/tool-relations.test.ts`
Expected: PASS — the test validates bidirectional consistency, 2–5 relations, no self-references, and all keys exist.

- [ ] **Step 4: Commit**

```bash
git add libs/tools.ts vitest.config.ts
git commit -m "feat(pdf-compress): register tool in tools registry and vitest config"
```

---

### Task 4: English i18n Files

**Files:**

- Create: `public/locales/en/pdf-compress.json`
- Modify: `public/locales/en/tools.json`

- [ ] **Step 1: Create English tool translation file**

```json
{
  "dropPdf": "Drop a PDF here or click to select",
  "supportedFormats": "Supports PDF files only",
  "quality": "Quality",
  "processing": "Processing page {current} of {total}...",
  "pages": "{count} pages",
  "reselect": "Reselect",
  "original": "Original",
  "compressed": "Compressed",
  "saved": "Saved",
  "onlyPdfSupported": "Only PDF files are supported",
  "encryptedPdf": "This PDF is encrypted and cannot be compressed",
  "corruptedPdf": "This PDF file is corrupted",
  "largePdf": "Large PDF ({size}) — processing may be slow",
  "manyPages": "PDF has {count} pages — processing may be slow",
  "encodingFailed": "Failed to compress PDF. Please try a different file.",
  "cannotCompress": "This PDF is already optimally compressed.",
  "descriptions": {
    "title": "About PDF Compressor",
    "aeoDefinition": "PDF Compressor is a free online tool that reduces PDF file size directly in your browser. Adjust image quality to balance file size and readability. No files are uploaded to any server.",
    "whatIsTitle": "What is the PDF Compressor?",
    "whatIs": "PDF Compressor reduces the file size of PDF documents by re-encoding each page as a JPEG image at the selected quality level. Use the quality slider to find the right balance between file size and visual clarity.",
    "stepsTitle": "How to Compress a PDF",
    "step1Title": "Drop or select a PDF",
    "step1Text": "Drag and drop a PDF file onto the drop zone, or click to browse your files.",
    "step2Title": "Adjust quality",
    "step2Text": "Use the quality slider to control compression level. Lower quality means smaller file size.",
    "step3Title": "Download compressed PDF",
    "step3Text": "Review the file size reduction and download the compressed PDF.",
    "p1": "All processing happens locally in your browser. Your PDF files are never uploaded to any server.",
    "p2": "The compression works by re-rendering each page as a JPEG image at the selected quality level. This is most effective for image-heavy PDFs like scanned documents. For merging multiple PDFs, use [PDF Merge](/pdf-merge).",
    "p3": "Text in the compressed PDF will be rasterized and may not be selectable. For text-heavy documents, use a moderate quality setting to preserve readability. To compress images instead, try [Image Compressor](/image-compress).",
    "faq1Q": "Will the compressed PDF maintain text selectability?",
    "faq1A": "No. The compression process rasterizes each page, which means text becomes part of the image and is no longer selectable or searchable. This is a trade-off of browser-based PDF compression.",
    "faq2Q": "Are my PDF files uploaded to a server?",
    "faq2A": "No. All PDF processing runs entirely in your browser. No data is sent to any server.",
    "faq3Q": "What is the maximum PDF size I can compress?",
    "faq3A": "There is no strict file size limit, but very large PDFs (>50MB) or PDFs with many pages (>200) may be slow to process. The tool will warn you before processing large files."
  }
}
```

- [ ] **Step 2: Add entry to `public/locales/en/tools.json`**

Insert a `pdf-compress` entry. Follow the existing `pdf-merge` entry format. English does NOT include `searchTerms`:

```json
"pdf-compress": {
  "title": "PDF Compressor - Reduce PDF File Size Online",
  "shortTitle": "PDF Compressor",
  "description": "Compress PDF files with adjustable quality. Reduce file size while maintaining readability. All processing runs in your browser."
}
```

Insert it after the `pdf-merge` entry in the JSON.

- [ ] **Step 3: Verify JSON is valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('public/locales/en/pdf-compress.json','utf8')); console.log('pdf-compress.json: OK')" && node -e "JSON.parse(require('fs').readFileSync('public/locales/en/tools.json','utf8')); console.log('tools.json: OK')"`

Expected: Both print "OK"

- [ ] **Step 4: Commit**

```bash
git add public/locales/en/pdf-compress.json public/locales/en/tools.json
git commit -m "feat(pdf-compress): add English i18n translations"
```

---

### Task 5: Page Route (Server Component)

**Files:**

- Create: `app/[locale]/pdf-compress/page.tsx`

- [ ] **Step 1: Create the route entry**

Follow `app/[locale]/pdf-merge/page.tsx` exactly — same imports, same `buildToolSchemas` structure, same JSON-LD injection:

```tsx
// app/[locale]/pdf-compress/page.tsx
import { getTranslations } from "next-intl/server";
import { generatePageMeta } from "../../../libs/seo";
import { buildToolSchemas } from "../../../components/json-ld";
import { TOOLS, TOOL_CATEGORIES, CATEGORY_SLUGS } from "../../../libs/tools";
import ToolPage from "./pdf-compress-page";

const PATH = "/pdf-compress";
const TOOL_KEY = "pdf-compress";
const tool = TOOLS.find((t) => t.key === TOOL_KEY)!;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "tools" });
  return generatePageMeta({
    locale,
    path: PATH,
    title: t("pdf-compress.title"),
    description: t("pdf-compress.description"),
    ogImage: { type: "tool", key: TOOL_KEY },
  });
}

export default async function PdfCompressRoute({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "tools" });
  const tx = await getTranslations({ locale, namespace: "pdf-compress" });
  const tc = await getTranslations({ locale, namespace: "categories" });
  const category = TOOL_CATEGORIES.find((c) => c.tools.includes(TOOL_KEY))!;
  const categorySlug = CATEGORY_SLUGS[category.key];

  const howToSteps = Array.from({ length: 3 }, (_, i) => ({
    name: tx(`descriptions.step${i + 1}Title`),
    text: tx(`descriptions.step${i + 1}Text`),
  })).filter((step) => step.name);

  const schemas = buildToolSchemas({
    name: t("pdf-compress.title"),
    description: tx.has("descriptions.aeoDefinition")
      ? tx("descriptions.aeoDefinition")
      : t("pdf-compress.description"),
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
      <ToolPage />
    </>
  );
}
```

- [ ] **Step 2: Verify the page compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to `pdf-compress/page.tsx`

- [ ] **Step 3: Commit**

```bash
git add app/\[locale\]/pdf-compress/page.tsx
git commit -m "feat(pdf-compress): add route entry server component"
```

---

### Task 6: Page Component (Client Component)

**Files:**

- Create: `app/[locale]/pdf-compress/pdf-compress-page.tsx`

This is the main UI task. The component follows `image-compress` patterns for debounce/staleness, rc-slider, and ImageInfoBar, and `pdf-merge` patterns for drop zone and PDF loading.

- [ ] **Step 1: Create the page component**

```tsx
// app/[locale]/pdf-compress/pdf-compress-page.tsx
"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import Layout from "../../../components/layout";
import PrivacyBanner from "../../../components/privacy-banner";
import DescriptionSection from "../../../components/description-section";
import RelatedTools from "../../../components/related-tools";
import ImageInfoBar from "../../../components/image/ImageInfoBar";
import { Download, RefreshCw, FileText } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { showToast } from "../../../libs/toast";
import { formatBytes } from "../../../utils/storage";
import { compressPdf } from "../../../libs/pdf-compress/compress";
import type { CompressProgress } from "../../../libs/pdf-compress/types";
import "rc-slider/assets/index.css";

const Slider = dynamic(() => import("rc-slider"), {
  ssr: false,
  loading: () => <div className="h-6 w-full animate-pulse bg-bg-input rounded" />,
});

const RENDER_DPI = 150;
const PDF_DPI = 72;
const SCALE_FACTOR = RENDER_DPI / PDF_DPI;

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

function Conversion() {
  const t = useTranslations("pdf-compress");
  const tc = useTranslations("common");

  // File state
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [arrayBuffer, setArrayBuffer] = useState<ArrayBuffer | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageDimensions, setPageDimensions] = useState({ width: 0, height: 0 });
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);

  // Compression state
  const [quality, setQuality] = useState(75);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState<CompressProgress | null>(null);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);

  // Refs
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const stalenessId = useRef(0);
  const initialLoadRef = useRef(true);

  async function loadPdf(file: File) {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      showToast(t("onlyPdfSupported"), "warning");
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      showToast(t("largePdf", { size: formatBytes(file.size, 1000, 1) }), "warning");
    }

    try {
      const buffer = await file.arrayBuffer();

      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

      const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer.slice(0)) }).promise;
      const count = pdf.numPages;

      if (count > 200) {
        showToast(t("manyPages", { count }), "warning");
      }

      // Get first page dimensions (in PDF points)
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 1 });
      const dimensions = { width: Math.round(viewport.width), height: Math.round(viewport.height) };

      // Render first page preview to offscreen canvas → data URL
      const previewScale = Math.min(800 / viewport.width, 600 / viewport.height, SCALE_FACTOR);
      const scaledViewport = page.getViewport({ scale: previewScale });
      const canvas = document.createElement("canvas");
      canvas.width = scaledViewport.width;
      canvas.height = scaledViewport.height;
      const ctx = canvas.getContext("2d")!;
      await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;
      const dataUrl = canvas.toDataURL("image/png");
      canvas.width = 0;
      canvas.height = 0;

      pdf.destroy();

      setSourceFile(file);
      setArrayBuffer(buffer);
      setNumPages(count);
      setPageDimensions(dimensions);
      setPreviewDataUrl(dataUrl);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.toLowerCase().includes("password") || msg.toLowerCase().includes("encrypt")) {
        showToast(t("encryptedPdf"), "danger");
      } else {
        showToast(t("corruptedPdf"), "danger");
      }
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    loadPdf(file);
  }

  // Drag-and-drop handling
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
      const files = e.dataTransfer?.files;
      if (!files || files.length === 0) return;
      const file = files[0];
      if (!file.name.toLowerCase().endsWith(".pdf")) {
        showToast(t("onlyPdfSupported"), "warning");
        return;
      }
      await loadPdf(file);
    };

    dropZone.addEventListener("dragover", onDragOver);
    dropZone.addEventListener("drop", onDrop);
    return () => {
      dropZone.removeEventListener("dragover", onDragOver);
      dropZone.removeEventListener("drop", onDrop);
    };
  }, [t]);

  // Compression pipeline with debounce (same pattern as image-compress)
  useEffect(() => {
    if (!arrayBuffer) return;

    const isInitial = initialLoadRef.current;
    initialLoadRef.current = false;

    let cancelled = false;
    const timer = setTimeout(
      async () => {
        if (cancelled) return;
        const callId = ++stalenessId.current;
        setProcessing(true);
        setProgress(null);

        try {
          const result = await compressPdf(arrayBuffer, quality, (p) => {
            // Only update progress if this is still the latest call
            if (callId === stalenessId.current) {
              setProgress(p);
            }
          });

          // Checkpoint 1: discard stale results
          if (callId !== stalenessId.current) return;

          // Check if compressed is larger than original
          if (result.length >= arrayBuffer.byteLength) {
            showToast(t("cannotCompress"), "info");
            setResultBlob(null);
          } else {
            const blob = new Blob([result], { type: "application/pdf" });
            setResultBlob(blob);
          }
        } catch {
          // Checkpoint 2: discard stale errors
          if (callId !== stalenessId.current) return;
          showToast(t("encodingFailed"), "danger");
          setResultBlob(null);
        } finally {
          // Checkpoint 3: only latest call resets processing state
          if (callId === stalenessId.current) {
            setProcessing(false);
            setProgress(null);
          }
        }
      },
      isInitial ? 0 : 300
    );

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [arrayBuffer, quality]);

  function handleReselect() {
    setSourceFile(null);
    setArrayBuffer(null);
    setNumPages(0);
    setPageDimensions({ width: 0, height: 0 });
    setPreviewDataUrl(null);
    setQuality(75);
    setProcessing(false);
    setProgress(null);
    setResultBlob(null);
    initialLoadRef.current = true;
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleDownload() {
    if (!resultBlob || !sourceFile) return;
    const baseName = sourceFile.name.replace(/\.[^.]+$/, "");
    const filename = `${baseName}-compressed.pdf`;
    const url = URL.createObjectURL(resultBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  const savedPercent =
    sourceFile && resultBlob && sourceFile.size > 0
      ? Math.round((1 - resultBlob.size / sourceFile.size) * 100)
      : 0;

  // Empty state — drop zone (same pattern as pdf-merge)
  if (!sourceFile) {
    return (
      <div
        ref={dropZoneRef}
        className="relative text-xl rounded-lg border-2 border-dashed border-accent-cyan/30 bg-accent-cyan-dim/10 text-accent-cyan"
        style={{ width: "100%", height: "12rem" }}
      >
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center justify-center px-4 pointer-events-none">
          <FileText size={32} className="mb-2" />
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
          onChange={handleFileSelect}
        />
      </div>
    );
  }

  // Loaded state — workspace (same layout as image-compress)
  return (
    <section className="mt-4">
      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6">
        {/* Controls panel (left, 280px) */}
        <div className="flex flex-col gap-4">
          {/* Quality slider */}
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

          {/* Page count display */}
          <div className="text-xs text-fg-muted bg-bg-surface rounded-lg p-3 border border-border-default">
            {t("pages", { count: numPages })}
          </div>

          {/* Action buttons */}
          <div className="flex flex-col gap-2 mt-auto pt-2 border-t border-border-default">
            <Button variant="secondary" size="md" onClick={handleReselect}>
              <RefreshCw size={14} />
              {t("reselect")}
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={handleDownload}
              disabled={!resultBlob || processing}
            >
              <Download size={14} />
              {tc("download")}
            </Button>
          </div>
        </div>

        {/* Preview panel (right) */}
        <div className="flex flex-col gap-3">
          <div className="relative rounded-lg border border-border-default bg-bg-input overflow-hidden">
            {previewDataUrl && (
              /* eslint-disable-next-line @next/next/no-img-element -- data URL preview */
              <img src={previewDataUrl} alt="PDF preview" className="w-full h-auto" />
            )}
            {processing && (
              <div className="absolute inset-0 bg-bg-base/80 flex items-center justify-center">
                <div className="text-center">
                  <div className="w-8 h-8 border-2 border-accent-cyan border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  <p className="text-sm text-fg-secondary">
                    {progress
                      ? t("processing", { current: progress.current, total: progress.total })
                      : t("processing", { current: 0, total: numPages })}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Info bar with ImageInfoBar */}
          {resultBlob && (
            <div className="flex items-center justify-between gap-4 text-xs text-fg-muted px-1">
              <ImageInfoBar
                original={{
                  label: t("original"),
                  fileSize: sourceFile.size,
                  format: "PDF",
                  dimensions: pageDimensions,
                }}
                result={{
                  label: t("compressed"),
                  fileSize: resultBlob.size,
                  format: "PDF",
                  dimensions: pageDimensions,
                }}
                savedPercent={savedPercent}
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default function PdfCompressPage() {
  const t = useTranslations("tools");
  return (
    <Layout
      title={t("pdf-compress.shortTitle")}
      categoryLabel={t("categories.visual")}
      categorySlug="visual-media"
    >
      <div className="container mx-auto px-4 pt-3 pb-6">
        <PrivacyBanner variant="files" />
        <Conversion />
        <DescriptionSection namespace="pdf-compress" />
        <RelatedTools currentTool="pdf-compress" />
      </div>
    </Layout>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors related to `pdf-compress`

- [ ] **Step 3: Verify dev server renders**

Run: `npm run dev`
Navigate to `http://localhost:3000/pdf-compress`
Expected: Page loads with drop zone, PrivacyBanner, description section, and related tools.

- [ ] **Step 4: Commit**

```bash
git add app/\[locale\]/pdf-compress/pdf-compress-page.tsx
git commit -m "feat(pdf-compress): add page client component with compression UI"
```

---

### Task 7: CJK Locale Translations

**Files:**

- Create: `public/locales/zh-CN/pdf-compress.json`
- Create: `public/locales/zh-TW/pdf-compress.json`
- Create: `public/locales/ja/pdf-compress.json`
- Create: `public/locales/ko/pdf-compress.json`
- Modify: `public/locales/zh-CN/tools.json`
- Modify: `public/locales/zh-TW/tools.json`
- Modify: `public/locales/ja/tools.json`
- Modify: `public/locales/ko/tools.json`

- [ ] **Step 1: Create `public/locales/zh-CN/pdf-compress.json`**

```json
{
  "dropPdf": "拖放 PDF 到此处，或点击选择",
  "supportedFormats": "仅支持 PDF 文件",
  "quality": "质量",
  "processing": "正在处理第 {current} 页，共 {total} 页...",
  "pages": "{count} 页",
  "reselect": "重新选择",
  "original": "原始文件",
  "compressed": "压缩后",
  "saved": "已节省",
  "onlyPdfSupported": "仅支持 PDF 文件",
  "encryptedPdf": "此 PDF 已加密，无法压缩",
  "corruptedPdf": "此 PDF 文件已损坏",
  "largePdf": "大型 PDF（{size}）— 处理可能较慢",
  "manyPages": "PDF 共 {count} 页 — 处理可能较慢",
  "encodingFailed": "PDF 压缩失败，请尝试其他文件。",
  "cannotCompress": "此 PDF 已经是最佳压缩状态。",
  "descriptions": {
    "title": "关于 PDF 压缩工具",
    "aeoDefinition": "PDF 压缩工具是一个免费的在线工具，可直接在浏览器中减小 PDF 文件大小。调节图片质量以平衡文件大小和可读性。文件不会上传到任何服务器。",
    "whatIsTitle": "什么是 PDF 压缩工具？",
    "whatIs": "PDF 压缩工具通过以选定质量级别将每页重新编码为 JPEG 图片来减小 PDF 文档的文件大小。使用质量滑块找到文件大小和视觉清晰度之间的最佳平衡。",
    "stepsTitle": "如何压缩 PDF",
    "step1Title": "拖入或选择 PDF",
    "step1Text": "将 PDF 文件拖放到上传区域，或点击浏览文件。",
    "step2Title": "调整质量",
    "step2Text": "使用质量滑块控制压缩级别。质量越低，文件越小。",
    "step3Title": "下载压缩后的 PDF",
    "step3Text": "查看文件大小缩减情况，下载压缩后的 PDF。",
    "p1": "所有处理均在浏览器本地完成，PDF 文件不会上传到任何服务器。",
    "p2": "压缩原理是将每页以选定质量重新渲染为 JPEG 图片。这对于扫描文档等图片密集型 PDF 最有效。如需合并多个 PDF，请使用 [PDF 合并](/pdf-merge)。",
    "p3": "压缩后的 PDF 中的文本将被栅格化，可能无法选择。对于文本密集型文档，建议使用适中的质量设置以保持可读性。如需压缩图片，请使用 [图片压缩](/image-compress)。",
    "faq1Q": "压缩后的 PDF 能保持文本可选中吗？",
    "faq1A": "不能。压缩过程会将每页栅格化为图片，文本成为图片的一部分，无法再被选中或搜索。这是浏览器端 PDF 压缩的固有限制。",
    "faq2Q": "我的 PDF 文件会上传到服务器吗？",
    "faq2A": "不会。所有 PDF 处理完全在浏览器中运行，数据不会发送到任何服务器。",
    "faq3Q": "最大支持压缩多大的 PDF？",
    "faq3A": "没有严格的文件大小限制，但超过 50MB 或超过 200 页的 PDF 处理可能较慢。工具会在处理大文件前发出警告。"
  }
}
```

- [ ] **Step 2: Add entry to `public/locales/zh-CN/tools.json`**

Insert after the `pdf-merge` entry:

```json
"pdf-compress": {
  "title": "PDF 压缩 - 在线减小 PDF 文件大小",
  "shortTitle": "PDF 压缩",
  "description": "可调质量的 PDF 压缩工具，在减小文件大小的同时保持可读性。所有处理在浏览器本地完成。",
  "searchTerms": "pdfyasuoqi pdfysq yasuo wendang tuxiang"
}
```

- [ ] **Step 3: Create `public/locales/zh-TW/pdf-compress.json`**

```json
{
  "dropPdf": "拖放 PDF 到此處，或點擊選擇",
  "supportedFormats": "僅支援 PDF 檔案",
  "quality": "品質",
  "processing": "正在處理第 {current} 頁，共 {total} 頁...",
  "pages": "{count} 頁",
  "reselect": "重新選擇",
  "original": "原始檔案",
  "compressed": "壓縮後",
  "saved": "已節省",
  "onlyPdfSupported": "僅支援 PDF 檔案",
  "encryptedPdf": "此 PDF 已加密，無法壓縮",
  "corruptedPdf": "此 PDF 檔案已損壞",
  "largePdf": "大型 PDF（{size}）— 處理可能較慢",
  "manyPages": "PDF 共 {count} 頁 — 處理可能較慢",
  "encodingFailed": "PDF 壓縮失敗，請嘗試其他檔案。",
  "cannotCompress": "此 PDF 已經是最佳壓縮狀態。",
  "descriptions": {
    "title": "關於 PDF 壓縮工具",
    "aeoDefinition": "PDF 壓縮工具是一個免費的線上工具，可直接在瀏覽器中減小 PDF 檔案大小。調節圖片品質以平衡檔案大小和可讀性。檔案不會上傳到任何伺服器。",
    "whatIsTitle": "什麼是 PDF 壓縮工具？",
    "whatIs": "PDF 壓縮工具透過以選定品質級別將每頁重新編碼為 JPEG 圖片來減小 PDF 文件的檔案大小。使用品質滑桿找到檔案大小和視覺清晰度之間的最佳平衡。",
    "stepsTitle": "如何壓縮 PDF",
    "step1Title": "拖入或選擇 PDF",
    "step1Text": "將 PDF 檔案拖放到上傳區域，或點擊瀏覽檔案。",
    "step2Title": "調整品質",
    "step2Text": "使用品質滑桿控制壓縮級別。品質越低，檔案越小。",
    "step3Title": "下載壓縮後的 PDF",
    "step3Text": "查看檔案大小縮減情況，下載壓縮後的 PDF。",
    "p1": "所有處理均在瀏覽器本機完成，PDF 檔案不會上傳到任何伺服器。",
    "p2": "壓縮原理是將每頁以選定品質重新渲染為 JPEG 圖片。這對於掃描文件等圖片密集型 PDF 最有效。如需合併多個 PDF，請使用 [PDF 合併](/pdf-merge)。",
    "p3": "壓縮後的 PDF 中的文字將被柵格化，可能無法選擇。對於文字密集型文件，建議使用適中的品質設定以保持可讀性。如需壓縮圖片，請使用 [圖片壓縮](/image-compress)。",
    "faq1Q": "壓縮後的 PDF 能保持文字可選取嗎？",
    "faq1A": "不能。壓縮過程會將每頁柵格化為圖片，文字成為圖片的一部分，無法再被選取或搜尋。這是瀏覽器端 PDF 壓縮的固有限制。",
    "faq2Q": "我的 PDF 檔案會上傳到伺服器嗎？",
    "faq2A": "不會。所有 PDF 處理完全在瀏覽器中執行，資料不會傳送到任何伺服器。",
    "faq3Q": "最大支援壓縮多大的 PDF？",
    "faq3A": "沒有嚴格的檔案大小限制，但超過 50MB 或超過 200 頁的 PDF 處理可能較慢。工具會在處理大檔案前發出警告。"
  }
}
```

- [ ] **Step 4: Add entry to `public/locales/zh-TW/tools.json`**

```json
"pdf-compress": {
  "title": "PDF 壓縮 - 線上減小 PDF 檔案大小",
  "shortTitle": "PDF 壓縮",
  "description": "可調品質的 PDF 壓縮工具，在減小檔案大小的同時保持可讀性。所有處理在瀏覽器本機完成。",
  "searchTerms": "pdfyasuoqi pdfysq yasuo wendang tuxiang"
}
```

- [ ] **Step 5: Create `public/locales/ja/pdf-compress.json`**

```json
{
  "dropPdf": "PDF をドラッグ＆ドロップ、またはクリックして選択",
  "supportedFormats": "PDF ファイルのみ対応",
  "quality": "品質",
  "processing": "ページ {current} / {total} を処理中...",
  "pages": "{count} ページ",
  "reselect": "再選択",
  "original": "元のファイル",
  "compressed": "圧縮後",
  "saved": "削減",
  "onlyPdfSupported": "PDF ファイルのみ対応しています",
  "encryptedPdf": "この PDF は暗号化されているため圧縮できません",
  "corruptedPdf": "この PDF ファイルは破損しています",
  "largePdf": "大きな PDF（{size}）— 処理に時間がかかる場合があります",
  "manyPages": "PDF は {count} ページあります — 処理に時間がかかる場合があります",
  "encodingFailed": "PDF の圧縮に失敗しました。別のファイルをお試しください。",
  "cannotCompress": "この PDF はすでに最適に圧縮されています。",
  "descriptions": {
    "title": "PDF 圧縮ツールについて",
    "aeoDefinition": "PDF 圧縮ツールは、ブラウザ上で直接 PDF ファイルサイズを縮小できる無料のオンラインツールです。画質を調整してファイルサイズと読みやすさのバランスをとります。ファイルはサーバーにアップロードされません。",
    "whatIsTitle": "PDF 圧縮ツールとは？",
    "whatIs": "PDF 圧縮ツールは、各ページを選択した品質レベルで JPEG 画像として再エンコードすることで PDF 文書のファイルサイズを縮小します。品質スライダーでファイルサイズと視覚的鮮明さのバランスを調整してください。",
    "stepsTitle": "PDF の圧縮方法",
    "step1Title": "PDF をドロップまたは選択",
    "step1Text": "PDF ファイルをドロップゾーンにドラッグ＆ドロップするか、クリックしてファイルを選択します。",
    "step2Title": "品質を調整",
    "step2Text": "品質スライダーで圧縮レベルを制御します。品質を下げるとファイルサイズが小さくなります。",
    "step3Title": "圧縮された PDF をダウンロード",
    "step3Text": "ファイルサイズの削減を確認し、圧縮された PDF をダウンロードします。",
    "p1": "すべての処理はブラウザ上でローカルに行われます。PDF ファイルがサーバーにアップロードされることはありません。",
    "p2": "圧縮は各ページを選択した品質で JPEG 画像として再レンダリングすることで機能します。スキャン文書などの画像中心の PDF に最も効果的です。複数の PDF を結合するには [PDF 結合](/pdf-merge) をご利用ください。",
    "p3": "圧縮された PDF 内のテキストはラスター化され、選択できなくなる場合があります。テキスト中心の文書では、読みやすさを保つために適度な品質設定を使用してください。画像を圧縮するには [画像圧縮](/image-compress) をお試しください。",
    "faq1Q": "圧縮後の PDF でテキストは選択できますか？",
    "faq1A": "いいえ。圧縮処理により各ページがラスター画像に変換されるため、テキストは画像の一部となり、選択や検索ができなくなります。これはブラウザベースの PDF 圧縮の制限です。",
    "faq2Q": "PDF ファイルはサーバーにアップロードされますか？",
    "faq2A": "いいえ。すべての PDF 処理はブラウザ上で実行され、データはサーバーに送信されません。",
    "faq3Q": "圧縮できる PDF の最大サイズは？",
    "faq3A": "厳密なファイルサイズ制限はありませんが、50MB を超えるファイルや 200 ページを超える PDF は処理に時間がかかる場合があります。大きなファイルを処理する前に警告が表示されます。"
  }
}
```

- [ ] **Step 6: Add entry to `public/locales/ja/tools.json`**

```json
"pdf-compress": {
  "title": "PDF 圧縮 - オンラインで PDF ファイルサイズを縮小",
  "shortTitle": "PDF 圧縮",
  "description": "品質調整可能な PDF 圧縮ツール。ファイルサイズを縮小しながら読みやすさを維持。すべての処理はブラウザ上で完結します。",
  "searchTerms": "pdfasshukuki pdfask asshuku bunsho"
}
```

- [ ] **Step 7: Create `public/locales/ko/pdf-compress.json`**

```json
{
  "dropPdf": "PDF를 드래그 앤 드롭하거나 클릭하여 선택",
  "supportedFormats": "PDF 파일만 지원",
  "quality": "품질",
  "processing": "{total}페이지 중 {current}페이지 처리 중...",
  "pages": "{count}페이지",
  "reselect": "다시 선택",
  "original": "원본",
  "compressed": "압축됨",
  "saved": "절약",
  "onlyPdfSupported": "PDF 파일만 지원합니다",
  "encryptedPdf": "암호화된 PDF는 압축할 수 없습니다",
  "corruptedPdf": "PDF 파일이 손상되었습니다",
  "largePdf": "큰 PDF({size}) — 처리가 느릴 수 있습니다",
  "manyPages": "PDF가 {count}페이지 있습니다 — 처리가 느릴 수 있습니다",
  "encodingFailed": "PDF 압축에 실패했습니다. 다른 파일을 시도해 주세요.",
  "cannotCompress": "이 PDF는 이미 최적으로 압축되어 있습니다.",
  "descriptions": {
    "title": "PDF 압축 도구 소개",
    "aeoDefinition": "PDF 압축 도구는 브라우저에서 직접 PDF 파일 크기를 줄일 수 있는 무료 온라인 도구입니다. 이미지 품질을 조정하여 파일 크기와 가독성의 균형을 맞추세요. 파일은 서버에 업로드되지 않습니다.",
    "whatIsTitle": "PDF 압축 도구란?",
    "whatIs": "PDF 압축 도구는 각 페이지를 선택한 품질 수준에서 JPEG 이미지로 재인코딩하여 PDF 문서의 파일 크기를 줄입니다. 품질 슬라이더로 파일 크기와 시각적 선명도의 균형을 조절하세요.",
    "stepsTitle": "PDF 압축 방법",
    "step1Title": "PDF 드롭 또는 선택",
    "step1Text": "PDF 파일을 드롭 영역에 드래그 앤 드롭하거나 클릭하여 파일을 선택합니다.",
    "step2Title": "품질 조정",
    "step2Text": "품질 슬라이더로 압축 수준을 제어합니다. 품질이 낮을수록 파일 크기가 작아집니다.",
    "step3Title": "압축된 PDF 다운로드",
    "step3Text": "파일 크기 감소를 확인하고 압축된 PDF를 다운로드합니다.",
    "p1": "모든 처리는 브라우저에서 로컬로 이루어집니다. PDF 파일은 서버에 업로드되지 않습니다.",
    "p2": "압축은 각 페이지를 선택한 품질로 JPEG 이미지로 다시 렌더링하여 작동합니다. 스캔한 문서와 같은 이미지 중심 PDF에 가장 효과적입니다. 여러 PDF를 병합하려면 [PDF 병합](/pdf-merge)을 사용하세요.",
    "p3": "압축된 PDF의 텍스트는 래스터화되어 선택할 수 없을 수 있습니다. 텍스트 중심 문서의 경우 가독성을 유지하기 위해 적당한 품질 설정을 사용하세요. 이미지를 압축하려면 [이미지 압축](/image-compress)을 사용해 보세요.",
    "faq1Q": "압축된 PDF에서 텍스트를 선택할 수 있나요?",
    "faq1A": "아니요. 압축 과정에서 각 페이지가 래스터 이미지로 변환되어 텍스트가 이미지의 일부가 되므로 더 이상 선택하거나 검색할 수 없습니다. 이는 브라우저 기반 PDF 압축의 한계입니다.",
    "faq2Q": "PDF 파일이 서버에 업로드되나요?",
    "faq2A": "아니요. 모든 PDF 처리는 브라우저에서 실행되며, 데이터는 서버로 전송되지 않습니다.",
    "faq3Q": "압축할 수 있는 PDF의 최대 크기는?",
    "faq3A": "엄격한 파일 크기 제한은 없지만, 50MB 이상의 파일이나 200페이지 이상의 PDF는 처리가 느릴 수 있습니다. 큰 파일을 처리하기 전에 경고가 표시됩니다."
  }
}
```

- [ ] **Step 8: Add entry to `public/locales/ko/tools.json`**

```json
"pdf-compress": {
  "title": "PDF 압축 - 온라인으로 PDF 파일 크기 줄이기",
  "shortTitle": "PDF 압축",
  "description": "품질 조절 가능한 PDF 압축 도구. 파일 크기를 줄이면서 가독성을 유지합니다. 모든 처리는 브라우저에서 이루어집니다.",
  "searchTerms": "pdfapchukgi pdfak apchuk munseo"
}
```

- [ ] **Step 9: Verify all CJK JSON files are valid**

Run: `for f in zh-CN zh-TW ja ko; do node -e "JSON.parse(require('fs').readFileSync('public/locales/$f/pdf-compress.json','utf8')); console.log('$f/pdf-compress.json: OK')"; done`

Expected: All 4 print "OK"

- [ ] **Step 10: Commit**

```bash
git add public/locales/zh-CN/pdf-compress.json public/locales/zh-CN/tools.json public/locales/zh-TW/pdf-compress.json public/locales/zh-TW/tools.json public/locales/ja/pdf-compress.json public/locales/ja/tools.json public/locales/ko/pdf-compress.json public/locales/ko/tools.json
git commit -m "feat(pdf-compress): add CJK locale translations (zh-CN, zh-TW, ja, ko)"
```

---

### Task 8: Latin Locale Translations

**Files:**

- Create: `public/locales/es/pdf-compress.json`
- Create: `public/locales/pt-BR/pdf-compress.json`
- Create: `public/locales/fr/pdf-compress.json`
- Create: `public/locales/de/pdf-compress.json`
- Create: `public/locales/ru/pdf-compress.json`
- Modify: `public/locales/es/tools.json`
- Modify: `public/locales/pt-BR/tools.json`
- Modify: `public/locales/fr/tools.json`
- Modify: `public/locales/de/tools.json`
- Modify: `public/locales/ru/tools.json`

- [ ] **Step 1: Create `public/locales/es/pdf-compress.json`**

```json
{
  "dropPdf": "Arrastra un PDF aquí o haz clic para seleccionar",
  "supportedFormats": "Solo se admiten archivos PDF",
  "quality": "Calidad",
  "processing": "Procesando página {current} de {total}...",
  "pages": "{count} páginas",
  "reselect": "Seleccionar otro",
  "original": "Original",
  "compressed": "Comprimido",
  "saved": "Ahorrado",
  "onlyPdfSupported": "Solo se admiten archivos PDF",
  "encryptedPdf": "Este PDF está cifrado y no se puede comprimir",
  "corruptedPdf": "Este archivo PDF está dañado",
  "largePdf": "PDF grande ({size}) — el procesamiento puede ser lento",
  "manyPages": "El PDF tiene {count} páginas — el procesamiento puede ser lento",
  "encodingFailed": "Error al comprimir el PDF. Intente con otro archivo.",
  "cannotCompress": "Este PDF ya está comprimido de forma óptima.",
  "descriptions": {
    "title": "Sobre el compresor de PDF",
    "aeoDefinition": "El compresor de PDF es una herramienta online gratuita que reduce el tamaño de archivos PDF directamente en tu navegador. Ajusta la calidad de imagen para equilibrar tamaño y legibilidad. No se suben archivos a ningún servidor.",
    "whatIsTitle": "¿Qué es el compresor de PDF?",
    "whatIs": "El compresor de PDF reduce el tamaño de los documentos PDF volviendo a codificar cada página como imagen JPEG en el nivel de calidad seleccionado. Usa el control deslizante de calidad para encontrar el equilibrio entre tamaño y claridad visual.",
    "stepsTitle": "Cómo comprimir un PDF",
    "step1Title": "Arrastra o selecciona un PDF",
    "step1Text": "Arrastra y suelta un archivo PDF en la zona de carga o haz clic para explorar tus archivos.",
    "step2Title": "Ajusta la calidad",
    "step2Text": "Usa el control deslizante de calidad para controlar el nivel de compresión. Menor calidad significa archivo más pequeño.",
    "step3Title": "Descarga el PDF comprimido",
    "step3Text": "Revisa la reducción de tamaño y descarga el PDF comprimido.",
    "p1": "Todo el procesamiento se realiza localmente en tu navegador. Tus archivos PDF nunca se suben a ningún servidor.",
    "p2": "La compresión funciona volviendo a renderizar cada página como imagen JPEG en el nivel de calidad seleccionado. Es más efectivo para PDFs con muchas imágenes como documentos escaneados. Para combinar varios PDFs, usa [Unir PDF](/pdf-merge).",
    "p3": "El texto del PDF comprimido se rasterizará y puede que no sea seleccionable. Para documentos con mucho texto, usa una configuración de calidad moderada para mantener la legibilidad. Para comprimir imágenes, prueba [Compresor de imágenes](/image-compress).",
    "faq1Q": "¿El PDF comprimido mantendrá la capacidad de seleccionar texto?",
    "faq1A": "No. El proceso de compresión rasteriza cada página, lo que significa que el texto se convierte en parte de la imagen y ya no es seleccionable ni buscable. Esta es una limitación de la compresión de PDF basada en navegador.",
    "faq2Q": "¿Se suben mis archivos PDF a un servidor?",
    "faq2A": "No. Todo el procesamiento de PDF se ejecuta completamente en tu navegador. No se envían datos a ningún servidor.",
    "faq3Q": "¿Cuál es el tamaño máximo de PDF que puedo comprimir?",
    "faq3A": "No hay un límite estricto de tamaño, pero PDFs muy grandes (>50MB) o con muchas páginas (>200) pueden ser lentos de procesar. La herramienta te avisará antes de procesar archivos grandes."
  }
}
```

- [ ] **Step 2: Add entry to `public/locales/es/tools.json`**

```json
"pdf-compress": {
  "title": "Compresor de PDF - Reduce el Tamaño de PDF Online",
  "shortTitle": "Compresor de PDF",
  "description": "Comprime archivos PDF con calidad ajustable. Reduce el tamaño manteniendo la legibilidad. Todo el procesamiento se realiza en tu navegador."
}
```

- [ ] **Step 3: Create `public/locales/pt-BR/pdf-compress.json`**

```json
{
  "dropPdf": "Arraste um PDF aqui ou clique para selecionar",
  "supportedFormats": "Somente arquivos PDF são suportados",
  "quality": "Qualidade",
  "processing": "Processando página {current} de {total}...",
  "pages": "{count} páginas",
  "reselect": "Selecionar outro",
  "original": "Original",
  "compressed": "Comprimido",
  "saved": "Economizado",
  "onlyPdfSupported": "Somente arquivos PDF são suportados",
  "encryptedPdf": "Este PDF está criptografado e não pode ser comprimido",
  "corruptedPdf": "Este arquivo PDF está corrompido",
  "largePdf": "PDF grande ({size}) — o processamento pode ser lento",
  "manyPages": "O PDF tem {count} páginas — o processamento pode ser lento",
  "encodingFailed": "Falha ao comprimir o PDF. Tente outro arquivo.",
  "cannotCompress": "Este PDF já está com compressão ideal.",
  "descriptions": {
    "title": "Sobre o Compressor de PDF",
    "aeoDefinition": "O Compressor de PDF é uma ferramenta online gratuita que reduz o tamanho de arquivos PDF diretamente no seu navegador. Ajuste a qualidade da imagem para equilibrar tamanho e legibilidade. Nenhum arquivo é enviado a servidores.",
    "whatIsTitle": "O que é o Compressor de PDF?",
    "whatIs": "O Compressor de PDF reduz o tamanho de documentos PDF recodificando cada página como imagem JPEG no nível de qualidade selecionado. Use o controle deslizante de qualidade para encontrar o equilíbrio entre tamanho e clareza visual.",
    "stepsTitle": "Como Comprimir um PDF",
    "step1Title": "Arraste ou selecione um PDF",
    "step1Text": "Arraste e solte um arquivo PDF na área de upload ou clique para procurar seus arquivos.",
    "step2Title": "Ajuste a qualidade",
    "step2Text": "Use o controle deslizante de qualidade para controlar o nível de compressão. Qualidade menor significa arquivo menor.",
    "step3Title": "Baixe o PDF comprimido",
    "step3Text": "Revise a redução de tamanho e baixe o PDF comprimido.",
    "p1": "Todo o processamento é feito localmente no seu navegador. Seus arquivos PDF nunca são enviados a nenhum servidor.",
    "p2": "A compressão funciona renderizando novamente cada página como imagem JPEG no nível de qualidade selecionado. É mais eficaz para PDFs com muitas imagens, como documentos digitalizados. Para mesclar vários PDFs, use [Mesclar PDF](/pdf-merge).",
    "p3": "O texto no PDF comprimido será rasterizado e pode não ser selecionável. Para documentos com muito texto, use uma configuração de qualidade moderada para manter a legibilidade. Para comprimir imagens, experimente o [Compressor de Imagens](/image-compress).",
    "faq1Q": "O PDF comprimido manterá a capacidade de selecionar texto?",
    "faq1A": "Não. O processo de compressão rasteriza cada página, o que significa que o texto se torna parte da imagem e não pode mais ser selecionado ou pesquisado. Esta é uma limitação da compressão de PDF baseada em navegador.",
    "faq2Q": "Meus arquivos PDF são enviados a um servidor?",
    "faq2A": "Não. Todo o processamento de PDF é executado inteiramente no seu navegador. Nenhum dado é enviado a qualquer servidor.",
    "faq3Q": "Qual é o tamanho máximo de PDF que posso comprimir?",
    "faq3A": "Não há um limite estrito de tamanho, mas PDFs muito grandes (>50MB) ou com muitas páginas (>200) podem ser lentos para processar. A ferramenta avisará antes de processar arquivos grandes."
  }
}
```

- [ ] **Step 4: Add entry to `public/locales/pt-BR/tools.json`**

```json
"pdf-compress": {
  "title": "Compressor de PDF - Reduza o Tamanho do PDF Online",
  "shortTitle": "Compressor de PDF",
  "description": "Comprima arquivos PDF com qualidade ajustável. Reduza o tamanho mantendo a legibilidade. Todo o processamento é feito no seu navegador."
}
```

- [ ] **Step 5: Create `public/locales/fr/pdf-compress.json`**

```json
{
  "dropPdf": "Déposez un PDF ici ou cliquez pour sélectionner",
  "supportedFormats": "Uniquement les fichiers PDF",
  "quality": "Qualité",
  "processing": "Traitement de la page {current} sur {total}...",
  "pages": "{count} pages",
  "reselect": "Resélectionner",
  "original": "Original",
  "compressed": "Compressé",
  "saved": "Économisé",
  "onlyPdfSupported": "Seuls les fichiers PDF sont pris en charge",
  "encryptedPdf": "Ce PDF est chiffré et ne peut pas être compressé",
  "corruptedPdf": "Ce fichier PDF est corrompu",
  "largePdf": "PDF volumineux ({size}) — le traitement peut être lent",
  "manyPages": "Le PDF contient {count} pages — le traitement peut être lent",
  "encodingFailed": "Échec de la compression du PDF. Veuillez essayer un autre fichier.",
  "cannotCompress": "Ce PDF est déjà compressé de manière optimale.",
  "descriptions": {
    "title": "À propos du compresseur PDF",
    "aeoDefinition": "Le compresseur PDF est un outil en ligne gratuit qui réduit la taille des fichiers PDF directement dans votre navigateur. Ajustez la qualité de l'image pour équilibrer taille et lisibilité. Aucun fichier n'est envoyé à un serveur.",
    "whatIsTitle": "Qu'est-ce que le compresseur PDF ?",
    "whatIs": "Le compresseur PDF réduit la taille des documents PDF en réencodant chaque page en image JPEG au niveau de qualité sélectionné. Utilisez le curseur de qualité pour trouver le bon équilibre entre taille et netteté visuelle.",
    "stepsTitle": "Comment compresser un PDF",
    "step1Title": "Déposez ou sélectionnez un PDF",
    "step1Text": "Glissez-déposez un fichier PDF dans la zone de dépôt ou cliquez pour parcourir vos fichiers.",
    "step2Title": "Ajustez la qualité",
    "step2Text": "Utilisez le curseur de qualité pour contrôler le niveau de compression. Une qualité inférieure signifie un fichier plus petit.",
    "step3Title": "Téléchargez le PDF compressé",
    "step3Text": "Vérifiez la réduction de taille et téléchargez le PDF compressé.",
    "p1": "Tout le traitement s'effectue localement dans votre navigateur. Vos fichiers PDF ne sont jamais envoyés à un serveur.",
    "p2": "La compression fonctionne en recréant chaque page en image JPEG au niveau de qualité sélectionné. C'est plus efficace pour les PDF riches en images comme les documents numérisés. Pour fusionner plusieurs PDF, utilisez [Fusion PDF](/pdf-merge).",
    "p3": "Le texte du PDF compressé sera rasterisé et pourrait ne pas être sélectionnable. Pour les documents riches en texte, utilisez un paramètre de qualité modéré pour préserver la lisibilité. Pour compresser des images, essayez [Compresseur d'images](/image-compress).",
    "faq1Q": "Le PDF compressé conservera-t-il la possibilité de sélectionner le texte ?",
    "faq1A": "Non. Le processus de compression rasterise chaque page, ce qui signifie que le texte devient partie intégrante de l'image et ne peut plus être sélectionné ou recherché. C'est une limitation de la compression PDF basée sur le navigateur.",
    "faq2Q": "Mes fichiers PDF sont-ils envoyés à un serveur ?",
    "faq2A": "Non. Tout le traitement PDF s'exécute entièrement dans votre navigateur. Aucune donnée n'est envoyée à un serveur.",
    "faq3Q": "Quelle est la taille maximale de PDF que je peux compresser ?",
    "faq3A": "Il n'y a pas de limite stricte de taille, mais les PDF très volumineux (>50 Mo) ou avec de nombreuses pages (>200) peuvent être longs à traiter. L'outil vous avertira avant de traiter les fichiers volumineux."
  }
}
```

- [ ] **Step 6: Add entry to `public/locales/fr/tools.json`**

```json
"pdf-compress": {
  "title": "Compresseur PDF - Réduire la Taille du PDF en Ligne",
  "shortTitle": "Compresseur PDF",
  "description": "Compressez vos fichiers PDF avec une qualité réglable. Réduisez la taille tout en maintenant la lisibilité. Tout le traitement s'effectue dans votre navigateur."
}
```

- [ ] **Step 7: Create `public/locales/de/pdf-compress.json`**

```json
{
  "dropPdf": "PDF hier ablegen oder klicken zum Auswählen",
  "supportedFormats": "Nur PDF-Dateien werden unterstützt",
  "quality": "Qualität",
  "processing": "Verarbeite Seite {current} von {total}...",
  "pages": "{count} Seiten",
  "reselect": "Neu auswählen",
  "original": "Original",
  "compressed": "Komprimiert",
  "saved": "Gespart",
  "onlyPdfSupported": "Nur PDF-Dateien werden unterstützt",
  "encryptedPdf": "Dieses PDF ist verschlüsselt und kann nicht komprimiert werden",
  "corruptedPdf": "Diese PDF-Datei ist beschädigt",
  "largePdf": "Großes PDF ({size}) — die Verarbeitung kann langsam sein",
  "manyPages": "Das PDF hat {count} Seiten — die Verarbeitung kann langsam sein",
  "encodingFailed": "PDF-Komprimierung fehlgeschlagen. Bitte versuchen Sie eine andere Datei.",
  "cannotCompress": "Dieses PDF ist bereits optimal komprimiert.",
  "descriptions": {
    "title": "Über den PDF-Kompressor",
    "aeoDefinition": "Der PDF-Kompressor ist ein kostenloses Online-Tool, das die PDF-Dateigröße direkt in Ihrem Browser reduziert. Passen Sie die Bildqualität an, um Dateigröße und Lesbarkeit auszubalancieren. Es werden keine Dateien auf einen Server hochgeladen.",
    "whatIsTitle": "Was ist der PDF-Kompressor?",
    "whatIs": "Der PDF-Kompressor reduziert die Dateigröße von PDF-Dokumenten, indem jede Seite als JPEG-Bild auf der gewählten Qualitätsstufe neu kodiert wird. Verwenden Sie den Qualitätsregler, um das richtige Gleichgewicht zwischen Dateigröße und visueller Schärfe zu finden.",
    "stepsTitle": "So komprimieren Sie ein PDF",
    "step1Title": "PDF ablegen oder auswählen",
    "step1Text": "Ziehen Sie eine PDF-Datei in die Ablagezone oder klicken Sie, um Ihre Dateien zu durchsuchen.",
    "step2Title": "Qualität anpassen",
    "step2Text": "Verwenden Sie den Qualitätsregler zur Steuerung der Komprimierungsstufe. Niedrigere Qualität bedeutet kleinere Datei.",
    "step3Title": "Komprimiertes PDF herunterladen",
    "step3Text": "Überprüfen Sie die Dateigrößenreduzierung und laden Sie das komprimierte PDF herunter.",
    "p1": "Die gesamte Verarbeitung erfolgt lokal in Ihrem Browser. Ihre PDF-Dateien werden niemals auf einen Server hochgeladen.",
    "p2": "Die Komprimierung erfolgt durch erneutes Rendern jeder Seite als JPEG-Bild auf der gewählten Qualitätsstufe. Dies ist am effektivsten bei bildreichen PDFs wie gescannten Dokumenten. Zum Zusammenführen mehrerer PDFs verwenden Sie [PDF zusammenführen](/pdf-merge).",
    "p3": "Text im komprimierten PDF wird gerastert und ist möglicherweise nicht mehr auswählbar. Verwenden Sie für textreiche Dokumente eine moderate Qualitätseinstellung, um die Lesbarkeit zu erhalten. Zum Komprimieren von Bildern versuchen Sie [Bildkompressor](/image-compress).",
    "faq1Q": "Wird das komprimierte PDF die Textauswahl beibehalten?",
    "faq1A": "Nein. Der Komprimierungsprozess rastert jede Seite, was bedeutet, dass der Text Teil des Bildes wird und nicht mehr auswählbar oder durchsuchbar ist. Dies ist eine Einschränkung der browserbasierten PDF-Komprimierung.",
    "faq2Q": "Werden meine PDF-Dateien auf einen Server hochgeladen?",
    "faq2A": "Nein. Die gesamte PDF-Verarbeitung läuft vollständig in Ihrem Browser ab. Es werden keine Daten an einen Server gesendet.",
    "faq3Q": "Wie groß darf ein PDF maximal sein?",
    "faq3A": "Es gibt keine strenge Dateigrößenbeschränkung, aber sehr große PDFs (>50 MB) oder PDFs mit vielen Seiten (>200) können langsam verarbeitet werden. Das Tool warnt Sie vor der Verarbeitung großer Dateien."
  }
}
```

- [ ] **Step 8: Add entry to `public/locales/de/tools.json`**

```json
"pdf-compress": {
  "title": "PDF-Kompressor - PDF-Dateigröße Online Reduzieren",
  "shortTitle": "PDF-Kompressor",
  "description": "Komprimieren Sie PDF-Dateien mit einstellbarer Qualität. Reduzieren Sie die Dateigröße bei erhaltener Lesbarkeit. Die gesamte Verarbeitung erfolgt in Ihrem Browser."
}
```

- [ ] **Step 9: Create `public/locales/ru/pdf-compress.json`**

```json
{
  "dropPdf": "Перетащите PDF сюда или нажмите для выбора",
  "supportedFormats": "Поддерживаются только PDF-файлы",
  "quality": "Качество",
  "processing": "Обработка страницы {current} из {total}...",
  "pages": "{count} стр.",
  "reselect": "Выбрать заново",
  "original": "Оригинал",
  "compressed": "Сжатый",
  "saved": "Экономия",
  "onlyPdfSupported": "Поддерживаются только PDF-файлы",
  "encryptedPdf": "Этот PDF зашифрован и не может быть сжат",
  "corruptedPdf": "Этот PDF-файл повреждён",
  "largePdf": "Большой PDF ({size}) — обработка может быть медленной",
  "manyPages": "PDF содержит {count} страниц — обработка может быть медленной",
  "encodingFailed": "Не удалось сжать PDF. Попробуйте другой файл.",
  "cannotCompress": "Этот PDF уже оптимально сжат.",
  "descriptions": {
    "title": "О сжатии PDF",
    "aeoDefinition": "Сжатие PDF — это бесплатный онлайн-инструмент, уменьшающий размер PDF-файлов прямо в вашем браузере. Настройте качество изображений для баланса между размером и читаемостью. Файлы не загружаются на сервер.",
    "whatIsTitle": "Что такое сжатие PDF?",
    "whatIs": "Инструмент сжатия PDF уменьшает размер PDF-документов путём перекодирования каждой страницы в JPEG-изображение на выбранном уровне качества. Используйте ползунок качества для баланса между размером файла и чёткостью.",
    "stepsTitle": "Как сжать PDF",
    "step1Title": "Перетащите или выберите PDF",
    "step1Text": "Перетащите PDF-файл в зону загрузки или нажмите для выбора файлов.",
    "step2Title": "Настройте качество",
    "step2Text": "Используйте ползунок качества для управления уровнем сжатия. Низкое качество — меньший размер файла.",
    "step3Title": "Скачайте сжатый PDF",
    "step3Text": "Ознакомьтесь с уменьшением размера и скачайте сжатый PDF.",
    "p1": "Вся обработка выполняется локально в вашем браузере. Ваши PDF-файлы никогда не загружаются на сервер.",
    "p2": "Сжатие работает путём повторного рендеринга каждой страницы как JPEG-изображения на выбранном уровне качества. Это наиболее эффективно для PDF с большим количеством изображений, таких как отсканированные документы. Для объединения нескольких PDF используйте [Объединение PDF](/pdf-merge).",
    "p3": "Текст в сжатом PDF будет растрирован и может быть недоступен для выделения. Для текстовых документов используйте умеренные настройки качества для сохранения читаемости. Для сжатия изображений попробуйте [Сжатие изображений](/image-compress).",
    "faq1Q": "Сохранится ли возможность выделения текста в сжатом PDF?",
    "faq1A": "Нет. Процесс сжатия растрирует каждую страницу, превращая текст в часть изображения. Он больше не будет доступен для выделения или поиска. Это ограничение браузерного сжатия PDF.",
    "faq2Q": "Загружаются ли мои PDF-файлы на сервер?",
    "faq2A": "Нет. Вся обработка PDF выполняется полностью в вашем браузере. Никакие данные не отправляются на сервер.",
    "faq3Q": "Какой максимальный размер PDF можно сжать?",
    "faq3A": "Строгого ограничения нет, но очень большие PDF (>50 МБ) или PDF с большим количеством страниц (>200) могут обрабатываться медленно. Инструмент предупредит вас перед обработкой больших файлов."
  }
}
```

- [ ] **Step 10: Add entry to `public/locales/ru/tools.json`**

```json
"pdf-compress": {
  "title": "Сжатие PDF - Уменьшить Размер PDF Онлайн",
  "shortTitle": "Сжатие PDF",
  "description": "Сжимайте PDF-файлы с настраиваемым качеством. Уменьшайте размер, сохраняя читаемость. Вся обработка выполняется в вашем браузере."
}
```

- [ ] **Step 11: Verify all Latin JSON files are valid**

Run: `for f in es pt-BR fr de ru; do node -e "JSON.parse(require('fs').readFileSync('public/locales/$f/pdf-compress.json','utf8')); console.log('$f/pdf-compress.json: OK')"; done`

Expected: All 5 print "OK"

- [ ] **Step 12: Commit**

```bash
git add public/locales/es/pdf-compress.json public/locales/es/tools.json public/locales/pt-BR/pdf-compress.json public/locales/pt-BR/tools.json public/locales/fr/pdf-compress.json public/locales/fr/tools.json public/locales/de/pdf-compress.json public/locales/de/tools.json public/locales/ru/pdf-compress.json public/locales/ru/tools.json
git commit -m "feat(pdf-compress): add Latin locale translations (es, pt-BR, fr, de, ru)"
```

---

## Self-Review

### 1. Spec Coverage

| Spec Requirement                                             | Task                                                      |
| ------------------------------------------------------------ | --------------------------------------------------------- |
| Core compression engine (Canvas re-rendering, JPEG, pdf-lib) | Task 1                                                    |
| Quality slider (1–100, default 75)                           | Task 6                                                    |
| First page preview                                           | Task 6 (`loadPdf` renders preview to data URL)            |
| File size comparison (original vs compressed) + ImageInfoBar | Task 6                                                    |
| Processing progress indicator                                | Task 6 (progress overlay)                                 |
| Debounce + staleness (immediate first, 300ms subsequent)     | Task 6 (3 checkpoints)                                    |
| Error: non-PDF file                                          | Task 6 (`loadPdf` validates type)                         |
| Error: encrypted PDF                                         | Task 6 (catch block checks "password"/"encrypt")          |
| Error: corrupted PDF                                         | Task 6 (catch block shows corrupted toast)                |
| Error: large file >50MB warning                              | Task 6 (`loadPdf` checks size)                            |
| Error: large page count >200 warning                         | Task 6 (`loadPdf` checks count)                           |
| Error: result larger than original                           | Task 6 (checks `result.length >= arrayBuffer.byteLength`) |
| Error: single page render failure (skip, continue)           | Task 1 (`compressPdf` try/catch per page)                 |
| Download: `basename-compressed.pdf`                          | Task 6 (`handleDownload`)                                 |
| Blob URL cleanup                                             | Task 6 (immediate revoke after click)                     |
| Memory management (canvas cleanup)                           | Task 1 (`canvas.width = 0`)                               |
| Tool registration (TOOLS, TOOL_CATEGORIES, TOOL_RELATIONS)   | Task 3                                                    |
| Full i18n (10 locales)                                       | Task 4 (en) + Task 7 (CJK) + Task 8 (Latin)               |
| SEO metadata + JSON-LD                                       | Task 5 (page.tsx server component)                        |
| Related tools integration                                    | Task 6 (`<RelatedTools>`)                                 |
| Unit tests                                                   | Task 2                                                    |
| vitest.config.ts update                                      | Task 3                                                    |
| CJK searchTerms                                              | Task 7 (zh-CN, zh-TW, ja, ko)                             |

**No gaps found.** All spec requirements covered.

### 2. Placeholder Scan

No instances of "TBD", "TODO", "implement later", "fill in details", "add appropriate error handling", "similar to Task N", or any steps without code blocks.

### 3. Type Consistency

- `CompressProgress` type defined in `types.ts` → imported as `CompressProgress` in `compress.ts` and `pdf-compress-page.tsx` ✓
- `compressPdf()` returns `Promise<Uint8Array>` → caller checks `result.length` ✓
- `validatePdfBuffer()` takes `ArrayBuffer` → called with `data` parameter ✓
- `mapQuality()` takes and returns `number` → called with `quality` (1–100) ✓
- `ImageInfoBar` props match `ImageInfoProps` interface: `{ label: string, fileSize: number, format: string, dimensions: { width: number, height: number } }` ✓
- `FORMAT_DISPLAY_NAMES["PDF"]` returns `"PDF"` via fallback (`fmt.toUpperCase()`) ✓
- `TOOL_RELATIONS` bidirectional: `pdf-compress` lists `["pdf-merge", "image-compress", "checksum"]` (3 relations), and each reverse relation includes `pdf-compress` ✓
