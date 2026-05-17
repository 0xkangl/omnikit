import { encode } from "../../image/encode";
import { calculateDimensions } from "../../image/resize";
import { cropBitmap } from "../../image/crop";
import {
  renderWatermark,
  type TextWatermarkConfig,
  type WatermarkOptions,
  type PositionPreset,
} from "../../image/watermark";
import type { RecipeStepDef } from "../types";
import type { OutputFormat } from "../../image/types";

// --- Shared helpers ---

function isSvgDataUrl(dataUrl: string): boolean {
  return dataUrl.startsWith("data:image/svg+xml");
}

function rasterizeSvg(dataUrl: string): Promise<ImageBitmap> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("Failed to rasterize SVG"));
          return;
        }
        createImageBitmap(blob).then(resolve, reject);
      }, "image/png");
    };
    img.onerror = () => reject(new Error("Failed to load SVG image"));
    img.src = dataUrl;
  });
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, data] = dataUrl.split(",");
  const mime = meta.match(/:(.*?);/)?.[1] || "application/octet-stream";
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function detectFormat(dataUrl: string): OutputFormat {
  if (dataUrl.includes("image/jpeg") || dataUrl.includes("image/jpg")) return "jpeg";
  if (dataUrl.includes("image/webp")) return "webp";
  if (dataUrl.includes("image/png")) return "png";
  return "png";
}

async function inputToBitmap(input: string): Promise<ImageBitmap> {
  if (isSvgDataUrl(input)) return rasterizeSvg(input);
  return createImageBitmap(dataUrlToBlob(input));
}

// --- Step definitions ---

