import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { imagesToPdf, PAGE_SIZES, MARGIN_PT } from "../main";
import type { ImageInput, ImagesToPdfOptions } from "../main";

// --- Minimal test image generators ---

// Minimal 1×1 white JPG (~285 bytes)
function createMinimalJpg(): ArrayBuffer {
  // Base64 of a valid minimal 1×1 white JPEG
  const b64 =
    "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AKwA//9k=";
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

// Minimal 1×1 transparent PNG (~69 bytes)
function createMinimalPng(): ArrayBuffer {
  const b64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC";
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function makeJpgImage(w = 100, h = 100): ImageInput {
  return { data: createMinimalJpg(), width: w, height: h, format: "jpg" };
}

function makePngImage(w = 100, h = 100): ImageInput {
  return { data: createMinimalPng(), width: w, height: h, format: "png" };
}

const defaultOpts: ImagesToPdfOptions = {
  pageSize: "a4",
  orientation: "portrait",
  layout: "fit",
  margin: "small",
  alignment: "center",
};

async function getPageCount(pdfBytes: Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(pdfBytes);
  return doc.getPageCount();
}

async function getPageSize(pdfBytes: Uint8Array, pageIndex = 0) {
  const doc = await PDFDocument.load(pdfBytes);
  const page = doc.getPage(pageIndex);
  return { w: page.getWidth(), h: page.getHeight() };
}

// --- Tests ---

describe("imagesToPdf", () => {
  it("throws on empty image list", async () => {
    await expect(imagesToPdf([], defaultOpts)).rejects.toThrow("No images provided");
  });

  it("creates a single-page PDF for a single image (fit layout)", async () => {
    const pdf = await imagesToPdf([makeJpgImage()], defaultOpts);
    expect(await getPageCount(pdf)).toBe(1);
  });

  it("creates N pages for N images with fit layout", async () => {
    const images = [makeJpgImage(), makePngImage(), makeJpgImage()];
    const pdf = await imagesToPdf(images, { ...defaultOpts, layout: "fit" });
    expect(await getPageCount(pdf)).toBe(3);
  });

  it("creates N pages for N images with fill layout", async () => {
    const images = [makeJpgImage(), makePngImage()];
    const pdf = await imagesToPdf(images, { ...defaultOpts, layout: "fill" });
    expect(await getPageCount(pdf)).toBe(2);
  });

  // --- Page sizes ---

  it("uses A4 portrait dimensions (595×842)", async () => {
    const pdf = await imagesToPdf([makeJpgImage()], {
      ...defaultOpts,
      pageSize: "a4",
      orientation: "portrait",
    });
    const size = await getPageSize(pdf);
    expect(Math.round(size.w)).toBe(595);
    expect(Math.round(size.h)).toBe(842);
  });

  it("uses A4 landscape dimensions (842×595)", async () => {
    const pdf = await imagesToPdf([makeJpgImage()], {
      ...defaultOpts,
      pageSize: "a4",
      orientation: "landscape",
    });
    const size = await getPageSize(pdf);
    expect(Math.round(size.w)).toBe(842);
    expect(Math.round(size.h)).toBe(595);
  });

  it("uses Letter portrait dimensions (612×792)", async () => {
    const pdf = await imagesToPdf([makeJpgImage()], {
      ...defaultOpts,
      pageSize: "letter",
      orientation: "portrait",
    });
    const size = await getPageSize(pdf);
    expect(Math.round(size.w)).toBe(612);
    expect(Math.round(size.h)).toBe(792);
  });

  it("uses Letter landscape dimensions (792×612)", async () => {
    const pdf = await imagesToPdf([makeJpgImage()], {
      ...defaultOpts,
      pageSize: "letter",
      orientation: "landscape",
    });
    const size = await getPageSize(pdf);
    expect(Math.round(size.w)).toBe(792);
    expect(Math.round(size.h)).toBe(612);
  });

  it("uses first image dimensions for auto page size", async () => {
    const pdf = await imagesToPdf(
      [{ data: createMinimalJpg(), width: 800, height: 600, format: "jpg" }],
      { ...defaultOpts, pageSize: "auto", orientation: "portrait" }
    );
    const size = await getPageSize(pdf);
    expect(Math.round(size.w)).toBe(800);
    expect(Math.round(size.h)).toBe(600);
  });

  it("swaps auto dimensions for landscape", async () => {
    const pdf = await imagesToPdf(
      [{ data: createMinimalJpg(), width: 800, height: 600, format: "jpg" }],
      { ...defaultOpts, pageSize: "auto", orientation: "landscape" }
    );
    const size = await getPageSize(pdf);
    expect(Math.round(size.w)).toBe(600);
    expect(Math.round(size.h)).toBe(800);
  });

  // --- Grid layouts ---

  it("grid-2: 1 page for 2 images", async () => {
    const pdf = await imagesToPdf([makeJpgImage(), makePngImage()], {
      ...defaultOpts,
      layout: "grid-2",
    });
    expect(await getPageCount(pdf)).toBe(1);
  });

  it("grid-2: 2 pages for 3 images", async () => {
    const pdf = await imagesToPdf([makeJpgImage(), makePngImage(), makeJpgImage()], {
      ...defaultOpts,
      layout: "grid-2",
    });
    expect(await getPageCount(pdf)).toBe(2);
  });

  it("grid-4: 1 page for 4 images", async () => {
    const pdf = await imagesToPdf(
      [makeJpgImage(), makePngImage(), makeJpgImage(), makePngImage()],
      { ...defaultOpts, layout: "grid-4" }
    );
    expect(await getPageCount(pdf)).toBe(1);
  });

  it("grid-4: 2 pages for 5 images", async () => {
    const images = Array.from({ length: 5 }, () => makeJpgImage());
    const pdf = await imagesToPdf(images, { ...defaultOpts, layout: "grid-4" });
    expect(await getPageCount(pdf)).toBe(2);
  });

  it("grid-6: 1 page for 6 images", async () => {
    const images = Array.from({ length: 6 }, () => makeJpgImage());
    const pdf = await imagesToPdf(images, { ...defaultOpts, layout: "grid-6" });
    expect(await getPageCount(pdf)).toBe(1);
  });

  it("grid-9: 1 page for 9 images", async () => {
    const images = Array.from({ length: 9 }, () => makeJpgImage());
    const pdf = await imagesToPdf(images, { ...defaultOpts, layout: "grid-9" });
    expect(await getPageCount(pdf)).toBe(1);
  });

  it("grid-9: partially filled last page (7 images)", async () => {
    const images = Array.from({ length: 7 }, () => makeJpgImage());
    const pdf = await imagesToPdf(images, { ...defaultOpts, layout: "grid-9" });
    expect(await getPageCount(pdf)).toBe(1);
  });

  // --- Margins ---

  it("generates PDF with none margin (no effect on page dimensions)", async () => {
    const pdf = await imagesToPdf([makeJpgImage()], {
      ...defaultOpts,
      margin: "none",
    });
    const size = await getPageSize(pdf);
    // Margins don't change page size, only content positioning
    expect(Math.round(size.w)).toBe(595);
    expect(Math.round(size.h)).toBe(842);
  });

  it("generates PDF with large margin", async () => {
    const pdf = await imagesToPdf([makeJpgImage()], {
      ...defaultOpts,
      margin: "large",
    });
    expect(await getPageCount(pdf)).toBe(1);
  });

  // --- Alignment ---

  it("generates PDF with top-left alignment", async () => {
    const pdf = await imagesToPdf([makeJpgImage()], {
      ...defaultOpts,
      alignment: "top-left",
    });
    expect(await getPageCount(pdf)).toBe(1);
  });

  it("generates PDF with center alignment", async () => {
    const pdf = await imagesToPdf([makeJpgImage()], {
      ...defaultOpts,
      alignment: "center",
    });
    expect(await getPageCount(pdf)).toBe(1);
  });

  // --- Mixed formats ---

  it("handles mix of JPG and PNG images", async () => {
    const pdf = await imagesToPdf(
      [makeJpgImage(200, 300), makePngImage(400, 200), makeJpgImage(150, 150)],
      defaultOpts
    );
    expect(await getPageCount(pdf)).toBe(3);
  });

  // --- Fill layout edge cases ---

  it("fill layout with wide image on portrait page", async () => {
    const pdf = await imagesToPdf(
      [{ data: createMinimalJpg(), width: 2000, height: 500, format: "jpg" }],
      { ...defaultOpts, layout: "fill", pageSize: "a4", orientation: "portrait" }
    );
    expect(await getPageCount(pdf)).toBe(1);
  });

  it("fill layout with tall image on landscape page", async () => {
    const pdf = await imagesToPdf(
      [{ data: createMinimalPng(), width: 500, height: 2000, format: "png" }],
      { ...defaultOpts, layout: "fill", pageSize: "a4", orientation: "landscape" }
    );
    expect(await getPageCount(pdf)).toBe(1);
  });

  // --- PDF validity ---

  it("produces valid PDF bytes", async () => {
    const pdf = await imagesToPdf([makeJpgImage()], defaultOpts);
    // PDF magic bytes
    const header = new Uint8Array(pdf.buffer, 0, 5);
    const text = String.fromCharCode(...header);
    expect(text).toBe("%PDF-");
  });

  it("does not transfer ownership of input ArrayBuffers (buffer remains usable)", async () => {
    const img = makeJpgImage();
    const originalByteLength = img.data.byteLength;
    await imagesToPdf([img], defaultOpts);
    // data.slice(0) inside imagesToPdf ensures original buffer is not detached
    expect(img.data.byteLength).toBe(originalByteLength);
  });
});
