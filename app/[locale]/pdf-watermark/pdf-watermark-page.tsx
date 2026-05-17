"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import Layout from "../../../components/layout";
import PrivacyBanner from "../../../components/privacy-banner";
import DescriptionSection from "../../../components/description-section";
import RelatedTools from "../../../components/related-tools";
import { Download, RefreshCw, Upload } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { showToast } from "../../../libs/toast";
import { fromEvent } from "file-selector";
import { getPdfPageCount } from "../../../libs/pdf-merge/merge";
import { addWatermark } from "../../../libs/pdf-watermark/watermark";
import { renderPreview } from "../../../libs/pdf-watermark/preview";
import type {
  TextWatermarkConfig,
  ImageWatermarkConfig,
  WatermarkOptions,
  PositionPreset,
} from "../../../libs/pdf-watermark/types";
import "rc-slider/assets/index.css";

const Slider = dynamic(() => import("rc-slider"), {
  ssr: false,
  loading: () => <div className="h-6 w-full animate-pulse bg-bg-input rounded" />,
});

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

const FONT_OPTIONS = [
  { value: "Helvetica", key: "fontHelvetica" },
  { value: "HelveticaBold", key: "fontHelveticaBold" },
  { value: "Courier", key: "fontCourier" },
  { value: "CourierBold", key: "fontCourierBold" },
  { value: "TimesRoman", key: "fontTimesRoman" },
  { value: "TimesRomanBold", key: "fontTimesRomanBold" },
] as const;

const POSITION_PRESETS: PositionPreset[] = [
  "top-left",
  "top-center",
  "top-right",
  "left-center",
  "center",
  "right-center",
  "bottom-left",
  "bottom-center",
  "bottom-right",
];

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const WARN_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const WARN_PAGE_COUNT = 500;

