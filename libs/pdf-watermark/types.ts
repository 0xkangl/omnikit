// libs/pdf-watermark/types.ts

export type WatermarkType = "text" | "image";
export type WatermarkMode = "single" | "tiled";

export type PositionPreset =
  | "center"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "top-center"
  | "bottom-center"
  | "left-center"
  | "right-center";

export interface TextWatermarkConfig {
  type: "text";
  text: string;
  fontFamily: string; // Standard font name (Helvetica, HelveticaBold, Courier, CourierBold, TimesRoman, TimesRomanBold)
  fontSize: number; // pt (12-120)
  color: string; // HEX color
  opacity: number; // 0-100
}

export interface ImageWatermarkConfig {
  type: "image";
  imageData: ArrayBuffer; // PNG/JPG bytes
  mimeType: "image/png" | "image/jpeg";
  scale: number; // Percentage of page width (5-50)
  opacity: number; // 0-100
}

export interface WatermarkOptions {
  mode: WatermarkMode;
  position: PositionPreset; // Only used in "single" mode
  rotation: number; // Degrees. Tiled: -45 to 45. Single: -180 to 180.
  spacing: number; // Tiled only: multiplier of watermark dimension (1.0 to 3.0)
}

export interface WatermarkResult {
  bytes: Uint8Array;
  pageCount: number;
}
