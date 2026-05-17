# PDF to Image Tool Design

## Summary

A browser-based PDF-to-image conversion tool that renders PDF pages as PNG, JPG, or WebP images. Users select pages via a checkbox thumbnail grid, choose DPI (preset or custom), and download individually or as a ZIP archive. All processing runs client-side using pdfjs-dist. Zero new dependencies.

## User Decisions

| Decision       | Choice                                                                 |
| -------------- | ---------------------------------------------------------------------- |
| Scope          | Page selection + export (not just bulk export)                         |
| Download       | Single page download + ZIP archive for all                             |
| DPI control    | Preset tiers + custom slider (rc-slider)                               |
| Page selection | Checkbox grid with select all / deselect all; defaults to all selected |

## Requirements

### Upload

- Drag-and-drop via `file-selector` library (`fromEvent` pattern, matching pdf-split) or file picker for PDF files (`accept=".pdf"`)
- Validate file is a valid PDF (pdfjs-dist parsing check — chosen over pdf-lib because pdf-to-image already depends on pdfjs-dist, no extra dependency needed)
- Show error toast for corrupted or password-protected PDFs
- Large file warning: toast warning when file > 100 MB (`formatBytes(file.size, 1000, 1)`)
- Many pages warning: toast warning when page count > 200

### Page Preview & Selection

- Render page thumbnails via pdfjs-dist (canvas → data URL), bounded concurrency of 3 parallel renders (matching pdf-split `renderThumbnails` pattern)
- Display thumbnails in a responsive grid: `grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3` (matching pdf-split)
- Each thumbnail has a checkbox overlay (top-left corner)
- Click thumbnail or checkbox to toggle selection
- **Default state**: all pages selected on initial load
- "Select All" and "Deselect All" buttons
- Convert button disabled when 0 pages selected
- Show page count summary: "共 X 页，已选 Y 页"
- Thumbnail dimensions: ~120px height, width proportional to page aspect ratio (matching pdf-split `maxWidth=120, maxHeight=160`)

### Output Settings

**Format**: Dropdown selector (PNG / JPG / WebP)

- PNG: lossless, no quality setting
- JPG: quality slider 1-100 (default 90), white background fill
- WebP: quality slider 1-100 (default 90)

**DPI**: 4 preset tiers + custom option
| Preset | Scale | Equivalent DPI | Use Case |
|--------|-------|----------------|----------|
| 预览 | 1.0 | 72 DPI | Quick preview |
| 标准 | 2.0 | 144 DPI | Web display |
| 高清 | 3.0 | 216 DPI | High quality |
| 打印 | 4.0 | 288 DPI | Print |
| 自定义 | user | 72-600 DPI | Custom |

When "自定义" is selected, expand a slider (72-600 DPI) with live pixel dimension display:

```
输出尺寸: 2480 × 3508 px
```

Computed as: `(viewport.width_at_scale_1) × (selected_DPI / 72)` × `(viewport.height_at_scale_1) × (selected_DPI / 72)`.

**Quality**: Slider (1-100), only visible when format is JPG or WebP.

**Slider implementation**: Use `rc-slider` (already in project) with dynamic import (`next/dynamic`, `ssr: false`) and unified project slider styles:

```typescript
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
```

### Conversion & Download

- Convert button triggers rendering of selected pages (one page at a time to limit memory)
- Progress bar for multi-page conversions (current/total), matching pdf-split progress UI pattern
- Memory-safe rendering pipeline:
  1. Render one page at a time to canvas
  2. `canvas.toBlob()` → Blob result
  3. Release canvas memory (`canvas.width = 0; canvas.height = 0`)
  4. Call `pdf.destroy()` after each render batch to release pdfjs document
  5. Store result Blobs in state array
  6. On "Start Over": clear all Blob URLs (`URL.revokeObjectURL()`), reset state
- Memory estimation for large exports: warn user if estimated total > 2 GB
  - Estimation: `Σ (page_width × scale × page_height × scale × 4 bytes)` for raw pixel data before compression
- Results page shows:
  - Success summary (page count, total output size via `formatBytes` from `utils/storage.ts`)
  - Per-page result cards: thumbnail + filename + dimensions (W×H) + file size + individual download button
  - "Download All as ZIP" button (using `fflate.zipSync`, same pattern as pdf-split)
  - "Start Over" button
- Single page filename: `page_1.png`, `page_2.jpg`, etc.
- ZIP filename: `pdf-images.zip`

### Error Handling

- Corrupted PDF: toast error + stay on upload screen
- Password-protected PDF: detect via error message containing "password" or "encrypt" (matching pdf-compress pattern), toast warning
- Browser out of memory: catch and show user-friendly error
- Render failure on specific page: skip and show warning, continue with remaining pages

## Architecture

### Route & Registration

