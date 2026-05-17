# PDF Watermark Tool Design

Add a browser-based PDF watermark tool at `/pdf-watermark`. Users upload a PDF, configure text or image watermarks (position, opacity, rotation, tiling), preview the result, and download the watermarked PDF. All processing runs entirely in the browser.

## Decisions

| Decision         | Choice                                 | Rationale                                                                                                                                              |
| ---------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tool key         | `pdf-watermark`                        | Follows `{noun}-{verb}` pattern, consistent with `pdf-merge` / `image-watermark`                                                                       |
| Route            | `/pdf-watermark`                       | —                                                                                                                                                      |
| Category         | `visual` (visual-media)                | PDF tools live in visual category alongside image tools                                                                                                |
| Watermark types  | Text + Image (tab switch)              | Covers both copyright text and brand logo use cases, matches `image-watermark` pattern                                                                 |
| Arrangement      | Single position + Tiled (radio switch) | Single for branding, tiled for copyright protection, matches `image-watermark` pattern                                                                 |
| PDF modification | `pdf-lib` (already installed)          | Only pure-JS library that can modify existing PDFs client-side                                                                                         |
| PDF preview      | `pdfjs-dist` (already installed)       | Render first page to canvas for watermark preview, reuse pdf-merge rendering pattern                                                                   |
| CJK font support | V1: Standard fonts only (English)      | CJK font subset is 1-10MB; English watermarks cover 80%+ use cases; reserved as V2 enhancement                                                         |
| Preview strategy | Auto debounce (300ms), first page      | Matches image-watermark pattern; pdf-lib is synchronous so round-trip is fast; initial render instant, subsequent 300ms delay                          |
| Page range       | All pages (V1)                         | YAGNI — most users watermark all pages; page range can be added later without breaking changes                                                         |
| Batch processing | Single PDF only                        | Matches existing tool patterns, keeps scope manageable                                                                                                 |
| Font size unit   | pt (12-120)                            | PDF pages have fixed dimensions (e.g. A4 = 595×842pt); pt gives predictable sizing. Differs from image-watermark which uses % because image sizes vary |
| Rotation         | Single: -180 to 180, Tiled: -45 to 45  | Single mode allows full rotation for branding; tiled mode restricted to avoid visual clutter, matches image-watermark tiled range                      |
| Icon             | `Stamp` (lucide-react)                 | Avoids collision with `Droplets` used by `image-watermark`; semantically fits "stamp/seal"                                                             |
| Emoji            | 🔏                                     | Avoids collision with 💧 used by `image-watermark`; "locked seal" connotation                                                                          |

## Architecture

### File Structure

```
app/[locale]/pdf-watermark/
├── page.tsx                       # Route entry (SEO metadata + JSON-LD)
└── pdf-watermark-page.tsx         # Main page component (client)

libs/pdf-watermark/
├── types.ts                       # Type definitions (WatermarkConfig, WatermarkOptions, etc.)
├── watermark.ts                   # Core watermark logic (pdf-lib: add text/image to all pages)
├── preview.ts                     # Preview rendering (pdfjs-dist: render page to canvas)
└── __tests__/
    └── watermark.test.ts          # Unit tests for watermark logic

public/locales/{locale}/
├── tools.json                     # Append pdf-watermark entry
└── pdf-watermark.json             # Tool translations (10 locales)
```

### page.tsx template

Follow `app/[locale]/pdf-merge/page.tsx` pattern exactly:

```tsx
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

Key points:

- Uses `getTranslations` (server-side) for i18n
- `buildToolSchemas()` generates JSON-LD (WebApplication + BreadcrumbList + FAQPage + HowTo)
- `generatePageMeta()` handles SEO (canonical, OG, Twitter, alternates for all 10 locales)
- `ogImage: { type: "tool", key: TOOL_KEY }` for tool-specific OG image

### Modified files

```
libs/tools.ts                      # Append tool registration + category + relations
```

### Dependencies (no new installs)

- `pdf-lib` (^1.17.1) — static import. Adds text/image watermarks to PDF pages via `page.drawText()` and `page.drawImage()`. Supports opacity, rotation (via `degrees()`), positioning. Both `drawText` and `drawImage` confirmed to accept `rotate` and `opacity` parameters.
- `pdfjs-dist` (^4.10.38) — dynamic import on preview. Renders PDF page to canvas for watermark preview. Worker file already copied to `public/pdf.worker.min.mjs` via `predev`/`prebuild` scripts.

### PDF upload

Cannot reuse `components/image/ImageDropZone` (accepts image files, uses `createImageBitmap`). Implement a PDF-specific inline dropzone:

- Accept: `.pdf` only (MIME `application/pdf`)
- Use `hooks/useDropZone` for drag-and-drop behavior
- Validate file type on upload, reject non-PDF with error toast
- Store uploaded file as `ArrayBuffer` (not `ImageBitmap`)
- Display filename + page count after upload (using `getPdfPageCount` from pdf-merge pattern)

## Core Types

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
  fontSize: number; // pt (12-120). PDF pages have fixed dimensions, so pt gives predictable sizing
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
  rotation: number; // Degrees. Tiled mode: -45 to 45. Single mode: -180 to 180.
  spacing: number; // Tiled mode only: multiplier of watermark dimension (1.0 to 3.0)
}

export interface WatermarkResult {
  blob: Blob;
  pageCount: number;
}
```