export const visualSteps: RecipeStepDef[] = [
  {
    id: "image-resize",
    name: "Resize Image",
    category: "visual",
    icon: "📐",
    description: "Resize image dimensions",
    inputType: "image",
    outputType: "image",
    parameters: [
      {
        id: "resizeMode",
        type: "select",
        label: "resizeMode",
        defaultValue: "percent",
        options: [
          { label: "By Percent", value: "percent" },
          { label: "Custom", value: "custom" },
        ],
      },
      {
        id: "resizePercent",
        type: "slider",
        label: "resizePercent",
        defaultValue: "100",
        min: 1,
        max: 400,
        step: 1,
        dependsOn: { paramId: "resizeMode", values: ["percent"] },
      },
      {
        id: "targetWidth",
        type: "text",
        label: "maxWidth",
        defaultValue: "",
        placeholder: "widthPx",
        dependsOn: { paramId: "resizeMode", values: ["custom"] },
      },
      {
        id: "targetHeight",
        type: "text",
        label: "maxHeight",
        defaultValue: "",
        placeholder: "heightPx",
        dependsOn: { paramId: "resizeMode", values: ["custom"] },
      },
    ],
    async execute(input: string, params: Record<string, string>) {
      try {
        if (!input) return { ok: false as const, error: "noImageInput" };

        const resizeMode = (params.resizeMode || "percent") as "percent" | "custom";
        const resizePercent = parseInt(params.resizePercent || "100", 10) || 100;
        const targetWidth = parseInt(params.targetWidth || "", 10) || undefined;
        const targetHeight = parseInt(params.targetHeight || "", 10) || undefined;
        const format = detectFormat(input);

        const bitmap = await inputToBitmap(input);
        const dims = calculateDimensions(
          bitmap.width,
          bitmap.height,
          resizeMode,
          resizePercent,
          targetWidth,
          targetHeight,
          true
        );

        const result = await encode(bitmap, {
          format,
          quality: 92,
          width: dims.width,
          height: dims.height,
        });

        const dataUrl = await blobToDataUrl(result);
        return { ok: true as const, output: dataUrl };
      } catch (e) {
        return { ok: false as const, error: String(e) };
      }
    },
  },
  {
    id: "image-compress",
    name: "Compress Image",
    category: "visual",
    icon: "🗜️",
    description: "Compress image quality",
    inputType: "image",
    outputType: "image",
    parameters: [
      {
        id: "quality",
        type: "slider",
        label: "quality",
        defaultValue: "80",
        min: 1,
        max: 100,
        step: 1,
      },
    ],
    async execute(input: string, params: Record<string, string>) {
      try {
        if (!input) return { ok: false as const, error: "noImageInput" };

        const quality = Math.max(1, Math.min(100, parseInt(params.quality || "80", 10) || 80));
        const format = detectFormat(input);
        // PNG is lossless — use WebP for actual compression
        const outputFormat: OutputFormat = format === "png" ? "webp" : format;

        const bitmap = await inputToBitmap(input);
        const result = await encode(bitmap, {
          format: outputFormat,
          quality,
          width: bitmap.width,
          height: bitmap.height,
        });

        const dataUrl = await blobToDataUrl(result);
        return { ok: true as const, output: dataUrl };
      } catch (e) {
        return { ok: false as const, error: String(e) };
      }
    },
  },
  {
    id: "image-convert",
    name: "Convert Image Format",
    category: "visual",
    icon: "🔄",
    description: "Convert image format",
    inputType: "image",
    outputType: "image",
    parameters: [
      {
        id: "format",
        type: "select",
        label: "format",
        defaultValue: "webp",
        options: [
          { label: "PNG", value: "png" },
          { label: "JPG", value: "jpeg" },
          { label: "WebP", value: "webp" },
        ],
      },
      {
        id: "quality",
        type: "slider",
        label: "quality",
        defaultValue: "92",
        min: 1,
        max: 100,
        step: 1,
        dependsOn: { paramId: "format", values: ["jpeg", "webp"] },
      },
    ],
    async execute(input: string, params: Record<string, string>) {
      try {
        if (!input) return { ok: false as const, error: "noImageInput" };

        const format = (params.format || "webp") as OutputFormat;
        const quality = Math.max(1, Math.min(100, parseInt(params.quality || "92", 10) || 92));

        const bitmap = await inputToBitmap(input);
        const result = await encode(bitmap, {
          format,
          quality,
          width: bitmap.width,
          height: bitmap.height,
        });

        const dataUrl = await blobToDataUrl(result);
        return { ok: true as const, output: dataUrl };
      } catch (e) {
        return { ok: false as const, error: String(e) };
      }
    },
  },
  {
    id: "image-crop",
    name: "Crop Image",
    category: "visual",
    icon: "✂️",
    description: "Crop image to region",
    inputType: "image",
    outputType: "image",
    parameters: [
      {
        id: "cropMode",
        type: "select",
        label: "cropMode",
        defaultValue: "center",
        options: [
          { label: "Center", value: "center" },
          { label: "Top Left", value: "top-left" },
          { label: "Custom", value: "custom" },
        ],
      },
      {
        id: "cropWidth",
        type: "text",
        label: "cropWidth",
        defaultValue: "",
        placeholder: "widthPx",
      },
      {
        id: "cropHeight",
        type: "text",
        label: "cropHeight",
        defaultValue: "",
        placeholder: "heightPx",
      },
      {
        id: "cropX",
        type: "text",
        label: "cropX",
        defaultValue: "0",
        placeholder: "xPx",
        dependsOn: { paramId: "cropMode", values: ["custom"] },
      },
      {
        id: "cropY",
        type: "text",
        label: "cropY",
        defaultValue: "0",
        placeholder: "yPx",
        dependsOn: { paramId: "cropMode", values: ["custom"] },
      },
    ],
    async execute(input: string, params: Record<string, string>) {
      try {
        if (!input) return { ok: false as const, error: "noImageInput" };

        const bitmap = await inputToBitmap(input);
        const mode = params.cropMode || "center";
        const w = parseInt(params.cropWidth || "", 10) || bitmap.width;
        const h = parseInt(params.cropHeight || "", 10) || bitmap.height;
        const format = detectFormat(input);

        let x: number;
        let y: number;

        if (mode === "center") {
          x = Math.max(0, Math.floor((bitmap.width - w) / 2));
          y = Math.max(0, Math.floor((bitmap.height - h) / 2));
        } else if (mode === "top-left") {
          x = 0;
          y = 0;
        } else {
          x = parseInt(params.cropX || "0", 10) || 0;
          y = parseInt(params.cropY || "0", 10) || 0;
        }

        const result = await cropBitmap(bitmap, { x, y, width: w, height: h }, format);
        const dataUrl = await blobToDataUrl(result);
        return { ok: true as const, output: dataUrl };
      } catch (e) {
        return { ok: false as const, error: String(e) };
      }
    },
  },
  {
    id: "image-watermark",
    name: "Add Watermark",
    category: "visual",
    icon: "💧",
    description: "Add text watermark to image",
    inputType: "image",
    outputType: "image",
    parameters: [
      {
        id: "text",
        type: "text",
        label: "watermarkText",
        defaultValue: "OmniKit",
        placeholder: "watermarkTextPlaceholder",
      },
      {
        id: "position",
        type: "select",
        label: "position",
        defaultValue: "bottom-right",
        options: [
          { label: "Center", value: "center" },
          { label: "Top Left", value: "top-left" },
          { label: "Top Right", value: "top-right" },
          { label: "Bottom Left", value: "bottom-left" },
          { label: "Bottom Right", value: "bottom-right" },
        ],
      },
      {
        id: "opacity",
        type: "slider",
        label: "opacity",
        defaultValue: "30",
        min: 5,
        max: 100,
        step: 5,
      },
      {
        id: "fontSize",
        type: "slider",
        label: "fontSize",
        defaultValue: "5",
        min: 1,
        max: 20,
        step: 1,
      },
    ],
    async execute(input: string, params: Record<string, string>) {
      try {
        if (!input) return { ok: false as const, error: "noImageInput" };

        const bitmap = await inputToBitmap(input);
        const format = detectFormat(input);
        const text = params.text || "OmniKit";
        const position = (params.position || "bottom-right") as PositionPreset;
        const opacity = Math.max(5, Math.min(100, parseInt(params.opacity || "30", 10) || 30));
        const fontSize = Math.max(1, Math.min(20, parseInt(params.fontSize || "5", 10) || 5));

        const watermark: TextWatermarkConfig = {
          type: "text",
          text,
          fontFamily: "Inter, sans-serif",
          fontSize,
          color: "#000000",
          opacity,
          bold: false,
        };

        const options: WatermarkOptions = {
          mode: "single",
          position,
          rotation: 0,
          spacing: 1,
        };

        const result = await renderWatermark(bitmap, format, watermark, options);
        const dataUrl = await blobToDataUrl(result);
        return { ok: true as const, output: dataUrl };
      } catch (e) {
        return { ok: false as const, error: String(e) };
      }
    },
  },
];
