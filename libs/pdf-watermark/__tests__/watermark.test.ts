import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { calculatePosition, generateTilingGrid, addWatermark } from "../watermark";
import type { TextWatermarkConfig, WatermarkOptions } from "../types";

describe("calculatePosition", () => {
  // A4 page: 595 x 842 pt (standard PDF units)
  const pw = 595;
  const ph = 842;
  const mw = 100;
  const mh = 50;

  it("returns center of page for center preset", () => {
    const pos = calculatePosition("center", pw, ph, mw, mh);
    expect(pos).toEqual({ x: pw / 2, y: ph / 2 });
  });

  it("returns padded top-left position (PDF coords: y increases upward)", () => {
    const pos = calculatePosition("top-left", pw, ph, mw, mh);
    expect(pos.x).toBeCloseTo(59.5 + 50, 1);
    expect(pos.y).toBeCloseTo(842 - 84.2 - 25, 1);
  });

  it("returns padded top-center position", () => {
    const pos = calculatePosition("top-center", pw, ph, mw, mh);
    expect(pos.x).toBeCloseTo(pw / 2, 1);
    expect(pos.y).toBeCloseTo(842 - 84.2 - 25, 1);
  });

  it("returns padded top-right position", () => {
    const pos = calculatePosition("top-right", pw, ph, mw, mh);
    expect(pos.x).toBeCloseTo(595 - 59.5 - 50, 1);
    expect(pos.y).toBeCloseTo(842 - 84.2 - 25, 1);
  });

  it("returns padded left-center position", () => {
    const pos = calculatePosition("left-center", pw, ph, mw, mh);
    expect(pos.x).toBeCloseTo(59.5 + 50, 1);
    expect(pos.y).toBeCloseTo(ph / 2, 1);
  });

  it("returns padded right-center position", () => {
    const pos = calculatePosition("right-center", pw, ph, mw, mh);
    expect(pos.x).toBeCloseTo(595 - 59.5 - 50, 1);
    expect(pos.y).toBeCloseTo(ph / 2, 1);
  });

  it("returns padded bottom-left position", () => {
    const pos = calculatePosition("bottom-left", pw, ph, mw, mh);
    expect(pos.x).toBeCloseTo(59.5 + 50, 1);
    expect(pos.y).toBeCloseTo(84.2 + 25, 1);
  });

  it("returns padded bottom-center position", () => {
    const pos = calculatePosition("bottom-center", pw, ph, mw, mh);
    expect(pos.x).toBeCloseTo(pw / 2, 1);
    expect(pos.y).toBeCloseTo(84.2 + 25, 1);
  });

  it("returns padded bottom-right position", () => {
    const pos = calculatePosition("bottom-right", pw, ph, mw, mh);
    expect(pos.x).toBeCloseTo(595 - 59.5 - 50, 1);
    expect(pos.y).toBeCloseTo(84.2 + 25, 1);
  });

  it("handles larger mark dimensions correctly", () => {
    const pos = calculatePosition("top-left", pw, ph, 200, 100);
    expect(pos.x).toBeCloseTo(59.5 + 100, 1);
    expect(pos.y).toBeCloseTo(842 - 84.2 - 50, 1);
  });
});