function Conversion() {
  const t = useTranslations("pdf-watermark");
  const tc = useTranslations("common");

  // PDF source
  const [pdfData, setPdfData] = useState<ArrayBuffer | null>(null);
  const [pdfName, setPdfName] = useState("");
  const [pageCount, setPageCount] = useState(0);

  // Watermark type
  const [watermarkType, setWatermarkType] = useState<"text" | "image">("text");

  // Arrangement mode
  const [arrangementMode, setArrangementMode] = useState<"single" | "tiled">("single");

  // Text config
  const [textContent, setTextContent] = useState("© 2026");
  const [fontFamily, setFontFamily] = useState("HelveticaBold");
  const [fontSize, setFontSize] = useState(48);
  const [textColor, setTextColor] = useState("#000000");
  const [textOpacity, setTextOpacity] = useState(50);

  // Image config
  const [imageData, setImageData] = useState<ArrayBuffer | null>(null);
  const [imageMimeType, setImageMimeType] = useState<"image/png" | "image/jpeg">("image/png");
  const [imageScale, setImageScale] = useState(20);
  const [imageOpacity, setImageOpacity] = useState(80);

  // Placement
  const [position, setPosition] = useState<PositionPreset>("center");
  const [rotation, setRotation] = useState(-30);
  const [tiledSpacing, setTiledSpacing] = useState(1.5);

  // Rotation range depends on mode: single (-180 to 180), tiled (-45 to 45)
  const rotationMin = arrangementMode === "single" ? -180 : -45;
  const rotationMax = arrangementMode === "single" ? 180 : 45;

  // Preview state
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  // Refs
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const stalenessId = useRef(0);
  const prevBlobUrlRef = useRef<string | null>(null);
  const initialLoadRef = useRef(true);

  // Drop zone setup — handlePdfUpload is stable via React Compiler
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
      const dropped = await fromEvent(e);
      if (!dropped || dropped.length === 0) return;
      const file = (dropped as File[])[0];
      handlePdfUpload(file);
    };

    dz.addEventListener("dragover", onDragOver);
    dz.addEventListener("drop", onDrop);
    return () => {
      dz.removeEventListener("dragover", onDragOver);
      dz.removeEventListener("drop", onDrop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- event listener setup, handlePdfUpload uses stable setters
  }, []);

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (prevBlobUrlRef.current) URL.revokeObjectURL(prevBlobUrlRef.current);
    };
  }, []);

  async function handlePdfUpload(file: File) {
    if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
      showToast(t("onlyPdfSupported"), "warning");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      showToast(t("fileTooLarge"), "danger");
      return;
    }
    if (file.size > WARN_FILE_SIZE) {
      showToast(t("largeFile"), "info", 4000);
    }

    try {
      const buffer = await file.arrayBuffer();
      const count = await getPdfPageCount(buffer);
      setPdfData(buffer);
      setPdfName(file.name);
      setPageCount(count);

      if (count > WARN_PAGE_COUNT) {
        showToast(t("largePageCount", { count }), "info", 4000);
      }

      initialLoadRef.current = true;
    } catch {
      showToast(t("corruptedPdf"), "danger");
    }
  }

  function handlePdfSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handlePdfUpload(file);
  }

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const mime = file.type as "image/png" | "image/jpeg";
    if (mime !== "image/png" && mime !== "image/jpeg") return;
    file.arrayBuffer().then((buf) => {
      setImageData(buf);
      setImageMimeType(mime);
    });
  }

  function handleReselect() {
    setPdfData(null);
    setPdfName("");
    setPageCount(0);
    setPreviewUrl(null);
    setProcessing(false);
    initialLoadRef.current = true;
    if (prevBlobUrlRef.current) {
      URL.revokeObjectURL(prevBlobUrlRef.current);
      prevBlobUrlRef.current = null;
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // Determine if we can generate a preview
  const canPreview =
    pdfData !== null &&
    (watermarkType === "text" ? textContent.trim().length > 0 : imageData !== null);

  // Preview pipeline with debounce (matches image-watermark pattern)
  useEffect(() => {
    if (!canPreview) return;

    const watermark: TextWatermarkConfig | ImageWatermarkConfig | null =
      watermarkType === "text"
        ? {
            type: "text",
            text: textContent,
            fontFamily,
            fontSize,
            color: textColor,
            opacity: textOpacity,
          }
        : imageData
          ? {
              type: "image",
              imageData,
              mimeType: imageMimeType,
              scale: imageScale,
              opacity: imageOpacity,
            }
          : null;

    if (!watermark) return;

    const options: WatermarkOptions = {
      mode: arrangementMode,
      position,
      rotation,
      spacing: tiledSpacing,
    };

    const isInitial = initialLoadRef.current;
    initialLoadRef.current = false;

    let cancelled = false;
    const timer = setTimeout(
      async () => {
        if (cancelled) return;
        const callId = ++stalenessId.current;
        setProcessing(true);

        try {
          const result = await addWatermark(pdfData!, watermark, options);
          if (callId !== stalenessId.current) return;

          const previewDataUrl = await renderPreview(result.bytes.buffer as ArrayBuffer);
          if (callId !== stalenessId.current) return;

          if (prevBlobUrlRef.current) URL.revokeObjectURL(prevBlobUrlRef.current);
          prevBlobUrlRef.current = previewDataUrl;
          setPreviewUrl(previewDataUrl);
        } catch {
          if (callId !== stalenessId.current) return;
          showToast(t("corruptedPdf"), "danger");
        } finally {
          if (callId === stalenessId.current) setProcessing(false);
        }
      },
      isInitial ? 0 : 300
    );

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    pdfData,
    watermarkType,
    textContent,
    fontFamily,
    fontSize,
    textColor,
    textOpacity,
    imageData,
    imageMimeType,
    imageScale,
    imageOpacity,
    arrangementMode,
    position,
    rotation,
    rotationMin,
    rotationMax,
    tiledSpacing,
    canPreview,
    t,
  ]);

  async function handleDownload() {
    if (!pdfData) return;

    const watermark: TextWatermarkConfig | ImageWatermarkConfig | null =
      watermarkType === "text"
        ? {
            type: "text",
            text: textContent,
            fontFamily,
            fontSize,
            color: textColor,
            opacity: textOpacity,
          }
        : imageData
          ? {
              type: "image",
              imageData,
              mimeType: imageMimeType,
              scale: imageScale,
              opacity: imageOpacity,
            }
          : null;

    if (!watermark) return;

    const options: WatermarkOptions = {
      mode: arrangementMode,
      position,
      rotation,
      spacing: tiledSpacing,
    };

    try {
      const result = await addWatermark(pdfData, watermark, options);
      const blob = new Blob([result.bytes as Uint8Array<ArrayBuffer>], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = pdfName.replace(/\.pdf$/i, "") + "-watermarked.pdf";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      showToast(t("corruptedPdf"), "danger");
    }
  }

  // --- Drop zone view (no PDF loaded) ---
  if (!pdfData) {
    return (
      <section className="mt-4">
        <div
          ref={dropZoneRef}
          className="relative text-xl rounded-lg border-2 border-dashed border-accent-cyan/30 bg-accent-cyan-dim/10 text-accent-cyan cursor-pointer"
          style={{ width: "100%", height: "12rem" }}
        >
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-2 pointer-events-none">
            <span className="text-3xl">🔏</span>
            <span className="font-bold text-base">{t("dropPdf")}</span>
            <span className="text-sm text-accent-cyan/60">{t("supportedFormats")}</span>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
            onClick={() => {
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
            onChange={handlePdfSelect}
          />
        </div>
      </section>
    );
  }

  // --- Main view (PDF loaded) ---
  return (
    <section className="mt-4">
      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6">
        {/* Controls panel */}
        <div className="flex flex-col gap-4">
          {/* File info */}
          <div className="px-1">
            <span className="text-sm text-fg-secondary truncate block" title={pdfName}>
              {t("fileName", { name: pdfName, pages: pageCount })}
            </span>
          </div>

          {/* Watermark type tabs */}
          <div>
            <div className="flex gap-1">
              {(["text", "image"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  className={`flex-1 px-2 py-1.5 text-xs font-mono font-semibold rounded-lg transition-all duration-200 cursor-pointer ${
                    watermarkType === type
                      ? "bg-accent-cyan text-bg-base"
                      : "border border-border-default text-fg-muted hover:text-fg-secondary hover:border-fg-muted"
                  }`}
                  onClick={() => setWatermarkType(type)}
                >
                  {t(type === "text" ? "typeText" : "typeImage")}
                </button>
              ))}
            </div>
          </div>

          {/* Arrangement mode */}
          <div>
            <div className="flex gap-1">
              {(["single", "tiled"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={`flex-1 px-2 py-1.5 text-xs font-mono font-semibold rounded-lg transition-all duration-200 cursor-pointer ${
                    arrangementMode === mode
                      ? "bg-accent-purple text-bg-base"
                      : "border border-border-default text-fg-muted hover:text-fg-secondary hover:border-fg-muted"
                  }`}
                  onClick={() => {
                    setArrangementMode(mode);
                    // Clamp rotation to mode range: single (-180..180), tiled (-45..45)
                    if (mode === "tiled") {
                      setRotation((prev) => Math.max(-45, Math.min(45, prev)));
                    }
                  }}
                >
                  {t(mode === "single" ? "modeSingle" : "modeTiled")}
                </button>
              ))}
            </div>
          </div>

          {/* Text watermark config */}
          {watermarkType === "text" && (
            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-sm font-medium text-fg-secondary mb-1">
                  {t("textContent")}
                </label>
                <input
                  type="text"
                  value={textContent}
                  onChange={(e) => setTextContent(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-bg-input text-fg-primary rounded-lg border border-border-default outline-none focus:border-accent-cyan transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-fg-secondary mb-1">
                  {t("fontFamily")}
                </label>
                <select
                  value={fontFamily}
                  onChange={(e) => setFontFamily(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-bg-input text-fg-primary rounded-lg border border-border-default outline-none focus:border-accent-cyan transition-colors"
                >
                  {FONT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {t(opt.key)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium text-fg-secondary">{t("fontSize")}</label>
                  <span className="text-xs font-mono text-accent-cyan">{fontSize}pt</span>
                </div>
                <div className="px-1">
                  <Slider
                    min={12}
                    max={120}
                    step={1}
                    value={fontSize}
                    onChange={(v) => setFontSize(typeof v === "number" ? v : v[0])}
                    styles={sliderStyles}
                  />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-fg-secondary">{t("color")}</label>
                <input
                  type="color"
                  value={textColor}
                  onChange={(e) => setTextColor(e.target.value)}
                  className="w-8 h-8 rounded border border-border-default cursor-pointer"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium text-fg-secondary">{t("opacity")}</label>
                  <span className="text-xs font-mono text-accent-cyan">{textOpacity}%</span>
                </div>
                <div className="px-1">
                  <Slider
                    min={0}
                    max={100}
                    step={1}
                    value={textOpacity}
                    onChange={(v) => setTextOpacity(typeof v === "number" ? v : v[0])}
                    styles={sliderStyles}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Image watermark config */}
          {watermarkType === "image" && (
            <div className="flex flex-col gap-3">
              <div>
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/png,image/jpeg"
                  onChange={handleImageSelect}
                  className="hidden"
                />
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => imageInputRef.current?.click()}
                  className="w-full"
                >
                  <Upload size={14} />
                  {t("uploadImage")}
                </Button>
                <p className="text-xs text-fg-muted mt-1">{t("imageSupportedFormats")}</p>
              </div>

              {imageData && (
                <>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-sm font-medium text-fg-secondary">
                        {t("imageScale")}
                      </label>
                      <span className="text-xs font-mono text-accent-cyan">{imageScale}%</span>
                    </div>
                    <div className="px-1">
                      <Slider
                        min={5}
                        max={50}
                        step={1}
                        value={imageScale}
                        onChange={(v) => setImageScale(typeof v === "number" ? v : v[0])}
                        styles={sliderStyles}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-sm font-medium text-fg-secondary">
                        {t("opacity")}
                      </label>
                      <span className="text-xs font-mono text-accent-cyan">{imageOpacity}%</span>
                    </div>
                    <div className="px-1">
                      <Slider
                        min={0}
                        max={100}
                        step={1}
                        value={imageOpacity}
                        onChange={(v) => setImageOpacity(typeof v === "number" ? v : v[0])}
                        styles={sliderStyles}
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Position config (single mode) */}
          {arrangementMode === "single" && (
            <div>
              <label className="block text-sm font-medium text-fg-secondary mb-2">
                {t("position")}
              </label>
              <div className="grid grid-cols-3 gap-1">
                {POSITION_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className={`px-1 py-2 text-sm rounded-lg transition-all duration-200 cursor-pointer ${
                      position === preset
                        ? "bg-accent-cyan text-bg-base font-semibold"
                        : "border border-border-default text-fg-muted hover:text-fg-secondary hover:border-fg-muted"
                    }`}
                    onClick={() => setPosition(preset)}
                  >
                    {t(
                      `position${preset.charAt(0).toUpperCase() + preset.slice(1).replace(/-([a-z])/g, (_, c) => c.toUpperCase())}`
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Rotation — always shown, range depends on mode */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium text-fg-secondary">{t("rotation")}</label>
              <span className="text-xs font-mono text-accent-cyan">{rotation}°</span>
            </div>
            <div className="px-1">
              <Slider
                min={rotationMin}
                max={rotationMax}
                step={1}
                value={rotation}
                onChange={(v) => setRotation(typeof v === "number" ? v : v[0])}
                styles={sliderStyles}
              />
            </div>
          </div>

          {/* Tiled spacing — only in tiled mode */}
          {arrangementMode === "tiled" && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-medium text-fg-secondary">{t("tiledSpacing")}</label>
                <span className="text-xs font-mono text-accent-cyan">
                  {tiledSpacing.toFixed(1)}×
                </span>
              </div>
              <div className="px-1">
                <Slider
                  min={1.0}
                  max={3.0}
                  step={0.1}
                  value={tiledSpacing}
                  onChange={(v) => setTiledSpacing(typeof v === "number" ? v : v[0])}
                  styles={sliderStyles}
                />
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-col gap-2 mt-auto pt-2 border-t border-border-default">
            <Button
              variant="primary"
              size="md"
              onClick={handleDownload}
              disabled={!canPreview || processing}
            >
              <Download size={14} />
              {tc("download")}
            </Button>
            <Button variant="secondary" size="md" onClick={handleReselect}>
              <RefreshCw size={14} />
              {t("reselect")}
            </Button>
          </div>
        </div>

        {/* Preview */}
        <div className="flex flex-col gap-3">
          <div
            className="relative w-full rounded-lg border border-border-default bg-bg-surface overflow-hidden flex items-center justify-center"
            style={{ minHeight: "400px" }}
          >
            {previewUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element -- data URL preview */
              <img
                src={previewUrl}
                alt=""
                className="max-w-full max-h-[500px] object-contain"
                draggable={false}
              />
            ) : (
              <div className="flex flex-col items-center gap-2 text-fg-muted">
                {processing ? (
                  <>
                    <div className="w-8 h-8 border-2 border-accent-cyan border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm">{t("processing")}</span>
                  </>
                ) : (
                  <span className="text-sm">
                    {!pdfData
                      ? ""
                      : watermarkType === "text" && !textContent.trim()
                        ? t("emptyText")
                        : watermarkType === "image" && !imageData
                          ? t("noImage")
                          : ""}
                  </span>
                )}
              </div>
            )}
            {processing && previewUrl && (
              <div className="absolute inset-0 bg-bg-base/60 flex flex-col items-center justify-center gap-2 z-30">
                <div className="w-8 h-8 border-2 border-accent-cyan border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-fg-secondary">{t("processing")}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export default function PdfWatermarkPage() {
  const t = useTranslations("tools");
  return (
    <Layout
      title={t("pdf-watermark.shortTitle")}
      categoryLabel={t("categories.visual")}
      categorySlug="visual-media"
    >
      <div className="container mx-auto px-4 pt-3 pb-6">
        <PrivacyBanner variant="files" />
        <Conversion />
        <DescriptionSection namespace="pdf-watermark" />
        <RelatedTools currentTool="pdf-watermark" />
      </div>
    </Layout>
  );
}
