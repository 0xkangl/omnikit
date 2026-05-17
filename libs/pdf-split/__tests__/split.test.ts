import { describe, it, expect, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { splitPdf, getPdfPageCount } from "../split";

async function makePdf(pageCount: number): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    doc.addPage();
  }
  const bytes = await doc.save();
  return bytes.buffer as ArrayBuffer;
}

describe("getPdfPageCount", () => {
  it("returns correct count for single-page PDF", async () => {
    const pdf = await makePdf(1);
    expect(await getPdfPageCount(pdf)).toBe(1);
  });

  it("returns correct count for multi-page PDF", async () => {
    const pdf = await makePdf(42);
    expect(await getPdfPageCount(pdf)).toBe(42);
  });

  it("returns 1 for empty PDF (pdf-lib default)", async () => {
    const pdf = await makePdf(0);
    expect(await getPdfPageCount(pdf)).toBe(1);
  });

  it("throws on corrupted data", async () => {
    const corrupted = new ArrayBuffer(10);
    await expect(getPdfPageCount(corrupted)).rejects.toThrow();
  });
});

describe("splitPdf — extract-all mode", () => {
  it("extracts every page from a multi-page PDF", async () => {
    const pdf = await makePdf(5);
    const results = await splitPdf(pdf, { mode: "extract-all" });
    expect(results).toHaveLength(5);
    for (let i = 0; i < results.length; i++) {
      expect(results[i].name).toBe(`page_${i + 1}.pdf`);
      const doc = await PDFDocument.load(results[i].bytes);
      expect(doc.getPageCount()).toBe(1);
    }
  });

  it("handles single-page PDF", async () => {
    const pdf = await makePdf(1);
    const results = await splitPdf(pdf, { mode: "extract-all" });
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("page_1.pdf");
  });

  it("fires onProgress once per output page", async () => {
    const pdf = await makePdf(3);
    const progress = vi.fn();
    await splitPdf(pdf, { mode: "extract-all" }, progress);
    expect(progress).toHaveBeenCalledTimes(3);
    expect(progress).toHaveBeenCalledWith({ current: 1, total: 3 });
    expect(progress).toHaveBeenCalledWith({ current: 2, total: 3 });
    expect(progress).toHaveBeenCalledWith({ current: 3, total: 3 });
  });
});

describe("splitPdf — by-range mode", () => {
  it("splits by a single range", async () => {
    const pdf = await makePdf(10);
    const results = await splitPdf(pdf, {
      mode: "by-range",
      ranges: [{ from: 1, to: 5 }],
    });
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("pages_1-5.pdf");
    const doc = await PDFDocument.load(results[0].bytes);
    expect(doc.getPageCount()).toBe(5);
  });

  it("splits by multiple non-overlapping ranges", async () => {
    const pdf = await makePdf(10);
    const results = await splitPdf(pdf, {
      mode: "by-range",
      ranges: [
        { from: 1, to: 3 },
        { from: 4, to: 6 },
        { from: 7, to: 10 },
      ],
    });
    expect(results).toHaveLength(3);
    expect(results[0].name).toBe("pages_1-3.pdf");
    expect(results[1].name).toBe("pages_4-6.pdf");
    expect(results[2].name).toBe("pages_7-10.pdf");

    const doc0 = await PDFDocument.load(results[0].bytes);
    const doc1 = await PDFDocument.load(results[1].bytes);
    const doc2 = await PDFDocument.load(results[2].bytes);
    expect(doc0.getPageCount()).toBe(3);
    expect(doc1.getPageCount()).toBe(3);
    expect(doc2.getPageCount()).toBe(4);
  });

  it("handles single-page range", async () => {
    const pdf = await makePdf(5);
    const results = await splitPdf(pdf, {
      mode: "by-range",
      ranges: [{ from: 3, to: 3 }],
    });
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("pages_3-3.pdf");
    const doc = await PDFDocument.load(results[0].bytes);
    expect(doc.getPageCount()).toBe(1);
  });

  it("skips invalid ranges where from > to", async () => {
    const pdf = await makePdf(5);
    const results = await splitPdf(pdf, {
      mode: "by-range",
      ranges: [{ from: 5, to: 3 }],
    });
    expect(results).toHaveLength(0);
  });
});

describe("splitPdf — select-pages mode", () => {
  it("splits selected pages into one group", async () => {
    const pdf = await makePdf(10);
    const results = await splitPdf(pdf, {
      mode: "select-pages",
      groups: [[0, 2, 4]], // 0-indexed: pages 1, 3, 5
    });
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("pages_1-5.pdf");
    const doc = await PDFDocument.load(results[0].bytes);
    expect(doc.getPageCount()).toBe(3);
  });

  it("splits into multiple groups", async () => {
    const pdf = await makePdf(10);
    const results = await splitPdf(pdf, {
      mode: "select-pages",
      groups: [
        [0, 1],
        [5, 6, 7],
      ],
    });
    expect(results).toHaveLength(2);
    expect(results[0].name).toBe("pages_1-2.pdf");
    expect(results[1].name).toBe("pages_6-8.pdf");

    const doc0 = await PDFDocument.load(results[0].bytes);
    const doc1 = await PDFDocument.load(results[1].bytes);
    expect(doc0.getPageCount()).toBe(2);
    expect(doc1.getPageCount()).toBe(3);
  });

  it("handles single page selection", async () => {
    const pdf = await makePdf(5);
    const results = await splitPdf(pdf, {
      mode: "select-pages",
      groups: [[2]], // page 3
    });
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("page_3.pdf");
  });

  it("skips empty groups", async () => {
    const pdf = await makePdf(5);
    const results = await splitPdf(pdf, {
      mode: "select-pages",
      groups: [[], [0, 1], []],
    });
    expect(results).toHaveLength(1);
  });
});

describe("splitPdf — error handling", () => {
  it("throws on corrupted PDF data", async () => {
    const corrupted = new ArrayBuffer(10);
    await expect(splitPdf(corrupted, { mode: "extract-all" })).rejects.toThrow();
  });
});
