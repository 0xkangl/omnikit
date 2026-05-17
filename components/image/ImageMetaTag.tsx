"use client";

import { useState, useEffect } from "react";
import { formatFileSize } from "../../utils/format-size";
import { FORMAT_DISPLAY_NAMES } from "../../libs/image/types";
import { extractImageDataUrlMeta, loadImageDimensions } from "../../libs/image/meta";

interface ImageMetaTagProps {
  dataUrl: string;
}

export default function ImageMetaTag({ dataUrl }: ImageMetaTagProps) {
  const meta = extractImageDataUrlMeta(dataUrl);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadImageDimensions(dataUrl).then((dims) => {
      if (!cancelled) setDimensions(dims);
    });
    return () => {
      cancelled = true;
    };
  }, [dataUrl]);

  const displayName = FORMAT_DISPLAY_NAMES[meta.format] ?? meta.format.toUpperCase();

  return (
    <div className="flex items-center gap-2 text-[11px] text-fg-muted px-1 pt-1.5">
      <span>{formatFileSize(meta.size)}</span>
      <span className="text-border-default">·</span>
      <span>{displayName}</span>
      {dimensions && (
        <>
          <span className="text-border-default">·</span>
          <span>
            {dimensions.width}×{dimensions.height}
          </span>
        </>
      )}
    </div>
  );
}