- **Route**: `/pdf-to-image`
- **Tool key**: `pdf-to-image`
- **Category**: Visual & Media (`visual`)
- **Icon**: `ImageDown` (lucide-react) — `FileImage` already used by `image-to-pdf`
- **Emoji**: `📄` — `🖼️` already used by `image-to-pdf`
- **sameAs**: `["https://www.adobe.com/acrobat/online/pdf-to-image.html"]`
- **Related tools**: image-compress, image-convert, image-resize, pdf-merge, pdf-split, image-to-pdf

### File Structure

```
app/[locale]/pdf-to-image/
├── page.tsx                    # Route entry: generateMetadata + JSON-LD + PdfToImagePage
└── pdf-to-image-page.tsx       # Client component: UI + logic

libs/pdf-to-image/
├── render.ts                   # Core: renderPageToBlob, getPdfPageCount
├── types.ts                    # DPI presets, RenderOptions, RenderResult (imports OutputFormat from libs/image/types)
└── __tests__/
    └── render.test.ts          # Unit tests for render functions

public/locales/{locale}/pdf-to-image.json   # Translation files (10 locales)
```

### Core Module: `libs/pdf-to-image/types.ts`

Import `OutputFormat`, `FORMAT_EXTENSIONS`, `FORMAT_DISPLAY_NAMES` from `libs/image/types.ts` to avoid duplication. Only define pdf-to-image-specific types here.

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
```

### Core Module: `libs/pdf-to-image/render.ts`

```typescript
// renderPageToBlob: renders a single PDF page to an image Blob
// 1. Dynamic import pdfjs-dist
// 2. Configure worker: pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"
// 3. Load PDF with CMap CDN for CJK font support:
//    const version = (await import("pdfjs-dist")).version;
//    cMapUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${version}/cmaps/`
//    cMapPacked: true
// 4. Buffer copy before passing to pdfjs (new Uint8Array(data.slice(0)))
// 5. Get page (1-indexed in pdfjs), compute viewport with scale
// 6. Create canvas, for JPEG: fill white background first
// 7. Render page to canvas, then canvas.toBlob() → Blob
// 8. Release memory: canvas.width = 0; canvas.height = 0
// 9. Return { blob, width, height, pageIndex }
// 10. Note: caller is responsible for pdf.destroy() after all renders

// getPdfPageCount: returns total page count from ArrayBuffer
// Uses pdfjs-dist (not pdf-lib) to avoid extra dependency
```

**Key implementation details**:

- pdfjs-dist loaded via dynamic `import("pdfjs-dist")` — lazy, not in initial bundle
- Worker file already copied by `copy-pdf-worker` build script (`predev`/`prebuild` in package.json)
- CMap URL resolved at runtime via `pdfjs.version` (e.g., `pdfjs-dist@4.9.155/cmaps/`)
- Buffer copy before passing to pdfjs (it may transfer/detach the underlying ArrayBuffer)
- JPEG white background: fill canvas with white before rendering (reuse the same pattern from `libs/image/encode.ts` — fillRect white on canvas context before drawing)

### Route Entry: `app/[locale]/pdf-to-image/page.tsx`

Follows the exact pattern from `pdf-split/page.tsx` and `pdf-compress/page.tsx`:

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
  const categorySlug = CATEGORY_SLUGS[category.key]; // → "visual-media"

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

### Page Component: `pdf-to-image-page.tsx`

Three-state UI (matching pdf-split's three-branch render pattern):

**State 1 — Upload (empty state)**:

- Drop zone with PDF icon, accept `.pdf` only
- Uses `file-selector` library (`fromEvent`) for drag-drop (matching pdf-split pattern)
- Hidden file input as fallback (`accept=".pdf"`, opacity-0 overlay)

**State 2 — Configure + Preview (loaded state)**:

- Two-column layout: `grid-cols-1 md:grid-cols-[280px_1fr]`
- Left sidebar (280px):
  - Output format dropdown (PNG/JPG/WebP)
  - DPI selector (4 presets + custom with expanded rc-slider)
  - Quality slider (rc-slider, visible only for JPG/WebP)
  - "Select All" / "Deselect All" buttons
  - Page count summary
  - Action buttons: Reselect, Convert
- Right area: thumbnail grid with checkbox overlays

**State 3 — Results (converted state)**:

- Success banner with stats (page count, total output size)
- Result list: per-page cards with thumbnail, filename, dimensions (W×H), file size (`formatBytes` from `utils/storage.ts`), individual download button
- Bottom actions: "Download All as ZIP" + "Start Over"

**Default export**:

```tsx
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

**Shared components reused**:

- `Layout` — page wrapper (with `categoryLabel` and `categorySlug` props)
- `PrivacyBanner` — with `variant="files"` (matching pdf-split, pdf-compress)
- `DescriptionSection` — tool description & FAQ accordion (with `namespace="pdf-to-image"`)
- `RelatedTools` — cross-link to related tools
- `fflate.zipSync` — ZIP archive creation (same pattern as pdf-split: `Record<string, Uint8Array>` → `zipSync` → Blob)

