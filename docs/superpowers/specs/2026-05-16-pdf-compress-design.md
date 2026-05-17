# PDF Compressor — Design Spec

**Date**: 2026-05-16
**Status**: Draft
**Tool Key**: `pdf-compress`
**Route**: `/pdf-compress`
**Category**: `visual` (Visual & Media)

## Overview

Add a browser-based PDF compression tool to OmniKit. All processing runs entirely in the browser — no data is sent to any server. The tool uses Canvas re-rendering (pdf.js renders pages to Canvas, exports as JPEG at adjustable quality, pdf-lib assembles a new PDF).

## Technical Approach

### Engine: Canvas Re-rendering

```
PDF.js render page → Canvas → toBlob('image/jpeg', quality) → pdf-lib embedJpg → new PDF
```

**Key parameters:**

| Parameter    | Value                           | Rationale                                                                                                        |
| ------------ | ------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Render DPI   | 150 (fixed)                     | Balance between compression and readability. See [DPI discussion](#dpi-and-quality-notes) below.                 |
| JPEG quality | 1-100 (user slider, default 75) | Maps to `canvas.toBlob` quality parameter (0.01-1.0). Default raised from 65 to 75 to preserve text readability. |
| Scale factor | 150/72 ≈ 2.08x                  | PDF points (72 DPI) to pixel conversion                                                                          |

**Known trade-off:** This approach rasterizes text — compressed PDFs will not have selectable/searchable text. This is a fundamental limitation of browser-based PDF compression. The tool's description will document this clearly.

#### DPI and Quality Notes

- **150 DPI** is conservative for text-heavy PDFs. Screen reading typically needs 150-200 DPI, printing needs 300 DPI.
- **Quality default 75** (not 65) — PDF text readability requires higher quality than pure images. image-compress defaults to 80 for reference.
- If users report blurry text, consider adding a DPI preset (150/200/300) in a future iteration.

### Dependencies

| Package      | Status                                              | Bundle Impact      |
| ------------ | --------------------------------------------------- | ------------------ |
| `pdfjs-dist` | **Already installed** (v4.10.38, used by pdf-merge) | No additional cost |
| `pdf-lib`    | **Already installed** (v1.17.1, used by pdf-merge)  | No additional cost |

Total new bundle cost: **~0KB** — both dependencies are already loaded by pdf-merge.

**Existing infrastructure (no setup needed):**

- `next.config.js` already has `transpilePackages: ["pdfjs-dist"]`
- `public/pdf.worker.min.mjs` already copied via `"copy-pdf-worker"` npm script
- `next.config.js` already has `canvas: "./scripts/empty-module.js"` Turbopack alias for pdf.js

## File Structure

### New Files

```
app/[locale]/pdf-compress/
├── page.tsx                       # Route entry (server component): metadata, SEO, JSON-LD
└── pdf-compress-page.tsx          # Page component (client component): UI + business logic

libs/pdf-compress/
├── compress.ts                    # Core compression engine
├── types.ts                       # Type definitions
└── __tests__/
    └── compress.test.ts           # Unit tests

public/locales/en/pdf-compress.json   # English translations (source of truth)
public/locales/zh-CN/pdf-compress.json
public/locales/zh-TW/pdf-compress.json
public/locales/ja/pdf-compress.json
public/locales/ko/pdf-compress.json
public/locales/es/pdf-compress.json
public/locales/pt-BR/pdf-compress.json
public/locales/fr/pdf-compress.json
public/locales/de/pdf-compress.json
public/locales/ru/pdf-compress.json
```

> **Directory convention**: Follow `libs/pdf-merge/` pattern (one directory per tool), not a shared `libs/pdf/`.

### Modified Files

| File                                       | Change                                                                   |
| ------------------------------------------ | ------------------------------------------------------------------------ |
| `libs/tools.ts`                            | Register `pdf-compress` in TOOLS, TOOL_CATEGORIES.visual, TOOL_RELATIONS |
| `public/locales/{locale}/tools.json` (×10) | Add `pdf-compress` title, shortTitle, description                        |
| `vitest.config.ts`                         | Add `"libs/pdf-compress/**/*.test.ts"` to test scopes                    |

### Reused Components (no changes needed)

| Component            | From                | Usage                                        | Props / Notes                                                                       |
| -------------------- | ------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------- |
| `ImageInfoBar`       | `components/image/` | Original vs compressed size display + saved% | See [ImageInfoBar adaptation](#imageinfobar-adaptation-for-pdf) below               |
| `DescriptionSection` | `components/`       | SEO description + FAQ accordion              | `<DescriptionSection namespace="pdf-compress" faqCount={3} howToStepCount={3} />`   |
| `RelatedTools`       | `components/`       | Related tool links                           | `<RelatedTools currentTool="pdf-compress" />`                                       |
| `Layout`             | `components/`       | Page layout wrapper                          | `title`, `categoryLabel`, `categorySlug` props required                             |
| `PrivacyBanner`      | `components/`       | "All data stays in your browser" notice      | Use `variant="files"`                                                               |
| `rc-slider`          | existing dep        | Quality slider                               | Dynamic import with SSR disabled (see [rc-slider config](#rc-slider-configuration)) |

#### ImageInfoBar Adaptation for PDF

`ImageInfoBar` expects `original` and `result` props with shape `{ label, fileSize, format, dimensions }`. For PDF:

```tsx
<ImageInfoBar
  original={{
    label: t("original"),
    fileSize: sourceFile.size,
    format: "PDF",
    dimensions: { width: Math.round(pageWidth), height: Math.round(pageHeight) },
  }}
  result={{
    label: t("compressed"),
    fileSize: compressedSize,
    format: "PDF",
    dimensions: { width: Math.round(pageWidth), height: Math.round(pageHeight) },
  }}
  savedPercent={savedPercent}
/>
```

- `dimensions` uses the first page's PDF point size (from `page.getViewport({ scale: 1 })`)
- Page count and processing progress are displayed separately outside `ImageInfoBar`

#### rc-slider Configuration

```tsx
// CSS import (required)
import "rc-slider/assets/index.css";

// Dynamic import (SSR must be disabled)
const Slider = dynamic(() => import("rc-slider"), {
  ssr: false,
  loading: () => <div className="h-6 w-full animate-pulse bg-bg-input rounded" />,
});

// Style config (matches image-compress exactly)
const sliderStyles = {
  rail: { backgroundColor: "var(--border-default)", height: 4 },
  track: { backgroundColor: "var(--accent-cyan)", height: 4 },
  handle: {
    borderColor: "var(--accent-cyan)",
    backgroundColor: "var(--bg-surface)",
    height: 16,
    width: 16,
    marginLeft: -6, // Center handle on track
    marginTop: -6, // Center handle vertically
    boxShadow: "0 0 4px var(--accent-cyan)",
  },
};

// Usage
<Slider
  min={1}
  max={100}
  step={1}
  value={quality}
  onChange={(v) => setQuality(typeof v === "number" ? v : v[0])}
  styles={sliderStyles}
/>;
```

### Inline Components (built within pdf-compress-page.tsx)

| Component     | Rationale                                                                                                                                           |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| PDF Drop Zone | Inline drop zone with `accept=".pdf"`, using `FileText` icon. Follows pdf-merge's inline drop zone pattern (12rem height, opacity-0 input overlay). |
| PDF Preview   | Inline first-page Canvas preview rendered via pdf.js. No shared component needed.                                                                   |

## Page Template

### page.tsx (Server Component)

```tsx
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

### pdf-compress-page.tsx Structure (Client Component)

```tsx
"use client";

import { useTranslations } from "next-intl";
import Layout from "../../../components/layout";
import PrivacyBanner from "../../../components/privacy-banner";
import DescriptionSection from "../../../components/description-section";
import RelatedTools from "../../../components/related-tools";
import ImageInfoBar from "../../../components/image/ImageInfoBar";
// ... other imports

function Conversion() {
  const t = useTranslations("pdf-compress");
  // ... state and compression logic
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
        <DescriptionSection namespace="pdf-compress" faqCount={3} howToStepCount={3} />
        <RelatedTools currentTool="pdf-compress" />
      </div>
    </Layout>
  );
}
```

## UI Layout

### State 1: Empty (Drop Zone)

- Full-width drop zone with "Drop a PDF here or click to select" text
- "Supports PDF files only" subtitle
- Inline drop zone (same pattern as pdf-merge): `accept=".pdf"`, `FileText` icon from lucide-react
- Height: 12rem (matches pdf-merge)
- Input overlay: `opacity-0 absolute inset-0 w-full h-full cursor-pointer`

### State 2: Loaded (Workspace)

```
┌──────────────────────────────────────────────────────┐
│  ┌────────────┐  ┌─────────────────────────────────┐ │
│  │  Controls   │  │  Preview                       │ │
│  │             │  │                                 │ │
│  │  Quality    │  │  ┌───────────────────────────┐ │ │
│  │  ──●──────  │  │  │                           │ │ │
│  │    75       │  │  │  First page preview       │ │ │
│  │             │  │  │  (Canvas render via       │ │ │
│  │  ─────────  │  │  │   pdf.js)                 │ │ │
│  │  Reselect   │  │  │                           │ │ │
│  │  Download   │  │  └───────────────────────────┘ │ │
│  └────────────┘  └─────────────────────────────────┘ │
│  ┌──────────────────────────────────────────────────┐ │
│  │ Original: 4.2 MB PDF → Compressed: 1.1 MB       │ │
│  │ Saved: 74%  │  Pages: 12  │  Processing: 5/12   │ │
│  └──────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

**Layout**: `grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6` (identical to image-compress)

**Controls panel (left, 280px)**:

- Quality slider: rc-slider, min=1, max=100, step=1, default=75
- Reselect button (secondary)
- Download button (primary, disabled when `!resultBlob || processing`)

**Preview panel (right)**:

- First page rendered to Canvas via pdf.js
- Processing overlay with progress text "Processing page 5 of 12..."

**Info bar (bottom)**:

- `ImageInfoBar` component showing original size, compressed size, saved percentage
- Page count and processing progress displayed separately alongside ImageInfoBar

### Differences from image-compress

| Aspect            | image-compress                  | pdf-compress                                                  |
| ----------------- | ------------------------------- | ------------------------------------------------------------- |
| Preview           | CompareSlider (drag to compare) | First page static preview (no CompareSlider)                  |
| Quality range     | 1-100, default 80               | 1-100, default 75                                             |
| Info bar          | Image dimensions + format       | Page count + processing progress (dimensions from PDF points) |
| Processing        | Single image encode             | Multi-page sequential processing with progress                |
| Download filename | `basename + newExt`             | `basename + "-compressed.pdf"`                                |

## Data Flow

### Core Compression Pipeline

```
1. User drops PDF file
2. Validate: file.type === 'application/pdf'
3. Read file as ArrayBuffer
4. pdfjs.getDocument(arrayBuffer) → PDFDocumentProxy
5. Get page count (pdf.numPages)
6. Render first page to preview Canvas (scale = 150/72)
7. Display preview + page count

--- User adjusts quality slider ---

8. Debounce: immediate on first load, 300ms on subsequent changes
9. Create new PDFDocument via pdf-lib
10. For each page (1 to numPages):
    a. page.render({ canvasContext, viewport }) at 150 DPI
    b. canvas.toBlob('image/jpeg', quality/100)
    c. newDoc.embedJpg(jpegBytes)
    d. newPage.drawImage(jpegImage, { x:0, y:0, width, height })
    e. Update progress: "Processing page {i} of {total}"
11. newDoc.save() → Uint8Array
12. Check if compressed < original (see [Edge case](#compression-larger-than-original))
13. Create Blob → filename: `basename-compressed.pdf`
14. Display compressed size + saved%
```

### Debounce and Staleness

Follows the exact pattern from image-compress with three staleness checkpoints:

```tsx
const stalenessId = useRef(0);
const initialLoadRef = useRef(true);

useEffect(() => {
  if (!sourceFile) return;

  const isInitial = initialLoadRef.current;
  initialLoadRef.current = false;

  let cancelled = false;
  const timer = setTimeout(
    async () => {
      if (cancelled) return;
      const callId = ++stalenessId.current;
      setProcessing(true);

      try {
        const result = await compressPdf(/* ... */);

        // Checkpoint 1: discard stale results
        if (callId !== stalenessId.current) return;

        setResultBlob(result);
        // ... update state
      } catch {
        // Checkpoint 2: discard stale errors
        if (callId !== stalenessId.current) return;
        // ... handle error
      } finally {
        // Checkpoint 3: only latest call resets processing state
        if (callId === stalenessId.current) setProcessing(false);
      }
    },
    isInitial ? 0 : 300 // First load: immediate. Subsequent: 300ms debounce.
  );

  return () => {
    cancelled = true;
    clearTimeout(timer);
  };
}, [sourceFile, quality]);
```

### Download and Blob URL Management

```tsx
// Download: derive filename from original
function handleDownload(blob: Blob) {
  if (!sourceFile) return;
  const baseName = sourceFile.name.replace(/\.[^.]+$/, "");
  const filename = `${baseName}-compressed.pdf`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url); // Immediate cleanup after click
}

// Blob URL cleanup on re-compression
setResultUrl((prev) => {
  if (prev) URL.revokeObjectURL(prev); // Revoke old URL before setting new one
  return URL.createObjectURL(newBlob);
});
```

### Memory Management

- Revoke previous Blob URLs on re-compression (in state setter callback)
- Clear Canvas after each page render (`canvas.getContext('2d').clearRect(...)`)
- Null out `ArrayBuffer` references after compression completes

### Compression Larger Than Original

Some PDFs (especially text-heavy or already-compressed files) may produce a **larger** file after JPEG re-encoding. Handle this:

```tsx
if (compressedSize >= originalSize) {
  // Show info toast: "This PDF cannot be further compressed — the original is already optimal."
  // Disable download button or offer to download the original instead.
  setResultBlob(null); // Discard the larger result
}
```

Add corresponding i18n key: `"cannotCompress": "This PDF is already optimally compressed."`

## Error Handling

| Error                       | Detection                         | User Message                                                    |
| --------------------------- | --------------------------------- | --------------------------------------------------------------- |
| Non-PDF file                | `file.type !== 'application/pdf'` | Toast: "Only PDF files are supported"                           |
| Encrypted PDF               | pdf.js throws on `getDocument`    | Toast: "This PDF is encrypted and cannot be compressed"         |
| Corrupted PDF               | pdf.js parse error                | Toast: "This PDF file is corrupted"                             |
| Single page render failure  | `page.render()` throws            | Skip page, log warning, continue to next page                   |
| Large file (>50MB)          | `file.size > 50 * 1024 * 1024`    | Warning toast: "Large PDF ({size}) — processing may be slow"    |
| Large page count (>200)     | `pdf.numPages > 200`              | Warning toast: "PDF has {count} pages — processing may be slow" |
| Result larger than original | `compressedSize >= originalSize`  | Info toast: "This PDF is already optimally compressed"          |

## Tool Registration

### libs/tools.ts

```typescript
// Import (FileText — FileDown is already used by image-compress)
import { FileText } from "lucide-react";

// TOOLS array
{
  key: "pdf-compress",
  path: "/pdf-compress",
  icon: FileText,
  emoji: "🗜️",
  sameAs: [
    "https://en.wikipedia.org/wiki/PDF",
    "https://developer.mozilla.org/en-US/docs/Glossary/PDF",
  ],
}

// TOOL_CATEGORIES — add to visual category
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
    "pdf-compress",  // NEW
  ],
}

// TOOL_RELATIONS — bidirectional
"pdf-compress": ["pdf-merge", "image-compress", "checksum"],
// Update reverse relations:
"pdf-merge": [...existing, "pdf-compress"],
"image-compress": [...existing, "pdf-compress"],
"checksum": [...existing, "pdf-compress"],
```

### i18n — tools.json (per locale)

```json
{
  "pdf-compress": {
    "title": "PDF Compressor - Reduce PDF File Size Online",
    "shortTitle": "PDF Compressor",
    "description": "Compress PDF files with adjustable quality. Reduce file size while maintaining readability. All processing runs in your browser."
  }
}
```

> **Note**: English `tools.json` does NOT include `searchTerms`. Only CJK locales need them.

### i18n — pdf-compress.json

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
  "encodingFailed": "Failed to compress page {page}",
  "cannotCompress": "This PDF is already optimally compressed.",
  "descriptions": {
    "title": "About PDF Compressor",
    "aeoDefinition": "PDF Compressor is a free online tool that reduces PDF file size directly in your browser. Adjust image quality to balance file size and readability. No files are uploaded to any server.",
    "whatIsTitle": "What is the PDF Compressor?",
    "whatIs": "PDF Compressor reduces the file size of PDF documents by re-encoding embedded images at a lower quality. Use the quality slider to find the right balance between file size and visual clarity.",
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

> **Internal links**: `p2` and `p3` include Markdown-format links to related tools (`[PDF Merge](/pdf-merge)`, `[Image Compressor](/image-compress)`). These are rendered by the `linked-text` utility.

### CJK searchTerms

Format: `<romanized full> <romanized initials> <keyword1> <keyword2> <keyword3>`

| Locale | searchTerms                               | Breakdown                                                      |
| ------ | ----------------------------------------- | -------------------------------------------------------------- |
| zh-CN  | `pdfyasuoqi pdfysq yasuo wendang tuxiang` | PDF压缩器 → yā-suō-qì, initials: ysq, keywords: 压缩/文档/图像 |
| zh-TW  | `pdfyasuoqi pdfysq yasuo wendang tuxiang` | Same romanization, Traditional Chinese context                 |
| ja     | `pdfasshukuki pdfask asshuku bunsho`      | PDF圧縮機 → a-sshu-ku-ki, initials: ask, keywords: 圧縮/文書   |
| ko     | `pdfapchukgi pdfak apchuk munseo`         | PDF압축기 → a-pchu-k-gi, initials: ak, keywords: 압축/문서     |

Note: Latin-script locales (es, pt-BR, fr, de, ru) and English do not need searchTerms.

## Testing

### Unit Tests (`libs/pdf-compress/__tests__/compress.test.ts`)

Test the core `compressPdf` function:

| Test Case                   | Description                                             |
| --------------------------- | ------------------------------------------------------- |
| Basic compression           | Valid PDF buffer → compressed PDF buffer (smaller size) |
| Quality mapping             | Quality 1 produces smaller output than quality 100      |
| Empty PDF                   | Handle single-page PDF correctly                        |
| Encrypted PDF               | Throw descriptive error                                 |
| Invalid buffer              | Throw descriptive error for non-PDF input               |
| Result larger than original | Return null or flag that compression increased size     |

### vitest.config.ts

Add to test scopes:

```ts
"libs/pdf-compress/**/*.test.ts",
```

### Tool Relations Test

Existing `libs/__tests__/tool-relations.test.ts` automatically validates:

- Every tool has 2-5 relations
- No self-references
- Bidirectional consistency
- All referenced tools exist

## Performance Considerations

### Web Worker (Recommended)

Multi-page PDF compression blocks the main thread. The codebase already uses Web Workers for `regex` and `diff` tools. Consider offloading the compression loop to a Web Worker for PDFs with >5 pages:

```
Main Thread                    Worker Thread
    │                              │
    ├─ postMessage({pdf, quality}) ├─ receive message
    │                              ├─ for each page: render + compress
    │  ← postMessage({progress}) ← ├─ postMessage progress updates
    │                              ├─ postMessage({result})
    ├─ receive compressed PDF  ← ──┤
```

This can be added as a follow-up optimization if user feedback indicates UI jank on multi-page PDFs.

## Scope Boundaries

### In Scope

- Single PDF file compression
- Quality slider (1-100, default 75)
- First page preview
- File size comparison (original vs compressed)
- Processing progress indicator
- Error handling for common failure modes (including "already optimal" case)
- Full i18n support (10 locales)
- SEO metadata + JSON-LD structured data
- Related tools integration

### Out of Scope

- Batch compression of multiple PDFs
- Per-page quality settings
- Preset compression levels (Light/Medium/Strong)
- DPI selection (fixed at 150 for v1)
- PDF-to-image conversion
- PDF merge/split operations
- Preserving text selectability
- OCR capabilities
- Ghostscript WASM integration
- Web Worker for compression (v1: main thread; add if needed based on feedback)
