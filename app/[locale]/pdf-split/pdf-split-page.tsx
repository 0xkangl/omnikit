"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import Layout from "../../../components/layout";
import { showToast } from "../../../libs/toast";
import { fromEvent } from "file-selector";
import { formatBytes } from "../../../utils/storage";
import { Button } from "../../../components/ui/button";
import { Download, RotateCw, Plus, X, Scissors } from "lucide-react";
import RelatedTools from "../../../components/related-tools";
import PrivacyBanner from "../../../components/privacy-banner";
import DescriptionSection from "../../../components/description-section";
import { splitPdf, getPdfPageCount } from "../../../libs/pdf-split/split";
import type {
  SplitMode,
  SplitOptions,
  SplitResult,
  SplitProgress,
} from "../../../libs/pdf-split/split";
import { renderPageThumbnail } from "../../../libs/pdf-split/thumbnail";
import { zipSync } from "fflate";

const THUMBNAIL_CONCURRENCY = 3;

const GROUP_COLORS = [
  { bg: "bg-cyan-500", border: "border-cyan-500", text: "text-cyan-500", label: "Cyan" },
  { bg: "bg-violet-500", border: "border-violet-500", text: "text-violet-500", label: "Violet" },
  { bg: "bg-amber-500", border: "border-amber-500", text: "text-amber-500", label: "Amber" },
  { bg: "bg-rose-500", border: "border-rose-500", text: "text-rose-500", label: "Rose" },
  {
    bg: "bg-emerald-500",
    border: "border-emerald-500",
    text: "text-emerald-500",
    label: "Emerald",
  },
  { bg: "bg-blue-500", border: "border-blue-500", text: "text-blue-500", label: "Blue" },
  { bg: "bg-orange-500", border: "border-orange-500", text: "text-orange-500", label: "Orange" },
  { bg: "bg-pink-500", border: "border-pink-500", text: "text-pink-500", label: "Pink" },
];