## Core Logic

### Watermark rendering (`libs/pdf-watermark/watermark.ts`)

**Main entry point**: `addWatermark(pdfBytes, watermark, options) → WatermarkResult`

1. Load PDF with `PDFDocument.load(new Uint8Array(pdfBytes), { ignoreEncryption: true })`
2. Iterate all pages
3. For each page, call `renderTextWatermark()` or `renderImageWatermark()` based on watermark type
4. `doc.save()` → return Blob

**Text watermark rendering**:

- Embed standard font via `pdfDoc.embedFont(StandardFonts.HelveticaBold)`
- Single mode: calculate position from `PositionPreset`, call `page.drawText()` once with optional rotation (-180 to 180)
- Tiled mode: nested loop over page dimensions with spacing, call `page.drawText()` at each grid point with rotation (-45 to 45)
- Parameters: `x`, `y`, `size`, `font`, `color` (rgb), `opacity`, `rotate` (degrees via `degrees()` helper)

**Image watermark rendering**:

- Embed image via `pdfDoc.embedPng()` or `pdfDoc.embedJpg()`
- Single mode: calculate position, call `page.drawImage()` once with optional rotation
- Tiled mode: same grid approach as text with rotation (-45 to 45)
- Parameters: `x`, `y`, `width`, `height`, `opacity`, `rotate` (degrees via `degrees()` helper)

**Note**: Both `page.drawText()` and `page.drawImage()` accept `rotate` (type `degrees` from pdf-lib) and `opacity` (0-1) — verified against pdf-lib ^1.17.1.

**Position calculation**: Shared function for both text and image:

- Map `PositionPreset` to `(x, y)` coordinates based on page size and watermark dimensions
- Margin: 10% of page dimension from edges

### Preview rendering (`libs/pdf-watermark/preview.ts`)

**Function**: `renderPreview(pdfBytes, pageIndex, canvas, maxWidth) → void`

1. Dynamic import `pdfjs-dist`
2. Set worker source to `/pdf.worker.min.mjs`
3. Copy buffer (`data.slice(0)`) — pdfjs-dist may detach the underlying ArrayBuffer
4. Load PDF, get page, calculate scale to fit canvas
5. Render to canvas
6. Cleanup: `pdf.destroy()`, zero out canvas dimensions

Reuse the same pattern as `libs/pdf-merge/thumbnail.ts`.

### Client-side preview pipeline (in page component)

Matches image-watermark pattern:

1. `useEffect` watches all watermark config dependencies
2. Initial render: 0ms delay. Subsequent changes: 300ms debounce
3. `stalenessId` ref for canceling stale renders
4. `prevBlobUrlRef` for cleaning up old Blob URLs (`URL.revokeObjectURL`)
5. Full pipeline: apply watermark with pdf-lib → render result with pdfjs-dist → display as `<img>` Blob URL

## UI Layout

```
┌─────────────────────────────────────────────────┐
│  Layout title: "PDF Watermark"                  │
├─────────────────────────────────────────────────┤
│  PrivacyBanner                                  │
│                                                 │
│  ┌──────────────────┐  ┌──────────────────────┐ │
│  │  PDF Drop Zone   │  │                      │ │
│  │  (upload area)   │  │   PDF Preview        │ │
│  │                  │  │   (pdfjs canvas)     │ │
│  └──────────────────┘  │                      │ │
│                        │                      │ │
│  ┌──────────────────┐  │                      │ │
│  │  Watermark Type  │  └──────────────────────┘ │
│  │  [Text] [Image]  │                          │
│  ├──────────────────┤  ┌──────────────────────┐ │
│  │  Config Panel    │  │  Action Buttons      │ │
│  │  (type-specific) │  │  [Download]           │ │
│  ├──────────────────┤  └──────────────────────┘ │
│  │  Placement       │                          │
│  │  [Single][Tiled] │                          │
│  │  - position      │                          │
│  │  - rotation      │                          │
│  │  - spacing       │                          │
│  └──────────────────┘                          │
│                                                │
│  ┌─────────────────────────────────────────────┐│
│  │  Description & FAQ (DescriptionSection)     ││
│  └─────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────┐│
│  │  Related Tools                               ││
│  └─────────────────────────────────────────────┘│
└─────────────────────────────────────────────────┘
```

### Interaction flow

1. **Upload PDF** → drag-and-drop or click, display filename + page count
2. **Select watermark type** → Text / Image tab (NeonTabs component)
3. **Configure watermark** → type-specific config panel
4. **Set placement** → Single/Tiled mode + position/rotation/spacing
5. **Auto preview** → after upload + valid config, render watermarked first page to canvas via pdfjs-dist (debounced 300ms, initial render instant, matches image-watermark pattern)
6. **Download** → pdf-lib adds watermark to all pages, generate new PDF Blob, trigger download

