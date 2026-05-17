# Images to PDF — Design Spec

## Overview

A browser-based tool that converts multiple images into a single PDF document. Supports three layout modes, configurable page settings, and drag-to-reorder image management. All processing runs entirely in the browser — no data is uploaded to any server.

**Route**: `/image-to-pdf`
**Category**: Visual & Media
**Dependencies**: `pdf-lib@^1.17.1` (already installed), `@tanstack/react-virtual@3.13.24` (already installed)
**New dependencies**: None

> **Note**: `pdfjs-dist@^4.10.38` is already installed but not needed for this tool. pdf-lib handles all PDF creation. pdfjs-dist is only used by `pdf-merge` for rendering PDF thumbnails.

## User Requirements

| Requirement      | Details                                               |
| ---------------- | ----------------------------------------------------- |
| Input formats    | JPG, PNG, WebP, GIF (first frame only)                |
| Output           | Single PDF file download                              |
| Layout modes     | Fit-to-page, grid (2/4/6/9 per page), fill page       |
| Page settings    | Size (A4/Letter/Auto), orientation, margin, alignment |
| Image management | Drag reorder, delete, clear all, add more, preview    |

> **Why AVIF/BMP/SVG are excluded**: `pdf-lib` only supports embedding JPG and PNG images natively. While WebP/GIF can be canvas-converted to PNG, AVIF/BMP/SVG conversion is less reliable and adds complexity for niche use cases. Existing image tools (`libs/image/types.ts`) support these via `INPUT_MIME_TYPES`, but this tool intentionally narrows scope.

## Architecture

### File Structure

```
app/[locale]/image-to-pdf/
├── page.tsx                    # Route entry — metadata + JSON-LD
└── image-to-pdf-page.tsx       # Page component — all UI and logic

libs/image-to-pdf/
├── main.ts                     # Core: image → PDF generation
└── __tests__/main.test.ts      # Unit tests

public/locales/{locale}/image-to-pdf.json   # Tool translations (10 locales)
```

### Dependency Graph

```
image-to-pdf-page.tsx
├── libs/image-to-pdf/main.ts              # PDF generation (pdf-lib)
├── libs/image/encode.ts                   # Reuse: ImageBitmap → Blob conversion
├── libs/image/types.ts                    # Reuse: INPUT_MIME_TYPES constant
├── [new inline] MultiImageDropZone        # Multi-file drop zone (based on ImageDropZone pattern)
├── [new inline] ThumbnailList             # Drag-reorder, delete, preview
└── [new inline] useMultiImageInput        # Multi-file input management hook
```

> **Why not reuse `ImageDropZone` / `useImageInput`**: Both are single-file by design (`files[0]` only, `sourceFile: File | null`). The multi-file workflow requires fundamentally different state management (`files: File[]`, `bitmaps: ImageBitmap[]`, `preprocessedData: Map<string, ArrayBuffer>`). Rather than forking existing APIs, we create new inline components following the same visual pattern but with multi-file semantics.

> **Why not reuse `useImageExport`**: That hook handles single-image download/copy-to-clipboard. PDF export is a fundamentally different operation — generating a binary file via `imagesToPdf()` and triggering a download. No code reuse is possible.

### Key Decisions

| Decision         | Choice                                               | Rationale                                                                                 |
| ---------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| UI approach      | Single-page layout (Approach A)                      | Consistent with all OmniKit tools                                                         |
| PDF library      | pdf-lib (existing)                                   | Zero incremental bundle size. Follows `libs/pdf-merge/merge.ts` patterns                  |
| Image input      | New `useMultiImageInput` hook (inline)               | `useImageInput` is single-file by design — cannot be adapted without breaking its API     |
| Image preprocess | Reuse `libs/image/encode.ts` pattern                 | Same `createImageBitmap` → canvas → blob pipeline, proven in existing image tools         |
| Drag reorder     | HTML5 Drag & Drop API (no new library)               | Simple use case, avoid new deps                                                           |
| Virtual scroll   | `@tanstack/react-virtual` (existing)                 | Already a project dependency. Follow `diff/components/DiffInline.tsx` conditional pattern |
| Multi-file drop  | New inline component based on `ImageDropZone` visual | Same UI, extended to accept `multiple` files. No shared component to avoid API bloat      |

## UI Design

### Two States

**State A — No images uploaded:**

- New `MultiImageDropZone` component (visual clone of `ImageDropZone` with `multiple` file support)
- Accept: `image/jpeg, image/png, image/webp, image/gif`
- GIF/WebP animated → first frame only, show notice (reuse existing toast pattern from `useImageInput`)