describe("generateTilingGrid", () => {
  const pw = 595;
  const ph = 842;
  const mw = 100;
  const mh = 50;

  it("generates grid points for a page", () => {
    const points = generateTilingGrid(pw, ph, mw, mh, 2.0);
    expect(points.length).toBeGreaterThan(0);
  });

  it("extends grid beyond page bounds for overflow coverage", () => {
    const points = generateTilingGrid(pw, ph, mw, mh, 2.0);
    const hasNegativeX = points.some((p) => p.x < 0);
    const hasNegativeY = points.some((p) => p.y < 0);
    const hasBeyondRight = points.some((p) => p.x > pw);
    const hasBeyondTop = points.some((p) => p.y > ph);
    expect(hasNegativeX || hasNegativeY || hasBeyondRight || hasBeyondTop).toBe(true);
  });

  it("offsets odd rows by half the horizontal step", () => {
    const hStep = mw * 2.0;
    const vStep = mh * 2.0;
    const points = generateTilingGrid(pw, ph, mw, mh, 2.0);
    const row0Y = -1 * vStep;
    const row1Y = 0 * vStep;
    const row0Points = points.filter((p) => Math.abs(p.y - row0Y) < 0.01);
    const row1Points = points.filter((p) => Math.abs(p.y - row1Y) < 0.01);
    if (row0Points.length > 0 && row1Points.length > 0) {
      expect(row0Points[0].x).toBeCloseTo(row1Points[0].x + hStep / 2);
    }
  });

  it("generates more points with smaller spacing", () => {
    const dense = generateTilingGrid(pw, ph, mw, mh, 1.0);
    const sparse = generateTilingGrid(pw, ph, mw, mh, 3.0);
    expect(dense.length).toBeGreaterThan(sparse.length);
  });

  it("returns empty array for zero mark dimensions", () => {
    expect(generateTilingGrid(pw, ph, 0, mh, 2.0)).toEqual([]);
  });

  it("returns empty array for zero spacing", () => {
    expect(generateTilingGrid(pw, ph, mw, mh, 0)).toEqual([]);
  });
});

async function makePdf(pageCount: number): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    doc.addPage([595, 842]); // A4
  }
  const bytes = await doc.save();
  return bytes.buffer as ArrayBuffer;
}

describe("addWatermark", () => {
  const defaultOptions: WatermarkOptions = {
    mode: "single",
    position: "center",
    rotation: 0,
    spacing: 1.5,
  };

  it("adds text watermark to a single-page PDF and preserves page count", async () => {
    const pdf = await makePdf(1);
    const textConfig: TextWatermarkConfig = {
      type: "text",
      text: "DRAFT",
      fontFamily: "HelveticaBold",
      fontSize: 48,
      color: "#000000",
      opacity: 50,
    };
    const result = await addWatermark(pdf, textConfig, defaultOptions);
    expect(result.pageCount).toBe(1);
    expect(result.bytes.length).toBeGreaterThan(0);
    const doc = await PDFDocument.load(result.bytes);
    expect(doc.getPageCount()).toBe(1);
  });

  it("adds text watermark to all pages of a multi-page PDF", async () => {
    const pdf = await makePdf(5);
    const textConfig: TextWatermarkConfig = {
      type: "text",
      text: "CONFIDENTIAL",
      fontFamily: "Helvetica",
      fontSize: 36,
      color: "#FF0000",
      opacity: 30,
    };
    const result = await addWatermark(pdf, textConfig, defaultOptions);
    expect(result.pageCount).toBe(5);
  });

  it("adds text watermark in tiled mode with rotation", async () => {
    const pdf = await makePdf(1);
    const textConfig: TextWatermarkConfig = {
      type: "text",
      text: "© 2026",
      fontFamily: "Courier",
      fontSize: 24,
      color: "#808080",
      opacity: 20,
    };
    const tiledOptions: WatermarkOptions = {
      mode: "tiled",
      position: "center",
      rotation: -30,
      spacing: 2.0,
    };
    const result = await addWatermark(pdf, textConfig, tiledOptions);
    expect(result.bytes.length).toBeGreaterThan(0);
  });

  it("handles rotation in single mode", async () => {
    const pdf = await makePdf(1);
    const textConfig: TextWatermarkConfig = {
      type: "text",
      text: "SAMPLE",
      fontFamily: "TimesRoman",
      fontSize: 72,
      color: "#000000",
      opacity: 40,
    };
    const rotatedOptions: WatermarkOptions = {
      mode: "single",
      position: "center",
      rotation: 45,
      spacing: 1.5,
    };
    const result = await addWatermark(pdf, textConfig, rotatedOptions);
    expect(result.bytes.length).toBeGreaterThan(0);
  });

  it("throws on corrupted PDF data", async () => {
    const corrupted = new ArrayBuffer(10);
    const textConfig: TextWatermarkConfig = {
      type: "text",
      text: "TEST",
      fontFamily: "Helvetica",
      fontSize: 48,
      color: "#000000",
      opacity: 50,
    };
    await expect(addWatermark(corrupted, textConfig, defaultOptions)).rejects.toThrow();
  });
});
