# PDF Split Tool Design

## Summary

A browser-based PDF splitting tool that supports three modes: extract every page, split by page ranges, and hand-pick specific pages. All processing runs client-side using existing dependencies (pdf-lib + pdfjs-dist + fflate). Zero new dependencies.

## Requirements

### Split Modes

1. **Extract Every Page** — split PDF so each page becomes a separate PDF file
2. **Split by Range** — define page ranges (e.g., 1-3, 4-6), each range produces one output file
3. **Select Pages** — click thumbnails to pick pages, optionally group them into multiple output files

### Output

- ZIP download containing all split files (using fflate)
- Individual download button per split file
- Filenames include page range: `pages_1-3.pdf`, `pages_4-6.pdf`, `page_1.pdf`

### Page Preview

- Render page thumbnails via pdfjs-dist (canvas → data URL)
- Lazy rendering for large PDFs (>30 pages) using Intersection Observer
- Thumbnail height: ~120px, width proportional to page aspect ratio
- Thumbnails support click-to-select in "Select Pages" mode

## Architecture

### Route & Registration

- **Route**: `/pdf-split`
- **Tool key**: `pdf-split`
- **Category**: Visual & Media (`visual`)
- **Icon**: `Scissors` (lucide-react)
- **Emoji**: `✂️`
- **sameAs**: `["https://www.adobe.com/acrobat/online/split-pdf.html"]`
- **Related tools**: pdf-merge, image-compress, image-convert

### File Structure

```
app/[locale]/pdf-split/
├── page.tsx                    # Route entry: generateMetadata + JSON-LD schemas + PdfSplitPage
└── pdf-split-page.tsx          # Client component: UI + logic

libs/pdf-split/
├── split.ts                    # Core split logic (pdf-lib copyPages) + getPdfPageCount
├── thumbnail.ts                # Thumbnail rendering (pdfjs-dist → canvas)
└── __tests__/
    └── split.test.ts           # Unit tests for split logic
```

### Dependencies (all existing)

| Package         | Version | Purpose                                                 |
| --------------- | ------- | ------------------------------------------------------- |
| `pdf-lib`       | 1.17.1  | PDF page manipulation (copyPages, save)                 |
| `pdfjs-dist`    | 4.10.38 | Page thumbnail rendering                                |
| `fflate`        | ^0.8.2  | ZIP archive generation for batch download               |
| `file-selector` | —       | Unified drag-and-drop file handling (matches pdf-merge) |

## Core Logic

### `libs/pdf-split/split.ts`

```typescript
import { PDFDocument } from "pdf-lib";

type SplitMode = "extract-all" | "by-range" | "select-pages";

interface ExtractAllOptions {
  mode: "extract-all";
}

interface SplitByRangeOptions {
  mode: "by-range";
  ranges: { from: number; to: number }[]; // 1-indexed, inclusive
}

interface SelectPagesOptions {
  mode: "select-pages";
  groups: number[][]; // Each group is 0-indexed page indices
}

type SplitOptions = ExtractAllOptions | SplitByRangeOptions | SelectPagesOptions;

interface SplitResult {
  name: string; // e.g., "pages_1-3.pdf"
  bytes: Uint8Array;
}

interface SplitProgress {
  current: number;
  total: number;
}

// Get page count for the source PDF
async function getPdfPageCount(data: ArrayBuffer): Promise<number> {
  const doc = await PDFDocument.load(new Uint8Array(data.slice(0)), {
    ignoreEncryption: true,
  });
  return doc.getPageCount();
}

// Split PDF into multiple files based on mode
async function splitPdf(
  sourceData: ArrayBuffer,
  options: SplitOptions,
  onProgress?: (progress: SplitProgress) => void
): Promise<SplitResult[]>;
```

Implementation notes:

- Uses `data.slice(0)` to copy buffer before passing to pdf-lib (prevents ownership transfer)
- `PDFDocument.load()` → `copyPages()` → `addPage()` → `save()` from pdf-lib
- Encrypted PDFs handled with `ignoreEncryption: true`
- `onProgress` callback fires once per output file (for progress bar UI)
- Input type is `ArrayBuffer` (matches `file.arrayBuffer()` return type), internally converts to `Uint8Array`

### `libs/pdf-split/thumbnail.ts`

```typescript
export async function renderPageThumbnail(
  data: ArrayBuffer,
  pageIndex: number, // 0-indexed (unlike pdf-merge which always renders page 1)
  maxWidth = 120,
  maxHeight = 160
): Promise<string>; // PNG data URL
```