**State B — Images loaded (main interface):**

```
┌──────────────────────────────────────────────────────┐
│  [PrivacyBanner] All processing in your browser      │
├──────────────┬───────────────────────────────────────┤
│  Controls     │  Preview Area                         │
│  (280px)     │                                       │
│              │  ┌──────────────────────┐             │
│ Page size     │  │  Canvas preview      │             │
│ [A4 ▼]       │  │  (renders current    │             │
│              │  │   page effect)        │             │
│ Orientation   │  └──────────────────────┘             │
│ ○Portrait     │                                       │
│ ●Landscape   │  Page: 1/N  ◄ ►                       │
│              │                                       │
│ Layout mode   │  ┌────┐┌────┐┌────┐┌────┐            │
│ [1/page ▼]   │  │ 📷 ││ 📷 ││ 📷 ││ 📷 │            │
│              │  │  1 ││  2 ││  3 ││  4 │  ...       │
│ Margin        │  └────┘└────┘└────┘└────┘            │
│ [S/M/L/None] │  (thumbnails, drag-reorderable)        │
│              │                                       │
│ Alignment     │  [+ Add more]  [Clear all]            │
│ [Center ▼]   │                                       │
│              │                                       │
│ [Generate PDF]│                                       │
└──────────────┴───────────────────────────────────────┘
```

### Control Panel Options

| Setting     | Options                                                                   | Default  |
| ----------- | ------------------------------------------------------------------------- | -------- |
| Page size   | A4, Letter, Auto (match first image)                                      | A4       |
| Orientation | Portrait, Landscape                                                       | Portrait |
| Layout mode | 1/page, 2/page (1×2), 4/page (2×2), 6/page (2×3), 9/page (3×3), Fill page | 1/page   |
| Margin      | None, Small (10pt), Medium (20pt), Large (40pt)                           | Small    |
| Alignment   | Center, Top-left                                                          | Center   |

### Thumbnail List

- Drag-to-reorder via HTML5 Drag & Drop API
- Click thumbnail → preview jumps to that image's page
- Each thumbnail has ✕ delete button (top-right)
- Hover shows filename and dimensions
- Virtual scrolling via `@tanstack/react-virtual` when >20 images
  - Follow conditional virtualization pattern from `diff/components/DiffInline.tsx` (threshold constant + `useVirtualizer` with `overscan: 20`)

### Preview Behavior

- Canvas preview renders the current page layout in real-time
- **Debounce**: 300ms on option changes (same as existing image tools — `resizePercent`, `quality` changes)
- **Rendering scope**: Only render current page ± 1 adjacent page to maintain performance
- **Idle rendering**: When user is not actively changing settings, render visible page immediately (no debounce)

## Core PDF Generation Logic

### API Design (`libs/image-to-pdf/main.ts`)

```typescript
type PageLayout = "fit" | "fill" | "grid-2" | "grid-4" | "grid-6" | "grid-9";
type PageSize = "a4" | "letter" | "auto";
type Orientation = "portrait" | "landscape";
type Margin = "none" | "small" | "medium" | "large";
type Alignment = "center" | "top-left";

interface ImagesToPdfOptions {
  pageSize: PageSize;
  orientation: Orientation;
  layout: PageLayout;
  margin: Margin;
  alignment: Alignment;
}

interface ImageInput {
  data: ArrayBuffer;
  width: number;
  height: number;
  format: "jpg" | "png";
}

async function imagesToPdf(images: ImageInput[], options: ImagesToPdfOptions): Promise<Uint8Array>;
```

### Layout Computation

| Layout               | Method                                                                                                            |
| -------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **fit** (1/page)     | Scale image proportionally to fit within available area (page minus margins), position per alignment              |
| **fill** (fill page) | Scale image proportionally to cover entire available area, center-crop overflow                                   |
| **grid-N**           | Divide available area into N equal cells, scale each image to fit within its cell with small inter-cell gap (4pt) |

#### Fill-page crop algorithm

For "fill page" mode, the image must cover the entire available area with center-crop:

```typescript
// availableW/H = page dimensions minus margins
// imgW/imgH = original image dimensions

const scale = Math.max(availableW / imgW, availableH / imgH);
const scaledW = imgW * scale;
const scaledH = imgH * scale;

// Center-crop: calculate source rect
const cropX = (scaledW - availableW) / 2 / scale;
const cropY = (scaledH - availableH) / 2 / scale;
const cropW = availableW / scale;
const cropH = availableH / scale;

// Draw: page.drawImage(embeddedImg, { x, y, width: availableW, height: availableH })
// With clipping: first draw a clip rect, then draw the scaled image offset by -cropX, -cropY
```

