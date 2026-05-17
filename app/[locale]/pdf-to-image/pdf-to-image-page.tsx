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

  // Thumbnails (pageIndex -> data URL)
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
    let total = 0;
    for (const idx of selectedPages) {
      const thumb = thumbnails.get(idx);
      // Default PDF letter size ratio: 612x792 pts
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

  // Compute output dimensions for display
  const firstPageViewport = thumbnails.size > 0 ? { w: 612, h: 792 } : null;

  const canConvert = !processing && sourceData !== null && pageCount > 0 && selectedPages.size > 0;

  // --- Result state ---
  if (results.length > 0) {
    const totalSize = results.reduce((sum, r) => sum + r.blob.size, 0);
    return (
      <section className="mt-4 flex flex-col gap-4">
        <div className="rounded-xl border border-accent-cyan/30 bg-accent-cyan-dim/10 p-6 text-center">
          <div className="text-2xl mb-2">✅</div>
          <p className="text-fg-primary font-semibold text-lg mb-2">{t("convertSuccess")}</p>
          <p className="text-fg-secondary text-sm">
            {t("totalPages", { count: results.length })} —{" "}
            {t("totalSize", { size: formatBytes(totalSize) })}
          </p>
        </div>

        <div
          className="max-h-[70vh] overflow-y-auto space-y-2"
          style={{ scrollbarGutter: "stable" }}
        >
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

        <div className="flex items-center justify-center gap-3">
          <Button variant="primary" size="md" onClick={() => downloadAsZip(results, format)}>
            <Download size={16} className="me-1.5" />
            {t("downloadZip")}
          </Button>
          <Button variant="outline" size="md" onClick={handleStartOver}>
            <RotateCw size={16} className="me-1.5" />
            {t("startOver")}
          </Button>
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