Implementation notes:

- **Dynamic import**: `const pdfjs = await import("pdfjs-dist")` to reduce initial bundle
- **Worker setup**: `pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"` (copied via `copy-pdf-worker` build script)
- **Buffer copy**: `new Uint8Array(data.slice(0))` to prevent pdfjs-dist from detaching the ArrayBuffer
- **Scale calculation**: `Math.min(maxWidth / viewport.width, maxHeight / viewport.height)` for consistent thumbnail size regardless of page dimensions
- **Offscreen canvas**: `document.createElement("canvas")`, render page, export as `canvas.toDataURL("image/png")`
- **Cleanup**: `pdf.destroy()`, `canvas.width = 0`, `canvas.height = 0` after rendering to free memory
- Returns PNG (not JPEG) to preserve transparency and avoid compression artifacts on text

### ZIP Generation

```typescript
import { zipSync } from "fflate";

function downloadAsZip(files: SplitResult[]): void {
  const zipData: Record<string, Uint8Array> = {};
  for (const file of files) {
    zipData[file.name] = file.bytes;
  }
  const zipBytes = zipSync(zipData);
  const blob = new Blob([zipBytes], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "split-pages.zip";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadFile(file: SplitResult): void {
  const blob = new Blob([file.bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
```

Note: Uses Blob + ObjectURL pattern (matches pdf-merge download logic). `setTimeout` delay ensures download starts before URL is revoked.

## UI Design

### Component Architecture (follows pdf-merge three-component pattern)

Three components in `pdf-split-page.tsx`:

- `Conversion` — main interaction component, all state and logic
- `Description` — description/FAQ section (via `DescriptionSection`)
- `PdfSplitPage` (default export) — layout wrapper with `<Layout>`, `<PrivacyBanner>`, `<RelatedTools>`

### Layout

Single-column layout (matches pdf-merge pattern). Three visual states:

**State 1 — Empty (drop zone):**

```
┌──────────────────────────────────────────┐
│                                          │
│     📑                                   │
│     Drop PDF file here or click          │
│     Supports PDF files only              │
│                                          │
└──────────────────────────────────────────┘
```

**State 2 — Loaded (controls + thumbnail grid):**

```
┌──────────────────────────────────────────┐
│ ┌──────────────────────────────────────┐ │
│ │ Mode: ● Extract All  ○ By Range...  │ │
│ └──────────────────────────────────────┘ │
│                                          │
│ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐     │
│ │ P1 │ │ P2 │ │ P3 │ │ P4 │ │ P5 │     │
│ │    │ │    │ │    │ │    │ │    │     │
│ └────┘ └────┘ └────┘ └────┘ └────┘     │
│ ┌────┐ ┌────┐                           │
│ │ P6 │ │ P7 │  ... 12 pages total       │
│ │    │ │    │                           │
│ └────┘ └────┘                           │
│                                          │
│ [Mode-specific params, e.g. range list]  │
│                                          │
│         [ Split PDF ]                    │
└──────────────────────────────────────────┘
```

**State 3 — Results (after split):**

```
┌──────────────────────────────────────────┐
│            ✅                            │
│      Split successfully!                 │
│  3 files generated — 12 pages total      │
│                                          │
│  pages_1-5.pdf   45 KB    [⬇ Download]  │
│  pages_6-10.pdf  38 KB    [⬇ Download]  │
│  pages_11-12.pdf 12 KB    [⬇ Download]  │
│                                          │
│  [ Download All as ZIP ]                 │
│  [ New Split ]                           │
└──────────────────────────────────────────┘
```

### State

```typescript
// Source file
const [sourceFile, setSourceFile] = useState<File | null>(null);
const [sourceData, setSourceData] = useState<ArrayBuffer | null>(null);
const [pageCount, setPageCount] = useState(0);

// Thumbnails (pageIndex → data URL, lazy-populated)
const [thumbnails, setThumbnails] = useState<Map<number, string>>(new Map());

// Mode & params
const [mode, setMode] = useState<SplitMode>("extract-all");
const [ranges, setRanges] = useState<{ from: number; to: number }[]>([]);
const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
const [groups, setGroups] = useState<number[][]>([[]]);

// Processing
const [processing, setProcessing] = useState(false);
const [progress, setProgress] = useState<SplitProgress | null>(null);
const [results, setResults] = useState<SplitResult[]>([]);
const [error, setError] = useState<string | null>(null);
```

