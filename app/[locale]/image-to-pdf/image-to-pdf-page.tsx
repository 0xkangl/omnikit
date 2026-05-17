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

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual's useVirtualizer returns functions that cannot be auto-memoized by React Compiler
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
        role="button"
        tabIndex={0}
        aria-label={`Page ${pageOfImage}: ${img.file.name}`}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onPageSelect(pageOfImage);
          }
        }}
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

  const safeCurrentPage = currentPage > totalPages ? 1 : currentPage;

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
    const startIdx = (safeCurrentPage - 1) * perPage;
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

  useEffect(() => {
    if (images.length === 0) return;
    const timer = setTimeout(() => {
      renderPreview();
    }, PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images, pageSize, orientation, layout, margin, alignment, safeCurrentPage]);

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
      const blob = new Blob([new Uint8Array(pdfBytes)], { type: "application/pdf" });
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
                {t(`margin${m.charAt(0).toUpperCase() + m.slice(1)}` as Parameters<typeof t>[0])}
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
            disabled={safeCurrentPage <= 1}
            className="p-1 rounded hover:bg-bg-elevated disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft size={18} />
          </button>
          <span>{t("pageOf", { current: safeCurrentPage, total: totalPages })}</span>
          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={safeCurrentPage >= totalPages}
            className="p-1 rounded hover:bg-bg-elevated disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        {/* Thumbnail List */}
        <ThumbnailList
          images={images}
          currentPage={safeCurrentPage}
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
