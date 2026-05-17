type StepMapping = string | ((toolState: Record<string, unknown>) => string);

export const TOOL_STEP_MAP: Record<string, StepMapping> = {
  "/base64": (state) => (state.mode === "decode" ? "base64-decode" : "base64-encode"),
  "/urlencoder": (state) => {
    const mode = state.mode as string;
    if (mode === "full")
      return state.direction === "decode" ? "url-decode-full" : "url-encode-full";
    return state.direction === "decode" ? "url-decode-component" : "url-encode-component";
  },
  "/json": "json-format",
  "/hashing": (state) => {
    const algo = (state.algorithm as string) || "sha256";
    return `hash-${algo === "sha-1" ? "sha1" : algo === "sha-512" ? "sha512" : algo === "md5" ? "md5" : "sha256"}`;
  },
  "/textcase": (state) => {
    const caseMap: Record<string, string> = {
      camel: "text-camel",
      pascal: "text-pascal",
      snake: "text-snake",
      kebab: "text-kebab",
      upper: "text-upper",
      lower: "text-lower",
    };
    return caseMap[(state.case as string) || "camel"] || "text-camel";
  },
  "/cipher": "aes-encrypt",
  "/yaml": "json-yaml",
  "/jsonts": "json-ts",
  "/csv": "json-csv",
  "/sqlformat": "sql-format",
  "/deduplines": "dedup-lines",
  "/extractor": (state) => ((state.type as string) === "url" ? "extract-urls" : "extract-emails"),
  "/password": "password-gen",
  "/qrcode": "qrcode-gen",
  "/image-resize": "image-resize",
  "/image-compress": "image-compress",
  "/image-convert": "image-convert",
};

export function resolveStepId(toolPath: string, toolState: Record<string, unknown>): string | null {
  const mapping = TOOL_STEP_MAP[toolPath];
  if (!mapping) return null;
  if (typeof mapping === "string") return mapping;
  return mapping(toolState);
}