### Memory Management (critical for large PDFs)

```typescript
// Refs for cleanup on unmount
const sourceDataRef = useRef<ArrayBuffer | null>(null);
const thumbnailsRef = useRef<Map<number, string>>(new Map());

// Sync refs
useEffect(() => {
  sourceDataRef.current = sourceData;
}, [sourceData]);
useEffect(() => {
  thumbnailsRef.current = thumbnails;
}, [thumbnails]);

// Release all data on unmount
useEffect(() => {
  return () => {
    sourceDataRef.current = null;
    thumbnailsRef.current.clear();
  };
}, []);
```

### Drop Zone (uses `file-selector` library)

```typescript
import { fromEvent } from "file-selector";

// Drag-and-drop file handling (matches pdf-merge pattern)
const onDrop = async (e: DragEvent) => {
  e.preventDefault();
  e.stopPropagation();
  const dropped = await fromEvent(e);
  const pdfFiles = (dropped as File[]).filter((f) => f.name.toLowerCase().endsWith(".pdf"));
  if (pdfFiles.length === 0) {
    showToast(t("onlyPdfSupported"), "warning");
    return;
  }
  // Load first PDF only (single-file tool)
  await loadPdf(pdfFiles[0]);
};

// File input handler
async function handleFileInput(fileList: FileList | null) {
  if (!fileList || fileList.length === 0) return;
  const file = fileList[0];
  if (!file.name.toLowerCase().endsWith(".pdf")) {
    showToast(t("onlyPdfSupported"), "warning");
    return;
  }
  await loadPdf(file);
}
```

### Interaction Details

**Empty state**: File drop zone (reuse existing drop zone pattern from pdf-merge / image tools).

**Extract All mode**: No additional controls. Click Split → generate N files. One-click workflow.