### Tool Registration: `libs/tools.ts`

Add to TOOLS array:

```typescript
{
  key: "pdf-to-image",
  path: "/pdf-to-image",
  icon: ImageDown,   // NOT FileImage — already used by image-to-pdf
  emoji: "📄",        // NOT 🖼️ — already used by image-to-pdf
  sameAs: ["https://www.adobe.com/acrobat/online/pdf-to-image.html"],
}
```

Add to visual category tools list (after `image-to-pdf`, before `pdf-merge`):

```typescript
{
  key: "visual",
  tools: [
    "color", "image-resize", "image-compress", "image-convert",
    "image-watermark", "image-crop", "image-rotate", "image-to-pdf",
    "pdf-to-image",  // <-- new
    "pdf-merge", "pdf-split", "pdf-compress", "pdf-watermark",
  ],
}
```

Add TOOL_RELATIONS (new entry + update existing entries for bidirectional links):

```typescript
// New entry
"pdf-to-image": ["image-compress", "image-convert", "image-resize", "pdf-merge", "pdf-split", "image-to-pdf"],

// Update existing entries — add "pdf-to-image"
"pdf-split": ["pdf-merge", "image-compress", "image-convert", "pdf-to-image"],
"image-to-pdf": ["image-resize", "image-compress", "image-convert", "pdf-merge", "pdf-to-image"],
// image-convert and image-compress already have pdf tools in their relations, add pdf-to-image there too
"image-convert": [...existing, "pdf-to-image"],
"image-compress": [...existing, "pdf-to-image"],
```

### i18n

Translation file `public/locales/{locale}/pdf-to-image.json` for all 10 locales.

English source of truth with keys for:

- Upload zone text (dropPdf, supportedFormats)
- Controls (outputFormat, dpi, quality, selectAll, deselectAll)
- DPI preset labels (preview, standard, high, print, custom)
- Actions (convert, reselect, download, downloadZip, startOver)
- Status (processing, converting, pageSelection)
- Results (convertSuccess, totalPages, totalSize, page, dimensions)
- Error messages (corruptedPdf, encryptedPdf, outOfMemory, renderFailed, largePdf, manyPages)
- Description section (descriptions.aeoDefinition, descriptions.whatIs, descriptions.useCases, descriptions.step1Title/Text, descriptions.faq1Q/A, etc.)

**searchTerms** for CJK locales follow project convention (romanized full + initials + ≤3 keywords):

| Locale | searchTerms                              |
| ------ | ---------------------------------------- |
| en     | _(omit — shortTitle is already English)_ |
| zh-CN  | `pdftupian pftp zhuanhuan tupian daochu` |
| zh-TW  | `pdftupian pftp zhuanhuan tupian daochu` |
| ja     | `pdftogazou ptfp gazou henkan`           |
| ko     | `pdfimiji pfi imiji bunhwan`             |

## Dependencies

| Dependency      | Status            | Purpose                             |
| --------------- | ----------------- | ----------------------------------- |
| `pdfjs-dist`    | Already installed | PDF rendering engine                |
| `fflate`        | Already installed | ZIP archive creation                |
| `file-selector` | Already installed | Drag-drop file handling (fromEvent) |
| `rc-slider`     | Already installed | DPI custom slider + quality slider  |

**Zero new dependencies.**

## Testing

- `libs/pdf-to-image/__tests__/render.test.ts`:
  - Test `getPdfPageCount` with valid/invalid PDF buffers
  - Test `renderPageToBlob` output format, dimensions, quality
  - Test JPEG white background fill
  - Test custom scale values
  - Test buffer copy (pdfjs doesn't detach original)

- Add test scope to `vitest.config.ts`:
  ```typescript
  "libs/pdf-to-image/**/*.test.ts",
  ```

## Config & Doc Updates

### `vitest.config.ts`

Add to the `include` array:

```typescript
"libs/pdf-to-image/**/*.test.ts",
```

### `AGENTS.md`

Update the following sections:

1. **Available Tools table**: Add `| /pdf-to-image | PDF to Image | Convert PDF pages to PNG, JPG, or WebP images with DPI control |`
2. **Tool Categories > Visual & Media**: Add `pdf-to-image` to the tool list
3. **Business Logic table**: Add `| pdf-to-image/ | PDF page rendering to image (renderPageToBlob, getPdfPageCount) |`
4. **Configured test scopes** in Testing section: Add `pdf-to-image`

## Out of Scope

- OCR / text extraction from PDF
- PDF creation or editing (covered by pdf-merge, image-to-pdf)
- Image watermark overlay (covered by image-watermark)
- Image cropping of PDF pages (covered by image-crop)
- Password-protected PDF support (pdfjs-dist can handle it with password callback, but out of scope for v1)
- Batch PDF processing (multiple PDFs at once)