> **Note**: pdf-lib does not natively support source-rect cropping like Canvas `drawImage(sx, sy, sw, sh)`. The fill-crop must be implemented by: (1) drawing a clip rectangle for the available area, then (2) drawing the scaled image positioned so the center portion fills the clip region.

### Page Size Mapping (PDF points, 1pt = 1/72 inch)

| Size   | Portrait (w×h)         | Landscape (w×h) |
| ------ | ---------------------- | --------------- |
| A4     | 595 × 842              | 842 × 595       |
| Letter | 612 × 792              | 792 × 612       |
| Auto   | First image dimensions | Same            |

### Margin Mapping

| Setting | Points |
| ------- | ------ |
| None    | 0      |
| Small   | 10     |
| Medium  | 20     |
| Large   | 40     |

### Image Preprocessing

Images that are not JPG or PNG must be converted before embedding. Reuse the pattern from `libs/image/encode.ts` (ImageBitmap → canvas → blob):

1. Detect `file.type` on input
2. For WebP/GIF: `createImageBitmap(file)` → canvas → `canvas.toBlob("image/png")` (same pipeline as `encode.ts`)
3. Conversion happens asynchronously when images are added (not during PDF generation)
4. Store converted `ArrayBuffer` + dimensions in component state
5. **50MP limit**: Reuse existing warning pattern from `useImageInput` — show toast if image exceeds 50 megapixels

> **Buffer safety**: Follow `libs/pdf-merge/merge.ts` pattern — always use `data.slice(0)` when passing ArrayBuffers to pdf-lib to prevent ownership transfer / detachment issues.

## Component State Design

### `useMultiImageInput` Hook

Since `useImageInput` is single-file by design, a new inline hook manages the multi-file workflow:

```typescript
interface ManagedImage {
  id: string; // Unique ID for drag-reorder keying
  file: File; // Original file
  bitmap: ImageBitmap; // Decoded bitmap for preview
  pdfData: ArrayBuffer; // Preprocessed data (PNG for WebP/GIF, raw for JPG/PNG)
  width: number;
  height: number;
  format: "jpg" | "png"; // Format after preprocessing
  previewUrl: string; // Object URL for thumbnail
}

interface UseMultiImageInputReturn {
  images: ManagedImage[];
  addFiles: (files: FileList | File[]) => Promise<void>;
  removeImage: (id: string) => void;
  reorderImages: (fromIndex: number, toIndex: number) => void;
  clearAll: () => void;
  processing: boolean; // True while preprocessing newly added files
}
```

### MultiImageDropZone Component

Visual clone of `ImageDropZone` with these differences:

- `<input multiple>` attribute
- `onInputChange` processes all files, not just `files[0]`
- Shows "N images selected" feedback after drop

## Tool Registration

### `libs/tools.ts` Changes

```typescript
// 1. Add icon import at top of file:
import { ..., FileImage } from "lucide-react";

// 2. TOOL_CATEGORIES.visual.tools — insert before "pdf-merge":
"image-to-pdf"

// 3. TOOLS array — append:
{
  key: "image-to-pdf",
  path: "/image-to-pdf",
  icon: FileImage,
  emoji: "🖼️",
  sameAs: [
    "https://en.wikipedia.org/wiki/PDF",
    "https://developer.mozilla.org/en-US/docs/Glossary/PDF",
  ],
}

// 4. TOOL_RELATIONS — add new entry:
"image-to-pdf": ["image-resize", "image-compress", "image-convert", "pdf-merge"],

// 5. TOOL_RELATIONS — update reverse links:
// In "image-resize": append "image-to-pdf"
// In "image-compress": append "image-to-pdf"
// In "image-convert": append "image-to-pdf"
// In "pdf-merge": append "image-to-pdf"
```

### Page Template (`app/[locale]/image-to-pdf/page.tsx`)

Follow the exact pattern from `app/[locale]/image-resize/page.tsx`:

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

Generated schemas: **WebApplication**, **BreadcrumbList**, **FAQPage** (3 FAQ items), **HowTo** (3 steps).

### i18n (10 locales)

Each locale needs:

- `public/locales/{locale}/tools.json` — add `image-to-pdf` entry with `title`, `shortTitle`, `description`
- `public/locales/{locale}/image-to-pdf.json` — tool-specific UI strings + description section

**Tool-specific translation structure** (`public/locales/{locale}/image-to-pdf.json`):

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

