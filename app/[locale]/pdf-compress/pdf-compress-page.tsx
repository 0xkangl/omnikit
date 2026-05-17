"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import Layout from "../../../components/layout";
import PrivacyBanner from "../../../components/privacy-banner";
import DescriptionSection from "../../../components/description-section";
import RelatedTools from "../../../components/related-tools";
import ImageInfoBar from "../../../components/image/ImageInfoBar";
import { Download, RefreshCw, FileText, ChevronLeft, ChevronRight } from "lucide-react";
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

interface RenderablePage {
  getViewport(o: { scale: number }): { width: number; height: number };
  render(o: {
    canvasContext: CanvasRenderingContext2D;
    viewport: { width: number; height: number };
  }): { promise: Promise<void> };
}

async function renderPageToDataUrl(page: RenderablePage) {
  const viewport = page.getViewport({ scale: 1 });
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
  return dataUrl;
}

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
  const [previewPage, setPreviewPage] = useState(1);

  const pageCache = useRef<Map<number, string>>(new Map());
  const renderAbortRef = useRef(0);

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

      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 1 });
      const dimensions = { width: Math.round(viewport.width), height: Math.round(viewport.height) };

      const dataUrl = await renderPageToDataUrl(page);

      pdf.destroy();

      pageCache.current.clear();
      pageCache.current.set(1, dataUrl);

      setSourceFile(file);
      setArrayBuffer(buffer);
      setNumPages(count);
      setPageDimensions(dimensions);
      setPreviewDataUrl(dataUrl);
      setPreviewPage(1);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.toLowerCase().includes("password") || msg.toLowerCase().includes("encrypt")) {
        showToast(t("encryptedPdf"), "danger");
      } else {
        showToast(t("corruptedPdf"), "danger");
      }
    }
  }

  async function changePreviewPage(pageNum: number) {
    if (!arrayBuffer || pageNum < 1 || pageNum > numPages) return;

    if (pageCache.current.has(pageNum)) {
      setPreviewPage(pageNum);
      setPreviewDataUrl(pageCache.current.get(pageNum)!);
      return;
    }

    const callId = ++renderAbortRef.current;
    setPreviewPage(pageNum);
    setPreviewDataUrl(null);

    try {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      const pdf = await pdfjs.getDocument({ data: new Uint8Array(arrayBuffer.slice(0)) }).promise;
      const page = await pdf.getPage(pageNum);
      const dataUrl = await renderPageToDataUrl(page);
      pdf.destroy();

      if (callId !== renderAbortRef.current) return;

      pageCache.current.set(pageNum, dataUrl);
      setPreviewDataUrl(dataUrl);
    } catch {
      if (callId !== renderAbortRef.current) return;
      showToast(t("corruptedPdf"), "danger");
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
            const blob = new Blob([result.buffer as ArrayBuffer], { type: "application/pdf" });
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
    setPreviewPage(1);
    setQuality(75);
    setProcessing(false);
    setProgress(null);
    setResultBlob(null);
    initialLoadRef.current = true;
    pageCache.current.clear();
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
          <div className="relative rounded-lg border border-border-default bg-bg-input overflow-auto h-[70vh] flex items-center justify-center">
            {previewDataUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element -- data URL preview */
              <img
                src={previewDataUrl}
                alt={`PDF page ${previewPage} preview`}
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="w-8 h-8 border-2 border-accent-cyan border-t-transparent rounded-full animate-spin" />
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

          {numPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={previewPage <= 1}
                onClick={() => changePreviewPage(previewPage - 1)}
              >
                <ChevronLeft size={14} />
              </Button>
              <span className="text-sm text-fg-secondary tabular-nums">
                {previewPage} / {numPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={previewPage >= numPages}
                onClick={() => changePreviewPage(previewPage + 1)}
              >
                <ChevronRight size={14} />
              </Button>
            </div>
          )}

          {/* Info bar with ImageInfoBar */}
          {resultBlob && (
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