**By Range mode**: Dynamic range list below mode tabs. Each row: `[from] - [to] [×]`. `[+ Add Range]` button. Validate: ranges must be within 1..pageCount, no overlaps (warn, don't block). Selected ranges highlight corresponding thumbnails with cyan border.

**Select Pages mode**: Click thumbnail to toggle selection (checkbox overlay). Selected pages highlighted with cyan border. Control bar shows: `[Select All]` `[Deselect All]` `[New Group]`. First group is default. "New Group" creates a second group with distinct color accent. Each group produces one output file.

**Results area**: Appears below thumbnails after split. Each result shows filename + file size + individual download button. "Download All as ZIP" button at bottom.

### Thumbnail Rendering Strategy

- ≤ 30 pages: render all thumbnails immediately with bounded concurrency (`THUMBNAIL_CONCURRENCY = 3`, matches pdf-merge pattern)
- \> 30 pages: Intersection Observer, render only visible + 5-row buffer
- Thumbnail size: fit within 120×160px bounding box, proportional to page aspect ratio
- Grid: `grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5`

### Performance Considerations

- Thumbnail rendering uses bounded concurrency (3 parallel, matches pdf-merge) — not unlimited parallelism to avoid memory spikes, and not fully sequential to avoid slow UX on large PDFs
- PDF loading uses `ignoreEncryption: true` for encrypted files
- Large files (>50MB) show progress indicator during split via `onProgress` callback
- Source data kept in memory only while tool is active (cleanup on unmount via refs pattern)
- `data.slice(0)` buffer copy before passing to pdf-lib / pdfjs-dist (prevents ownership transfer/detach)

## Tool Registration

### `libs/tools.ts`

```typescript
// 1. Add Scissors to lucide-react imports at top of file
import { /* ...existing imports... */, Scissors } from "lucide-react";

// 2. Add entry to TOOLS array
{
  key: "pdf-split",
  path: "/pdf-split",
  icon: Scissors,
  emoji: "✂️",
  sameAs: [
    "https://www.adobe.com/acrobat/online/split-pdf.html",
  ],
}

// 3. TOOL_CATEGORIES: add "pdf-split" to visual category tools array
//    (after "pdf-merge" in the tools list)
{
  key: "visual",
  tools: [
    // ...existing tools...
    "pdf-merge",
    "pdf-split",    // <-- add here
  ],
}

// 4. TOOL_RELATIONS: add bidirectional relations
"pdf-split": ["pdf-merge", "image-compress", "image-convert"],
// Also add "pdf-split" to pdf-merge's existing relations array:
"pdf-merge": ["image-compress", "image-convert", "checksum", "pdf-split"],
```

### i18n Files

Two types of i18n files per locale:

1. **`public/locales/{locale}/tools.json`** — SEO metadata entry (title, shortTitle, description, searchTerms)
2. **`public/locales/{locale}/pdf-split.json`** — all UI strings (flat key structure, matching pdf-merge pattern)

#### `public/locales/en/tools.json` (add entry)

```json
"pdf-split": {
  "title": "PDF Split - Split PDF into Pages or Ranges",
  "shortTitle": "PDF Split",
  "description": "Split a PDF into separate pages, custom ranges, or hand-picked selections. Thumbnail preview, ZIP download. All processing runs in your browser."
}
```

Note: English locale omits `searchTerms` (fuzzysort matches `shortTitle` directly).

#### `public/locales/en/pdf-split.json` (new file, en source of truth)

Keys are **flat** (not nested in a `"ui"` object), matching pdf-merge's pattern:

```json
{
  "dropPdf": "Drop a PDF file here or click to upload",
  "supportedFormats": "Supports PDF files only",
  "onlyPdfSupported": "Only PDF files are supported",
  "modeExtractAll": "Extract Every Page",
  "modeByRange": "Split by Range",
  "modeSelectPages": "Select Pages",
  "rangeFrom": "From",
  "rangeTo": "To",
  "addRange": "Add Range",
  "removeRange": "Remove",
  "newGroup": "New Group",
  "selectAll": "Select All",
  "deselectAll": "Deselect All",
  "splitButton": "Split PDF",
  "splitting": "Splitting...",
  "splitProgress": "Processing page {current} of {total}...",
  "splitSuccess": "Split successfully!",
  "downloadZip": "Download All as ZIP",
  "download": "Download",
  "newSplit": "New Split",
  "page": "Page {num}",
  "pages": "Pages {from}-{to}",
  "pagesCount": "{count} pages",
  "splitResult": "{name} — {size}",
  "totalFiles": "{count} files generated",
  "processing": "Splitting...",
  "invalidRange": "Page range must be between 1 and {max}",
  "overlapRange": "Page ranges overlap — pages in multiple ranges will appear in each output",
  "encryptedPdf": "This PDF is encrypted and may not split correctly",
  "corruptedPdf": "This PDF file is corrupted and cannot be read",
  "splitFailed": "Split failed. Please check your PDF file and try again.",
  "descriptions": {
    "title": "About PDF Splitter",
    "aeoDefinition": "PDF Splitter is a free online tool for splitting PDF files into separate pages, custom page ranges, or hand-picked selections. Preview thumbnails, download individually or as ZIP. All processing runs locally in your browser.",
    "whatIsTitle": "What is the PDF Splitter?",
    "whatIs": "Split a PDF file into separate pages or custom page ranges directly in your browser. Upload your PDF, choose a split mode (extract every page, split by ranges, or select specific pages), preview thumbnails, and download the results. No data is uploaded to any server — all processing uses the pdf-lib library.",
    "useCases": "When to use PDF Splitter",
    "useCasesP1": "Extract specific pages from a long report or contract to share only the relevant sections.",
    "useCasesP2": "Split a multi-page PDF into individual pages for separate processing or distribution.",
    "stepsTitle": "How to Split a PDF",
    "step1Title": "Upload your PDF",
    "step1Text": "Drag and drop your PDF file or click to select it from your computer.",
    "step2Title": "Choose split mode",
    "step2Text": "Select how to split: extract every page, define custom ranges, or click thumbnails to pick specific pages.",
    "step3Title": "Split and download",
    "step3Text": "Click the Split button to generate the output files. Download individually or as a ZIP archive.",
    "faq1Q": "Is my PDF data sent to a server?",
    "faq1A": "No. All processing happens entirely in your browser. Your PDF files never leave your device.",
    "faq2Q": "What PDF features are preserved after splitting?",
    "faq2A": "Text, images, fonts, annotations, and form fields are preserved. Some advanced features like JavaScript actions may not carry over.",
    "faq3Q": "Is there a file size limit?",
    "faq3A": "There is no strict limit, but very large files (hundreds of pages) may take longer to process. The tool handles files of any size your browser can hold in memory."
  }
}
```

#### `public/locales/zh-CN/tools.json` (add entry)

```json
"pdf-split": {
  "title": "PDF 拆分工具 - 在线拆分 PDF 页面或范围",
  "shortTitle": "PDF 拆分",
  "description": "将 PDF 拆分为单独页面、自定义范围或手动选择。缩略图预览、ZIP 下载。所有处理在浏览器本地完成。",
  "searchTerms": "pdfchaifen pdfcf chaifen fenye chaiye"
}
```

#### searchTerms for CJK locales (in `tools.json`)

| Locale | searchTerms                             | Breakdown                                  |
| ------ | --------------------------------------- | ------------------------------------------ |
| zh-CN  | `pdfchaifen pdfcf chaifen fenye chaiye` | 拆分(chaifen) + 分页(fenye) + 拆页(chaiye) |
| zh-TW  | `pdfchaifen pdfcf chafen fenye`         | 拆分(chaifen) + 分頁(fenye)                |
| ja     | `pdfbunkatsu pdfbs bunkatsu pdf`        | 分割(bunkatsu)                             |
| ko     | `pdfbunhal pdfbh bunhal pdf`            | 분할(bunhal)                               |

Note: Latin-script locales (es, pt-BR, fr, de, ru) — `shortTitle` is already searchable by fuzzysort. Only add `searchTerms` if there are common alternative terms.

### `app/[locale]/pdf-split/page.tsx` (Route Entry)

Follows pdf-merge's page.tsx pattern exactly:

```typescript
import { getTranslations } from "next-intl/server";
import { generatePageMeta } from "../../../libs/seo";
import { buildToolSchemas } from "../../../components/json-ld";
import { TOOLS, TOOL_CATEGORIES, CATEGORY_SLUGS } from "../../../libs/tools";
import PdfSplitPage from "./pdf-split-page";

const PATH = "/pdf-split";
const TOOL_KEY = "pdf-split";
const tool = TOOLS.find((t) => t.key === TOOL_KEY)!;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "tools" });
  return generatePageMeta({
    locale,
    path: PATH,
    title: t("pdf-split.title"),
    description: t("pdf-split.description"),
    ogImage: { type: "tool", key: TOOL_KEY },
  });
}

export default async function PdfSplitRoute({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "tools" });
  const tx = await getTranslations({ locale, namespace: "pdf-split" });
  const tc = await getTranslations({ locale, namespace: "categories" });
  const category = TOOL_CATEGORIES.find((c) => c.tools.includes(TOOL_KEY))!;
  const categorySlug = CATEGORY_SLUGS[category.key];

  const howToSteps = Array.from({ length: 3 }, (_, i) => ({
    name: tx(`descriptions.step${i + 1}Title`),
    text: tx(`descriptions.step${i + 1}Text`),
  })).filter((step) => step.name);

  const schemas = buildToolSchemas({
    name: t("pdf-split.title"),
    description: tx.has("descriptions.aeoDefinition")
      ? tx("descriptions.aeoDefinition")
      : t("pdf-split.description"),
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
      <PdfSplitPage />
    </>
  );
}
```

### `app/[locale]/pdf-split/pdf-split-page.tsx` (Page Component)

```typescript
"use client";

// Three-component pattern (matches pdf-merge):
// - Conversion: main interaction component (all state + UI logic)
// - Description: FAQ/help section (via DescriptionSection)
// - PdfSplitPage (default export): Layout wrapper

export default function PdfSplitPage() {
  const t = useTranslations("tools");
  const title = t("pdf-split.shortTitle");
  return (
    <Layout title={title} categoryLabel={t("categories.visual")} categorySlug="visual-media">
      <div className="container mx-auto px-4 pt-3 pb-6">
        <PrivacyBanner variant="files" />
        <Conversion />
        <Description />
        <RelatedTools currentTool="pdf-split" />
      </div>
    </Layout>
  );
}
```

## Testing

### Unit Tests (`libs/pdf-split/__tests__/split.test.ts`)

- Extract all pages from a multi-page PDF
- Split by single range
- Split by multiple non-overlapping ranges
- Single-page PDF edge case
- Out-of-range page indices (graceful error)
- Encrypted PDF handling (`ignoreEncryption: true`)

### Test Configuration

Add `libs/pdf-split` to `vitest.config.ts` test includes.

## Scope Boundaries

### In Scope

- Three split modes (extract all, by range, select pages)
- Page thumbnail preview with lazy rendering
- ZIP + individual download
- 10-locale i18n
- Unit tests for split logic

### Out of Scope

- PDF merge (already exists as separate tool)
- Page rotation or reordering
- PDF editing (annotations, form filling)
- OCR or text extraction
- Password-protected PDF creation
- Batch processing of multiple input PDFs
