import { describe, it, expect } from "vitest";
import { validatePdfBuffer, mapQuality, SCALE_FACTOR } from "../compress";

describe("validatePdfBuffer", () => {
  it("accepts a valid PDF header", () => {
    const data = new TextEncoder().encode("%PDF-1.7 rest of file...").buffer;
    expect(() => validatePdfBuffer(data)).not.toThrow();
  });

  it("throws on empty buffer", () => {
    expect(() => validatePdfBuffer(new ArrayBuffer(0))).toThrow("Invalid PDF: empty buffer");
  });

  it("throws on non-PDF data", () => {
    const data = new TextEncoder().encode("Hello, world!").buffer;
    expect(() => validatePdfBuffer(data)).toThrow("Invalid PDF: not a valid PDF file");
  });

  it("throws on a buffer that starts with wrong magic bytes", () => {
    const data = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d]).buffer; // PNG header
    expect(() => validatePdfBuffer(data)).toThrow("Invalid PDF: not a valid PDF file");
  });
});

describe("mapQuality", () => {
  it("maps 1 to 0.01", () => {
    expect(mapQuality(1)).toBeCloseTo(0.01, 2);
  });

  it("maps 100 to 1.0", () => {
    expect(mapQuality(100)).toBe(1);
  });

  it("maps 75 to 0.75", () => {
    expect(mapQuality(75)).toBe(0.75);
  });

  it("maps 50 to 0.50", () => {
    expect(mapQuality(50)).toBe(0.5);
  });

  it("clamps values below 1 to 0.01", () => {
    expect(mapQuality(0)).toBeCloseTo(0.01, 2);
    expect(mapQuality(-10)).toBeCloseTo(0.01, 2);
  });

  it("clamps values above 100 to 1.0", () => {
    expect(mapQuality(150)).toBe(1);
  });
});

describe("SCALE_FACTOR", () => {
  it("equals 150/72 (render DPI / PDF DPI)", () => {
    expect(SCALE_FACTOR).toBeCloseTo(150 / 72, 4);
  });
});
