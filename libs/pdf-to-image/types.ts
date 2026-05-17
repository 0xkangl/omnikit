import type { OutputFormat } from "../image/types";

export interface DpiPreset {
  label: string;
  scale: number;
}

export const DPI_PRESETS: DpiPreset[] = [
  { label: "preview", scale: 1.0 },
  { label: "standard", scale: 2.0 },
  { label: "high", scale: 3.0 },
  { label: "print", scale: 4.0 },
];

export const CUSTOM_DPI_MIN = 72;
export const CUSTOM_DPI_MAX = 600;
export const DPI_BASE = 72; // PDF points-per-inch

export interface RenderOptions {
  format: OutputFormat;
  quality: number; // 1-100, only for jpeg/webp
  scale: number; // DPI preset scale or custom value
}

export interface RenderResult {
  blob: Blob;
  width: number;
  height: number;
  pageIndex: number; // 0-indexed
}

export interface RenderProgress {
  current: number;
  total: number;
}
