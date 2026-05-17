import { PDFDocument, PDFPage, StandardFonts, rgb, degrees } from "pdf-lib";
import type {
  PositionPreset,
  TextWatermarkConfig,
  ImageWatermarkConfig,
  WatermarkOptions,
  WatermarkResult,
} from "./types";

export function calculatePosition(
  preset: PositionPreset,
  pageWidth: number,
  pageHeight: number,
  markWidth: number,
  markHeight: number
): { x: number; y: number } {
  const marginX = pageWidth * 0.1;
  const marginY = pageHeight * 0.1;

  const positions: Record<PositionPreset, { x: number; y: number }> = {
    center: { x: pageWidth / 2, y: pageHeight / 2 },
    "top-left": { x: marginX + markWidth / 2, y: pageHeight - marginY - markHeight / 2 },
    "top-center": { x: pageWidth / 2, y: pageHeight - marginY - markHeight / 2 },
    "top-right": {
      x: pageWidth - marginX - markWidth / 2,
      y: pageHeight - marginY - markHeight / 2,
    },
    "left-center": { x: marginX + markWidth / 2, y: pageHeight / 2 },
    "right-center": { x: pageWidth - marginX - markWidth / 2, y: pageHeight / 2 },
    "bottom-left": { x: marginX + markWidth / 2, y: marginY + markHeight / 2 },
    "bottom-center": { x: pageWidth / 2, y: marginY + markHeight / 2 },
    "bottom-right": { x: pageWidth - marginX - markWidth / 2, y: marginY + markHeight / 2 },
  };

  return positions[preset];
}

export function generateTilingGrid(
  pageWidth: number,
  pageHeight: number,
  markWidth: number,
  markHeight: number,
  spacing: number
): Array<{ x: number; y: number }> {
  const hStep = markWidth * spacing;
  const vStep = markHeight * spacing;

  if (hStep <= 0 || vStep <= 0) return [];

  const points: Array<{ x: number; y: number }> = [];
  const cols = Math.ceil(pageWidth / hStep) + 2;
  const rows = Math.ceil(pageHeight / vStep) + 2;

  for (let r = -1; r <= rows; r++) {
    const offset = r % 2 !== 0 ? hStep / 2 : 0;
    for (let c = -1; c <= cols; c++) {
      points.push({ x: c * hStep + offset, y: r * vStep });
    }
  }

  return points;
}

const STANDARD_FONT_MAP: Record<string, StandardFonts> = {
  Helvetica: StandardFonts.Helvetica,
  HelveticaBold: StandardFonts.HelveticaBold,
  Courier: StandardFonts.Courier,
  CourierBold: StandardFonts.CourierBold,
  TimesRoman: StandardFonts.TimesRoman,
  TimesRomanBold: StandardFonts.TimesRomanBold,
};

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return { r: 0, g: 0, b: 0 };
  return {
    r: parseInt(result[1], 16) / 255,
    g: parseInt(result[2], 16) / 255,
    b: parseInt(result[3], 16) / 255,
  };
}

function renderTextWatermarkOnPage(
  page: PDFPage,
  text: string,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  fontSize: number,
  color: ReturnType<typeof rgb>,
  opacity: number,
  options: WatermarkOptions
): void {
  const pw = page.getWidth();
  const ph = page.getHeight();
  const textWidth = font.widthOfTextAtSize(text, fontSize);
  const textHeight = fontSize;

  if (options.mode === "single") {
    const center = calculatePosition(options.position, pw, ph, textWidth, textHeight);
    page.drawText(text, {
      x: center.x - textWidth / 2,
      y: center.y - textHeight * 0.35,
      size: fontSize,
      font,
      color,
      opacity: opacity / 100,
      rotate: degrees(options.rotation),
    });
  } else {
    const grid = generateTilingGrid(pw, ph, textWidth, textHeight, options.spacing);
    for (const point of grid) {
      page.drawText(text, {
        x: point.x - textWidth / 2,
        y: point.y - textHeight * 0.35,
        size: fontSize,
        font,
        color,
        opacity: opacity / 100,
        rotate: degrees(options.rotation),
      });
    }
  }
}

function renderImageWatermarkOnPage(
  page: PDFPage,
  image: Awaited<ReturnType<PDFDocument["embedPng"] | PDFDocument["embedJpg"]>>,
  scale: number,
  opacity: number,
  options: WatermarkOptions
): void {
  const pw = page.getWidth();
  const ph = page.getHeight();
  const imgWidth = (scale / 100) * pw;
  const aspectRatio = image.height / image.width;
  const imgHeight = imgWidth * aspectRatio;

  if (options.mode === "single") {
    const center = calculatePosition(options.position, pw, ph, imgWidth, imgHeight);
    page.drawImage(image, {
      x: center.x - imgWidth / 2,
      y: center.y - imgHeight / 2,
      width: imgWidth,
      height: imgHeight,
      opacity: opacity / 100,
      rotate: degrees(options.rotation),
    });
  } else {
    const grid = generateTilingGrid(pw, ph, imgWidth, imgHeight, options.spacing);
    for (const point of grid) {
      page.drawImage(image, {
        x: point.x - imgWidth / 2,
        y: point.y - imgHeight / 2,
        width: imgWidth,
        height: imgHeight,
        opacity: opacity / 100,
        rotate: degrees(options.rotation),
      });
    }
  }
}

export async function addWatermark(
  pdfBytes: ArrayBuffer,
  watermark: TextWatermarkConfig | ImageWatermarkConfig,
  options: WatermarkOptions
): Promise<WatermarkResult> {
  const doc = await PDFDocument.load(new Uint8Array(pdfBytes), { ignoreEncryption: true });
  const pages = doc.getPages();
  const pageCount = pages.length;

  if (watermark.type === "text") {
    const fontEnum = STANDARD_FONT_MAP[watermark.fontFamily] ?? StandardFonts.HelveticaBold;
    const font = await doc.embedFont(fontEnum);
    const { r, g, b } = hexToRgb(watermark.color);
    const color = rgb(r, g, b);

    for (const page of pages) {
      renderTextWatermarkOnPage(
        page,
        watermark.text,
        font,
        watermark.fontSize,
        color,
        watermark.opacity,
        options
      );
    }
  } else {
    const image =
      watermark.mimeType === "image/png"
        ? await doc.embedPng(watermark.imageData)
        : await doc.embedJpg(watermark.imageData);

    for (const page of pages) {
      renderImageWatermarkOnPage(page, image, watermark.scale, watermark.opacity, options);
    }
  }

  const bytes = await doc.save();
  return { bytes, pageCount };
}
