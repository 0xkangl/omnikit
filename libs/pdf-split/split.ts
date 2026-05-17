import { PDFDocument } from "pdf-lib";

export type SplitMode = "extract-all" | "by-range" | "select-pages";

export interface ExtractAllOptions {
  mode: "extract-all";
}

export interface SplitByRangeOptions {
  mode: "by-range";
  ranges: { from: number; to: number }[]; // 1-indexed, inclusive
}

export interface SelectPagesOptions {
  mode: "select-pages";
  groups: number[][]; // Each group is 0-indexed page indices
}

export type SplitOptions = ExtractAllOptions | SplitByRangeOptions | SelectPagesOptions;

export interface SplitResult {
  name: string; // e.g., "pages_1-3.pdf"
  bytes: Uint8Array;
}

export interface SplitProgress {
  current: number;
  total: number;
}

export async function getPdfPageCount(data: ArrayBuffer): Promise<number> {
  const doc = await PDFDocument.load(new Uint8Array(data.slice(0)), {
    ignoreEncryption: true,
  });
  return doc.getPageCount();
}

export async function splitPdf(
  sourceData: ArrayBuffer,
  options: SplitOptions,
  onProgress?: (progress: SplitProgress) => void
): Promise<SplitResult[]> {
  const srcDoc = await PDFDocument.load(new Uint8Array(sourceData.slice(0)), {
    ignoreEncryption: true,
  });
  const totalPages = srcDoc.getPageCount();
  const results: SplitResult[] = [];

  if (options.mode === "extract-all") {
    for (let i = 0; i < totalPages; i++) {
      onProgress?.({ current: i + 1, total: totalPages });
      const newDoc = await PDFDocument.create();
      const [page] = await newDoc.copyPages(srcDoc, [i]);
      newDoc.addPage(page);
      const bytes = await newDoc.save();
      results.push({
        name: `page_${i + 1}.pdf`,
        bytes: new Uint8Array(bytes),
      });
    }
  } else if (options.mode === "by-range") {
    for (const range of options.ranges) {
      const from = Math.max(0, range.from - 1); // Convert to 0-indexed
      const to = Math.min(totalPages - 1, range.to - 1);
      if (from > to) continue;

      onProgress?.({ current: results.length + 1, total: options.ranges.length });
      const newDoc = await PDFDocument.create();
      const indices = [];
      for (let i = from; i <= to; i++) {
        indices.push(i);
      }
      const pages = await newDoc.copyPages(srcDoc, indices);
      for (const page of pages) {
        newDoc.addPage(page);
      }
      const bytes = await newDoc.save();
      results.push({
        name: `pages_${range.from}-${range.to}.pdf`,
        bytes: new Uint8Array(bytes),
      });
    }
  } else if (options.mode === "select-pages") {
    for (const group of options.groups) {
      if (group.length === 0) continue;

      onProgress?.({ current: results.length + 1, total: options.groups.length });
      const newDoc = await PDFDocument.create();
      const sortedIndices = [...group].sort((a, b) => a - b);
      const pages = await newDoc.copyPages(srcDoc, sortedIndices);
      for (const page of pages) {
        newDoc.addPage(page);
      }
      const bytes = await newDoc.save();

      // Generate filename from sorted page numbers (1-indexed)
      const pageNumbers = sortedIndices.map((i) => i + 1);
      let name: string;
      if (pageNumbers.length === 1) {
        name = `page_${pageNumbers[0]}.pdf`;
      } else {
        name = `pages_${pageNumbers[0]}-${pageNumbers[pageNumbers.length - 1]}.pdf`;
      }
      results.push({ name, bytes: new Uint8Array(bytes) });
    }
  }

  return results;
}
