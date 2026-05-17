"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import type { DataType } from "../../libs/recipe/types";
import { StyledTextarea } from "../ui/input";
import { Upload, FolderOpen, X } from "lucide-react";
import { useDropZone } from "../../hooks/useDropZone";
import ImageMetaTag from "../image/ImageMetaTag";

interface GlobalInputProps {
  expectedType: DataType;
  value: string;
  inputDataType: DataType;
  onChange: (value: string, type: DataType) => void;
}

export default function GlobalInput({
  expectedType,
  value,
  inputDataType,
  onChange,
}: GlobalInputProps) {
  const t = useTranslations("recipe");
  const tc = useTranslations("common");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const dropZone = useDropZone((file) => {
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = () => onChange(reader.result as string, "image");
      reader.readAsDataURL(file);
    } else {
      file.text().then((text) => onChange(text, "text"));
    }
  });

  if (expectedType === "none") {
    return (
      <div className="text-center py-6 px-4">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent-cyan-dim/50 border border-accent-cyan/20">
          <div className="w-1.5 h-1.5 rounded-full bg-accent-cyan animate-pulse" />
          <p className="text-fg-secondary text-sm">{t("noInputNeeded")}</p>
        </div>
      </div>
    );
  }

  const isImage = inputDataType === "image" && value.startsWith("data:image");

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = () => onChange(reader.result as string, "image");
      reader.readAsDataURL(file);
    } else {
      file.text().then((text) => onChange(text, "text"));
    }
    e.target.value = "";
  }

  function handleClear() {
    onChange("", "text");
  }

  return (
    <div
      role="region"
      aria-label={t("input")}
      className="relative transition-colors group"
      onDragOver={dropZone.onDragOver}
      onDragEnter={dropZone.onDragEnter}
      onDragLeave={dropZone.onDragLeave}
      onDrop={dropZone.onDrop}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-6 h-6 rounded-md bg-accent-cyan/10 border border-accent-cyan/20">
            <div className="w-2 h-2 rounded-full bg-accent-cyan" />
          </div>
          <span className="text-sm font-semibold text-fg-primary tracking-wide uppercase">
            {t("input")}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-fg-muted hover:text-accent-cyan hover:bg-accent-cyan-dim/50 transition-all duration-200 cursor-pointer"
          >
            <FolderOpen size={12} />
            {tc("loadFile")}
          </button>
          {value && (
            <button
              type="button"
              onClick={handleClear}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-fg-muted hover:text-danger hover:bg-red-500/10 transition-all duration-200 cursor-pointer"
            >
              <X size={12} />
              {tc("clear")}
            </button>
          )}
        </div>
      </div>

      <div className="relative">
        {isImage ? (
          <div>
            <div className="bg-bg-input rounded-xl p-4 flex items-center justify-center border border-border-default hover:border-accent-cyan/30 transition-colors duration-300">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={value} alt="Input" className="max-h-48 rounded-lg object-contain" />
            </div>
            <ImageMetaTag dataUrl={value} />
          </div>
        ) : (
          <StyledTextarea
            value={value}
            onChange={(e) => onChange(e.target.value, "text")}
            placeholder={t("dropTextOrImage")}
            className="min-h-[16vh]"
            rows={4}
          />
        )}
      </div>

      {dropZone.isDragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center rounded-xl border-2 border-dashed border-accent-cyan bg-accent-cyan/5 backdrop-blur-sm pointer-events-none">
          <div className="text-center">
            <Upload size={32} className="mx-auto mb-2 text-accent-cyan" />
            <p className="text-sm text-fg-secondary">{t("dropFileHere")}</p>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.txt,.json,.csv,.xml,.html,.css,.js,.ts,.md,.log,.yaml,.yml,.toml,.ini,.env,.sh,.bat"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
}