function downloadFile(file: SplitResult) {
  const blob = new Blob([new Uint8Array(file.bytes)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadAsZip(files: SplitResult[]) {
  const zipData: Record<string, Uint8Array> = {};
  for (const file of files) {
    zipData[file.name] = file.bytes;
  }
  const zipBytes = zipSync(zipData);
  const blob = new Blob([new Uint8Array(zipBytes)], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "split-pages.zip";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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
  const t = useTranslations("pdf-split");
  const tc = useTranslations("common");

  // Source file
  const [sourceData, setSourceData] = useState<ArrayBuffer | null>(null);
  const [pageCount, setPageCount] = useState(0);

  // Thumbnails (pageIndex → data URL)
  const [thumbnails, setThumbnails] = useState<Map<number, string>>(new Map());

  // Mode & params
  const [mode, setMode] = useState<SplitMode>("extract-all");
  const [ranges, setRanges] = useState<{ from: number; to: number }[]>([{ from: 1, to: 1 }]);
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
  const [groups, setGroups] = useState<number[][]>([[]]);
  const [activeGroupIndex, setActiveGroupIndex] = useState(0);

  // Processing
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState<SplitProgress | null>(null);
  const [results, setResults] = useState<SplitResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  const dropZoneRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Refs for cleanup on unmount
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

  // Drag-and-drop file handling
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadPdf uses setters that don't change
  }, [t]);

  async function loadPdf(file: File) {
    try {
      const data = await file.arrayBuffer();
      const count = await getPdfPageCount(data);
      setSourceData(data);
      setPageCount(count);
      setMode("extract-all");
      setRanges([{ from: 1, to: count }]);
      setSelectedPages(new Set());
      setGroups([[]]);
      setActiveGroupIndex(0);
      setResults([]);
      setError(null);
      setThumbnails(new Map());

      // Render thumbnails with bounded concurrency
      await renderThumbnails(data, count, (index, url) => {
        setThumbnails((prev) => {
          const next = new Map(prev);
          next.set(index, url);
          return next;
        });
      });
    } catch {
      showToast(t("corruptedPdf"), "danger");
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

  // Range helpers
  function addRange() {
    setRanges((prev) => [...prev, { from: 1, to: pageCount }]);
  }

  function removeRange(index: number) {
    setRanges((prev) => prev.filter((_, i) => i !== index));
  }

  function updateRange(index: number, field: "from" | "to", value: string) {
    setRanges((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: parseInt(value, 10) || 1 };
      return updated;
    });
  }

  // Select pages helpers
  function togglePage(pageIndex: number) {
    setGroups((prevGroups) => {
      const updated = prevGroups.map((g) => [...g]);
      const inActive = updated[activeGroupIndex]?.includes(pageIndex);
      if (inActive) {
        updated[activeGroupIndex] = updated[activeGroupIndex].filter((p) => p !== pageIndex);
      } else {
        for (let i = 0; i < updated.length; i++) {
          updated[i] = updated[i].filter((p) => p !== pageIndex);
        }
        updated[activeGroupIndex] = [...updated[activeGroupIndex], pageIndex].sort((a, b) => a - b);
      }
      return updated;
    });
    setSelectedPages((prev) => {
      const next = new Set(prev);
      if (next.has(pageIndex)) {
        next.delete(pageIndex);
      } else {
        next.add(pageIndex);
      }
      return next;
    });
  }

  function selectAll() {
    const all = Array.from({ length: pageCount }, (_, i) => i);
    setSelectedPages(new Set(all));
    setGroups((prev) => {
      const updated = prev.map((g) => [...g]);
      updated[activeGroupIndex] = all;
      return updated;
    });
  }

  function deselectAll() {
    setSelectedPages(new Set());
    setGroups((prev) => prev.map((g) => []));
  }

  function addGroup() {
    setGroups((prev) => [...prev, []]);
    setActiveGroupIndex(groups.length);
  }

  function removeGroup(index: number) {
    if (groups.length <= 1) return;
    setGroups((prev) => prev.filter((_, i) => i !== index));
    if (activeGroupIndex >= groups.length - 1) {
      setActiveGroupIndex(Math.max(0, groups.length - 2));
    }
  }

  function removePageFromGroup(pageIndex: number, groupIndex: number) {
    setGroups((prev) => {
      const updated = prev.map((g) => [...g]);
      updated[groupIndex] = updated[groupIndex].filter((p) => p !== pageIndex);
      return updated;
    });
    const stillAssigned = groups.some((g, i) => i !== groupIndex && g.includes(pageIndex));
    if (!stillAssigned) {
      setSelectedPages((prev) => {
        const next = new Set(prev);
        next.delete(pageIndex);
        return next;
      });
    }
  }

  // Build split options from current state
  function buildSplitOptions(): SplitOptions | null {
    if (mode === "extract-all") {
      return { mode: "extract-all" };
    }
    if (mode === "by-range") {
      const validRanges = ranges.filter(
        (r) => r.from >= 1 && r.to >= r.from && r.from <= pageCount
      );
      if (validRanges.length === 0) return null;
      return { mode: "by-range", ranges: validRanges };
    }
    if (mode === "select-pages") {
      const nonEmptyGroups = groups.filter((g) => g.length > 0);
      if (nonEmptyGroups.length === 0) return null;
      return { mode: "select-pages", groups: nonEmptyGroups };
    }
    return null;
  }

  async function handleSplit() {
    if (!sourceData) return;
    const options = buildSplitOptions();
    if (!options) return;

    setProcessing(true);
    setProgress(null);
    setError(null);
    setResults([]);

    try {
      const splitResults = await splitPdf(sourceData, options, (p) => {
        setProgress(p);
      });
      setResults(splitResults);
    } catch {
      setError(t("splitFailed"));
      showToast(t("splitFailed"), "danger");
    } finally {
      setProcessing(false);
      setProgress(null);
    }
  }

  function handleNewSplit() {
    setSourceData(null);
    setPageCount(0);
    setThumbnails(new Map());
    setMode("extract-all");
    setRanges([{ from: 1, to: 1 }]);
    setSelectedPages(new Set());
    setGroups([[]]);
    setActiveGroupIndex(0);
    setResults([]);
    setError(null);
    setProgress(null);
    setProcessing(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const canSplit =
    !processing && sourceData !== null && pageCount > 0 && buildSplitOptions() !== null;

  // --- Result state ---
  if (results.length > 0) {
    return (
      <section className="mt-4">
        <div className="rounded-xl border border-accent-cyan/30 bg-accent-cyan-dim/10 p-6 text-center">
          <div className="text-2xl mb-2">✅</div>
          <p className="text-fg-primary font-semibold text-lg mb-2">{t("splitSuccess")}</p>
          <p className="text-fg-secondary text-sm mb-6">
            {t("totalFiles", { count: results.length })} — {t("pagesCount", { count: pageCount })}
          </p>

          <div className="space-y-2 max-w-md mx-auto text-left">
            {results.map((result, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-3 rounded-lg border border-border-default bg-bg-surface p-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-fg-primary truncate">{result.name}</p>
                  <p className="text-xs text-fg-muted">{formatBytes(result.bytes.byteLength)}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => downloadFile(result)}>
                  <Download size={14} className="me-1" />
                  {t("download")}
                </Button>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-center gap-3 mt-6">
            <Button variant="primary" size="md" onClick={() => downloadAsZip(results)}>
              <Download size={16} className="me-1.5" />
              {t("downloadZip")}
            </Button>
            <Button variant="outline" size="md" onClick={handleNewSplit}>
              <RotateCw size={16} className="me-1.5" />
              {t("newSplit")}
            </Button>
          </div>
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
            <span className="text-3xl mb-2">📑</span>
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

  // --- Loaded state — controls + thumbnails ---
  return (
    <section className="mt-4">
      {/* Mode tabs */}
      <div className="flex gap-2 mb-4">
        {(["extract-all", "by-range", "select-pages"] as SplitMode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              if (m !== "select-pages") {
                setSelectedPages(new Set());
                setGroups([[]]);
                setActiveGroupIndex(0);
              }
              if (m !== "by-range") {
                setRanges([{ from: 1, to: pageCount }]);
              }
              setMode(m);
            }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === m
                ? "bg-accent-cyan text-bg-base"
                : "bg-bg-surface text-fg-secondary hover:text-fg-primary border border-border-default"
            }`}
          >
            {t(
              m === "extract-all"
                ? "modeExtractAll"
                : m === "by-range"
                  ? "modeByRange"
                  : "modeSelectPages"
            )}
          </button>
        ))}
      </div>

      {/* Thumbnail grid */}
      <div
        className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 mb-4 max-h-[480px] overflow-y-auto"
        style={{ scrollbarGutter: "stable" }}
      >
        {Array.from({ length: pageCount }, (_, i) => {
          const isSelected = selectedPages.has(i);
          const inRange =
            mode === "by-range" && ranges.some((r) => i >= r.from - 1 && i <= r.to - 1);
          const assignedGroup =
            mode === "select-pages" ? groups.findIndex((g) => g.includes(i)) : -1;
          const groupColor =
            assignedGroup >= 0 ? GROUP_COLORS[assignedGroup % GROUP_COLORS.length] : null;

          return (
            /* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- thumbnail page selection */
            <div
              key={i}
              onClick={() => {
                if (mode === "select-pages") togglePage(i);
              }}
              onKeyDown={() => {}}
              className={`relative rounded-lg border overflow-hidden transition-all ${
                mode === "select-pages" ? "cursor-pointer" : "cursor-default"
              } ${
                mode === "select-pages" && groupColor
                  ? `${groupColor.border} ring-2 ring-current/30 ${groupColor.text}`
                  : isSelected || inRange
                    ? "border-accent-cyan ring-2 ring-accent-cyan/30"
                    : "border-border-default hover:border-accent-cyan/50"
              }`}
            >
              <div className="aspect-[3/4] bg-bg-input flex items-center justify-center">
                {thumbnails.has(i) ? (
                  /* eslint-disable-next-line @next/next/no-img-element -- data URL thumbnail */
                  <img
                    src={thumbnails.get(i)!}
                    alt={t("page", { num: i + 1 })}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="w-5 h-5 border-2 border-accent-cyan border-t-transparent rounded-full animate-spin" />
                )}
              </div>
              <div className="px-2 py-1 text-xs text-fg-muted text-center truncate">{i + 1}</div>
              {mode === "select-pages" && groupColor && (
                <div
                  className={`absolute top-1 right-1 w-5 h-5 rounded-full ${groupColor.bg} text-white flex items-center justify-center text-xs font-bold`}
                >
                  {assignedGroup + 1}
                </div>
              )}
              {mode === "select-pages" && !groupColor && isSelected && (
                <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-fg-muted/30 text-fg-primary flex items-center justify-center text-xs font-bold">
                  ?
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-sm text-fg-secondary mb-4">{t("pagesCount", { count: pageCount })}</p>

      {/* Mode-specific controls */}
      {mode === "by-range" && (
        <div className="space-y-2 mb-4">
          {ranges.map((range, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <span className="text-sm text-fg-secondary">{t("rangeFrom")}</span>
              <input
                type="number"
                min={1}
                max={pageCount}
                value={range.from}
                onChange={(e) => updateRange(idx, "from", e.target.value)}
                className="w-20 px-2 py-1 text-sm rounded border border-border-default bg-bg-input text-fg-primary"
              />
              <span className="text-sm text-fg-secondary">{t("rangeTo")}</span>
              <input
                type="number"
                min={1}
                max={pageCount}
                value={range.to}
                onChange={(e) => updateRange(idx, "to", e.target.value)}
                className="w-20 px-2 py-1 text-sm rounded border border-border-default bg-bg-input text-fg-primary"
              />
              {ranges.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeRange(idx)}
                  className="text-fg-muted hover:text-danger transition-colors"
                  title={t("removeRange")}
                >
                  <X size={16} />
                </button>
              )}
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addRange}>
            <Plus size={14} className="me-1" />
            {t("addRange")}
          </Button>
        </div>
      )}

      {mode === "select-pages" && (
        <div className="mb-4">
          <div className="flex gap-2 mb-3">
            <Button variant="outline" size="sm" onClick={selectAll}>
              {t("selectAll")}
            </Button>
            <Button variant="outline" size="sm" onClick={deselectAll}>
              {t("deselectAll")}
            </Button>
            <Button variant="outline" size="sm" onClick={addGroup}>
              <Plus size={14} className="me-1" />
              {t("newGroup")}
            </Button>
          </div>

          <div className="space-y-2">
            {groups.map((groupPages, gi) => {
              const color = GROUP_COLORS[gi % GROUP_COLORS.length];
              const isActive = gi === activeGroupIndex;
              return (
                <div
                  key={gi}
                  role="button"
                  tabIndex={0}
                  onClick={() => setActiveGroupIndex(gi)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") setActiveGroupIndex(gi);
                  }}
                  className={`rounded-lg border p-3 cursor-pointer transition-all ${
                    isActive
                      ? `${color.border} border-2 ${color.text} bg-bg-surface`
                      : "border-border-default bg-bg-surface hover:border-border-subtle"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`inline-block w-3 h-3 rounded-full ${color.bg}`} />
                      <span className="text-sm font-medium text-fg-primary">
                        {t("groupLabel", { num: gi + 1 })}
                      </span>
                      <span className="text-xs text-fg-muted">
                        ({groupPages.length}{" "}
                        {groupPages.length === 1 ? t("pageSingular") : t("pagePlural")})
                      </span>
                      {isActive && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-accent-cyan/15 text-accent-cyan font-medium">
                          {t("activeGroup")}
                        </span>
                      )}
                    </div>
                    {groups.length > 1 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeGroup(gi);
                        }}
                        className="text-fg-muted hover:text-danger transition-colors p-1"
                        title={t("removeGroup")}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                  {groupPages.length > 0 ? (
                    <div
                      className="flex gap-1.5 overflow-x-auto"
                      style={{ scrollbarGutter: "stable" }}
                    >
                      {groupPages.map((pi) => {
                        const thumbUrl = thumbnails.get(pi);
                        return (
                          <div
                            key={pi}
                            className="relative group/thumb rounded border border-border-default overflow-hidden shrink-0"
                            style={{ width: 40, height: 52 }}
                          >
                            {thumbUrl ? (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img
                                src={thumbUrl}
                                alt={t("page", { num: pi + 1 })}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full bg-bg-input" />
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                removePageFromGroup(pi, gi);
                              }}
                              className="absolute inset-0 flex items-center justify-center bg-bg-base/70 opacity-0 group-hover/thumb:opacity-100 transition-opacity"
                            >
                              <X size={12} className="text-danger" />
                            </button>
                            <span className="absolute bottom-0 left-0 right-0 text-center text-[9px] text-fg-muted bg-bg-base/80">
                              {pi + 1}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-fg-muted italic">{t("emptyGroup")}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Progress bar */}
      {processing && progress && (
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-fg-muted mb-1">
            <span>{t("splitProgress", { current: progress.current, total: progress.total })}</span>
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

      {/* Split button */}
      <div className="mt-4 flex justify-center">
        <Button
          variant="primary"
          size="lg"
          disabled={!canSplit}
          onClick={handleSplit}
          className="w-full max-w-md rounded-full uppercase font-bold"
        >
          <Scissors size={18} className="me-1.5" />
          {processing ? t("splitting") : t("splitButton")}
        </Button>
      </div>

      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </section>
  );
}

function Description() {
  return <DescriptionSection namespace="pdf-split" />;
}

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