**CJK locales** (zh-CN, zh-TW, ja, ko): include `searchTerms` with romanized tokens in `tools.json` entry.

**`tools.json` entry example** (`public/locales/en/tools.json`):

```json
"image-to-pdf": {
  "title": "Images to PDF - Convert Images to PDF Online",
  "shortTitle": "Images to PDF",
  "description": "Convert JPG, PNG, WebP, and GIF images into a single PDF. Multiple layout modes, page sizes, and margins. All processing in your browser."
}
```

**CJK `searchTerms` example** (`public/locales/zh-CN/tools.json`):

```json
"image-to-pdf": {
  "title": "图片转 PDF - 在线将多张图片合成 PDF",
  "shortTitle": "图片转 PDF",
  "description": "将 JPG、PNG、WebP、GIF 图片转换为 PDF 文件。支持多种布局、页面尺寸和边距设置。所有处理在浏览器中完成。",
  "searchTerms": "tupianzhuanpdf tpzpdf pdf hebing tupian daochu"
}
```

### SEO & Structured Data

- `page.tsx` generates metadata via `generatePageMeta()` with OG image
- JSON-LD via `buildToolSchemas()`: WebApplication + BreadcrumbList + FAQPage (3 FAQ) + HowTo (3 steps)
- `sameAs` links to PDF spec references
- Sitemap auto-updated from TOOLS array (no manual change needed)

## Edge Cases & Limits

| Scenario               | Handling                                                            |
| ---------------------- | ------------------------------------------------------------------- |
| Large image (>50MP)    | Reuse existing large image warning pattern from `useImageInput`     |
| Animated GIF/WebP      | First frame only, show notice to user                               |
| Zero images + Generate | Button disabled                                                     |
| Single image           | Normal single-page PDF                                              |
| Many images (>100)     | Virtual scrolling for thumbnails, PDF generation runs without issue |
| WebP/GIF input         | Canvas → PNG conversion at upload time                              |
| Preview performance    | Render only current page + 1 adjacent page on each side             |
| File size limit        | No hard limit — all browser-side, user constrained by memory        |
| Buffer detachment      | Use `data.slice(0)` pattern from `libs/pdf-merge/merge.ts`          |
| Drag reorder + grid    | After reorder, recompute which images land on which pages           |

## Testing

- **Unit tests** (`libs/image-to-pdf/__tests__/main.test.ts`):
  - Fit layout: image scaled proportionally within margins
  - Fill layout: image covers area, center-crop overflow
  - Grid layouts: correct cell division and image placement
  - A4/Letter/Auto page sizes
  - Portrait/Landscape orientation
  - Margin application (none/small/medium/large)
  - Alignment (center/top-left)
  - WebP preprocessing (via canvas conversion)
  - Empty image list → throws or returns empty PDF
  - Single image → single page
  - Fill-crop with non-matching aspect ratios
  - Grid with fewer images than cells (partially filled last page)

- **Test scope registration**: Add `libs/image-to-pdf/**/*.test.ts` to `vitest.config.ts` include patterns.

## Build Configuration

No changes needed:

- `pdf-lib` is pure JS, no transpilation required
- `pdfjs-dist` transpilation already configured in `next.config.js` but not used by this tool
- `@tanstack/react-virtual` already works out of the box

## Files to Create/Modify

### Create

| File                                                 | Purpose                           |
| ---------------------------------------------------- | --------------------------------- |
| `app/[locale]/image-to-pdf/page.tsx`                 | Route entry (metadata + JSON-LD)  |
| `app/[locale]/image-to-pdf/image-to-pdf-page.tsx`    | Page component (all UI + logic)   |
| `libs/image-to-pdf/main.ts`                          | PDF generation core               |
| `libs/image-to-pdf/__tests__/main.test.ts`           | Unit tests                        |
| `public/locales/en/image-to-pdf.json`                | English UI strings + descriptions |
| `public/locales/{9 other locales}/image-to-pdf.json` | Localized UI strings              |

### Modify

| File                                          | Change                                                                           |
| --------------------------------------------- | -------------------------------------------------------------------------------- |
| `libs/tools.ts`                               | Add `FileImage` icon import, tool entry, category, relations (forward + reverse) |
| `public/locales/en/tools.json`                | Add `image-to-pdf` entry (title, shortTitle, description)                        |
| `public/locales/{9 other locales}/tools.json` | Add localized entry + searchTerms (CJK only)                                     |
| `vitest.config.ts`                            | Add `libs/image-to-pdf/**/*.test.ts` to test include patterns                    |