### Text watermark config panel

- Text input (Input component)
- Font selector (dropdown: Helvetica, HelveticaBold, Courier, CourierBold, TimesRoman, TimesRomanBold)
- Font size slider (rc-slider, 12-120pt)
- Color picker (native `input[type=color]`, matches image-watermark pattern)
- Opacity slider (rc-slider, 0-100%)

### Image watermark config panel

- Image upload dropzone (reuse ImageDropZone pattern, accept PNG/JPG)
- Scale slider (rc-slider, 5-50% of page width)
- Opacity slider (rc-slider, 0-100%)

### Placement config (shared)

- Mode radio: Single / Tiled
- Position grid selector (3×3 grid of clickable cells, only shown in Single mode)
- Rotation slider (rc-slider): Single mode -180 to 180, Tiled mode -45 to 45 (default -30 for diagonal)
- Spacing slider (rc-slider, 1.0 to 3.0, only shown in Tiled mode, multiplier of watermark dimension)

## Error Handling

| Scenario                | Handling                                                      |
| ----------------------- | ------------------------------------------------------------- |
| Non-PDF file uploaded   | Reject on upload, show error toast                            |
| Encrypted/protected PDF | Try `ignoreEncryption: true`; fail gracefully with toast      |
| Corrupted PDF           | try-catch, show "Unable to parse this PDF file" toast         |
| Large PDF (>50MB)       | Show warning "File is large, processing may take time"        |
| Large page count (>500) | Show warning "This PDF has N pages, processing may take time" |
| File too large (>100MB) | Hard reject: "File exceeds 100MB limit"                       |
| Empty watermark text    | Disable Preview/Download buttons, show placeholder            |
| No image uploaded       | Disable Preview/Download buttons in Image mode                |
| 0% opacity              | Allow but show hint                                           |

## Performance

- pdf-lib operates synchronously on main thread; 50 pages typically < 1s
- Preview: auto-debounced (300ms after initial render), renders only the first page via pdfjs-dist
- Rendering pipeline: matches image-watermark pattern — `stalenessId` ref for cancellation, `prevBlobUrlRef` for Blob URL cleanup, initial render with 0ms delay
- No Web Worker needed for V1 (pdf-lib API is synchronous; Worker would add complexity without clear benefit for typical file sizes)
- If needed, V2 can move heavy operations to Worker

## Tool Registration

### libs/tools.ts

```typescript
// In TOOLS array:
{
  key: "pdf-watermark",
  path: "/pdf-watermark",
  icon: Stamp,     // Avoids collision with Droplets used by image-watermark
  emoji: "🔏",
  sameAs: [
    "https://en.wikipedia.org/wiki/Watermark",
  ],
}

// In TOOL_CATEGORIES, visual group:
// Add "pdf-watermark" to the visual category tools array

// In TOOL_RELATIONS:
"pdf-watermark": ["image-watermark", "pdf-merge", "image-compress", "image-convert", "color"],
// Also update bidirectional relations in existing entries:
// "image-watermark": [...existing, "pdf-watermark"]
// "pdf-merge": [...existing, "pdf-watermark"]
```

## i18n

### Tool metadata (tools.json)

**English (`en/tools.json`)**:

```json
"pdf-watermark": {
  "title": "PDF Watermark - Add Text & Image Watermarks to PDF",
  "shortTitle": "PDF Watermark",
  "description": "Add text or image watermarks to PDF files. Customize font, color, opacity, rotation, and tiling."
}
```

**CJK searchTerms**:

- zh-CN: `pdfshuiyin pdfsy shuiyin yinji banquan`
- zh-TW: `pdfshuiyin pdfsy fuyin yinji banquan`
- ja: `pdfsukaisi pdfsks mizuashi shirushi chosakuken`
- ko: `pdfwoteomakeu pdfwtm mulleuteu jeojakken`

> **Note**: CJK searchTerms romanization should be verified by native speakers before implementation. The tokens above follow the project's romanization convention (full pinyin/romaji + initials + 3 domain keywords).

### Tool-specific translations (pdf-watermark.json)

Standard structure matching existing tools:

- Upload area labels
- Watermark type tab labels
- Config panel labels (font, size, color, opacity, scale)
- Placement labels (single, tiled, position, rotation, spacing)
- Action buttons (download)
- Processing/error messages
- Description section (title, aeoDefinition, how-to steps, FAQ)

All 10 locales.

## V2 Considerations (Out of Scope)

- **CJK font support**: Embed CJK font subset (SourceHanSans) with `@pdf-lib/fontkit`, load on-demand when CJK characters detected
- **Page range selection**: All pages / odd / even / custom page numbers
- **Web Worker**: Move pdf-lib processing off main thread for large files
- **Batch PDF processing**: Apply same watermark to multiple PDFs
