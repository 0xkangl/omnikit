# Images to PDF — Design Spec

## Overview

A browser-based tool that converts multiple images into a single PDF document. Supports three layout modes, configurable page settings, and drag-to-reorder image management. All processing runs entirely in the browser — no data is uploaded to any server.

**Route**: `/image-to-pdf`  
**Category**: Visual & Media  
**Dependencies**: `pdf-lib` (already installed), `pdfjs-dist` (already installed)  
**New dependencies**: None

## User Requirements

| Requirement      | Details                                               |
| ---------------- | ----------------------------------------------------- |
| Input formats    | JPG, PNG, WebP, GIF (first frame only)                |
| Output           | Single PDF file download                              |
| Layout modes     | Fit-to-page, grid (2/4/6/9 per page), fill page       |
| Page settings    | Size (A4/Letter/Auto), orientation, margin, alignment |
| Image management | Drag reorder, delete, clear all, add more, preview    |

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
├── libs/image-to-pdf/main.ts         # PDF generation (pdf-lib)
├── components/image/ImageDropZone     # Reuse existing drop zone
├── components/image/useImageExport    # Reuse existing download logic
└── [new inline] thumbnail list        # Drag-reorder, delete, preview
```

### Key Decisions

| Decision       | Choice                                             | Rationale                                |
| -------------- | -------------------------------------------------- | ---------------------------------------- |
| UI approach    | Single-page layout (Approach A)                    | Consistent with all OmniKit tools        |
| PDF library    | pdf-lib (existing)                                 | Zero incremental bundle size             |
| Image input    | New multi-file logic (not reusing `useImageInput`) | `useImageInput` is single-file by design |
| Drag reorder   | HTML5 Drag & Drop API (no new library)             | Simple use case, avoid new deps          |
| Virtual scroll | `@tanstack/react-virtual` (existing)               | Already a project dependency             |

## UI Design

### Two States

**State A — No images uploaded:**

- `ImageDropZone` component (reused) with multi-file support
- Accept: JPG, PNG, WebP, GIF
- GIF/WebP animated → first frame only, show notice

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

Images that are not JPG or PNG must be converted before embedding:

1. Detect `file.type` on input
2. For WebP/GIF: `createImageBitmap(file)` → `OffscreenCanvas` → `convertToBlob({type: "image/png"})`
3. Conversion happens asynchronously when images are added (not during PDF generation)
4. Store converted `ArrayBuffer` + dimensions in component state

## Tool Registration

### `libs/tools.ts` Changes

```typescript
// TOOL_CATEGORIES.visual.tools — append:
"image-to-pdf"

// TOOLS array — append:
{
  key: "image-to-pdf",
  path: "/image-to-pdf",
  icon: FileImage,
  emoji: "🖼️",
  sameAs: ["https://en.wikipedia.org/wiki/PDF"],
}

// TOOL_RELATIONS — add:
"image-to-pdf": ["image-resize", "image-compress", "image-convert", "pdf-merge"]
// Reverse: add "image-to-pdf" to image-resize, image-compress, image-convert, pdf-merge relations
```

### i18n (10 locales)

Each locale needs:

- `public/locales/{locale}/tools.json` — add `image-to-pdf` entry with `title`, `shortTitle`, `description`
- `public/locales/{locale}/image-to-pdf.json` — tool-specific UI strings + description section

**CJK locales** (zh-CN, zh-TW, ja, ko): include `searchTerms` with romanized tokens.

### SEO & Structured Data

- `page.tsx` generates metadata via `generatePageMeta()`
- JSON-LD via `buildToolSchemas()`: SoftwareApplication + HowTo + FAQ
- OG image auto-generated
- Sitemap auto-updated from TOOLS array

## Edge Cases & Limits

| Scenario               | Handling                                                            |
| ---------------------- | ------------------------------------------------------------------- |
| Large image (>50MP)    | Reuse existing large image warning pattern                          |
| Animated GIF/WebP      | First frame only, show notice to user                               |
| Zero images + Generate | Button disabled                                                     |
| Single image           | Normal single-page PDF                                              |
| Many images (>100)     | Virtual scrolling for thumbnails, PDF generation runs without issue |
| WebP input             | Canvas → PNG conversion at upload time                              |
| Preview performance    | Render only current page + 1 adjacent page on each side             |
| File size limit        | No hard limit — all browser-side, user constrained by memory        |

## Testing

- **Unit tests** (`libs/image-to-pdf/__tests__/main.test.ts`):
  - Fit layout: image scaled proportionally within margins
  - Fill layout: image covers area, overflow centered
  - Grid layouts: correct cell division and image placement
  - A4/Letter/Auto page sizes
  - Portrait/Landscape orientation
  - Margin application (none/small/medium/large)
  - Alignment (center/top-left)
  - WebP preprocessing
  - Empty image list → throws or returns empty PDF
  - Single image → single page

## Files to Create/Modify

### Create

| File                                                 | Purpose              |
| ---------------------------------------------------- | -------------------- |
| `app/[locale]/image-to-pdf/page.tsx`                 | Route entry          |
| `app/[locale]/image-to-pdf/image-to-pdf-page.tsx`    | Page component       |
| `libs/image-to-pdf/main.ts`                          | PDF generation core  |
| `libs/image-to-pdf/__tests__/main.test.ts`           | Unit tests           |
| `public/locales/en/image-to-pdf.json`                | English UI strings   |
| `public/locales/{9 other locales}/image-to-pdf.json` | Localized UI strings |

### Modify

| File                                          | Change                                        |
| --------------------------------------------- | --------------------------------------------- |
| `libs/tools.ts`                               | Add tool entry, category, relations           |
| `public/locales/en/tools.json`                | Add title/description                         |
| `public/locales/{9 other locales}/tools.json` | Add localized title/description + searchTerms |
