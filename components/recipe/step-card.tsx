"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import type { RecipeStepDef, RecipeStepInstance, StepOutput } from "../../libs/recipe/types";
import { StyledInput, StyledSelect } from "../ui/input";
import { Badge } from "../ui/badge";
import { ChevronDown, Trash2, GripVertical, Power, Loader2, AlertCircle } from "lucide-react";
import ImageMetaTag from "../image/ImageMetaTag";
import "rc-slider/assets/index.css";

const Slider = dynamic(() => import("rc-slider"), {
  ssr: false,
  loading: () => <div className="h-6 w-full animate-pulse bg-bg-input rounded" />,
});

const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  encoding: { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/20" },
  crypto: { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/20" },
  text: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/20" },
  format: { bg: "bg-violet-500/10", text: "text-violet-400", border: "border-violet-500/20" },
  generators: { bg: "bg-rose-500/10", text: "text-rose-400", border: "border-rose-500/20" },
  visual: { bg: "bg-cyan-500/10", text: "text-cyan-400", border: "border-cyan-500/20" },
};

const OPTION_KEY_MAP: Record<string, string> = {
  "resizeMode.none": "options.none",
  "resizeMode.percent": "options.byPercent",
  "resizeMode.custom": "options.custom",
  "errorLevel.L": "options.lowL",
  "errorLevel.M": "options.mediumM",
  "errorLevel.Q": "options.quartileQ",
  "errorLevel.H": "options.highH",
  "indent.2": "options.indent2",
  "indent.4": "options.indent4",
  "indent.8": "options.indent8",
  "delimiter.,": "options.delimiterComma",
  "delimiter.;": "options.delimiterSemicolon",
  "delimiter.\\t": "options.delimiterTab",
  "version.v4": "options.uuidV4",
  "version.v7": "options.uuidV7",
  "size.300": "options.size300",
  "size.600": "options.size600",
  "size.1024": "options.size1024",
  "cropMode.center": "options.center",
  "cropMode.top-left": "options.topLeft",
  "cropMode.custom": "options.custom",
};

interface StepCardProps {
  def: RecipeStepDef;
  instance: RecipeStepInstance;
  output: StepOutput | undefined;
  isErrored: boolean;
  isLoading: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onToggleEnabled: () => void;
  onDelete: () => void;
  onParamsChange: (params: Record<string, string>) => void;
  dragHandleProps?: Record<string, unknown>;
}

export default function StepCard({
  def,
  instance,
  output,
  isErrored,
  isLoading,
  isOpen,
  onToggle,
  onToggleEnabled,
  onDelete,
  onParamsChange,
  dragHandleProps,
}: StepCardProps) {
  const t = useTranslations("recipe");

  const stepName = t(`steps.${def.id}.name`);
  const categoryName = t(`categories.${def.category}`);
  const catColor = CATEGORY_COLORS[def.category] ?? CATEGORY_COLORS.text;

  function handleParamChange(paramId: string, value: string) {
    onParamsChange({ ...instance.params, [paramId]: value });
  }

  const borderColor = isErrored
    ? "border-danger/60 shadow-[0_0_12px_rgba(239,68,68,0.1)]"
    : "border-border-default hover:border-border-subtle";

  return (
    <div
      className={`rounded-xl border bg-bg-surface transition-all duration-200 ${borderColor} ${
        !instance.enabled ? "opacity-50" : ""
      }`}
    >
      <div className="flex items-center gap-2 p-3">
        <span
          {...dragHandleProps}
          className="cursor-grab text-fg-muted/40 hover:text-fg-muted transition-colors"
        >
          <GripVertical size={14} />
        </span>

        <button
          type="button"
          onClick={() => onToggle()}
          className="flex flex-1 items-center gap-2.5 text-left min-w-0"
        >
          <span className="text-base shrink-0">{def.icon}</span>
          <span className="text-sm font-medium text-fg-primary truncate">{stepName}</span>
          <span
            className={`inline-flex items-center px-2 py-0.5 text-[10px] font-medium rounded-md border ${catColor.bg} ${catColor.text} ${catColor.border} shrink-0`}
          >
            {categoryName}
          </span>
          {isLoading && <Loader2 size={14} className="animate-spin text-accent-cyan shrink-0" />}
          {isErrored && <AlertCircle size={14} className="text-danger shrink-0" />}
          <ChevronDown
            size={14}
            className={`ml-auto text-fg-muted/60 transition-transform duration-200 shrink-0 ${
              isOpen ? "rotate-180" : ""
            }`}
          />
        </button>

        <button
          type="button"
          onClick={onToggleEnabled}
          title={instance.enabled ? "" : t("disabled")}
          className={`p-1.5 rounded-lg transition-all duration-200 cursor-pointer ${
            instance.enabled
              ? "text-accent-cyan hover:bg-accent-cyan-dim/50"
              : "text-fg-muted/40 hover:text-fg-muted hover:bg-bg-elevated"
          }`}
        >
          <Power size={13} />
        </button>

        <button
          type="button"
          onClick={onDelete}
          className="p-1.5 rounded-lg text-fg-muted/40 hover:text-danger hover:bg-red-500/10 transition-all duration-200 cursor-pointer"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {isOpen && (
        <div className="px-3 pb-3 space-y-3">
          {def.parameters.length > 0 &&
            (() => {
              const visibleParams = def.parameters.filter((param) => {
                if (!param.dependsOn) return true;
                const depVal =
                  instance.params[param.dependsOn.paramId] ??
                  def.parameters.find((p) => p.id === param.dependsOn!.paramId)?.defaultValue ??
                  "";
                return param.dependsOn.values.includes(depVal);
              });

              type P = (typeof visibleParams)[number];
              const groups: P[][] = [];
              let buf: P[] = [];
              const flush = () => {
                if (buf.length > 0) {
                  groups.push(buf);
                  buf = [];
                }
              };
              for (const p of visibleParams) {
                if (p.type === "checkbox") buf.push(p);
                else {
                  flush();
                  groups.push([p]);
                }
              }
              flush();

              function renderCb(param: P) {
                const checked = (instance.params[param.id] ?? param.defaultValue) === "true";
                const label = t.has(`params.${param.label}`)
                  ? t(`params.${param.label}`)
                  : param.label;
                return (
                  <label
                    key={param.id}
                    className="flex items-center gap-2.5 cursor-pointer select-none group"
                  >
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={checked}
                      aria-label={label}
                      onClick={() => handleParamChange(param.id, checked ? "false" : "true")}
                      className={`recipe-toggle relative h-[20px] w-[36px] rounded-full transition-colors duration-200 shrink-0 hover:shadow-[0_0_6px_var(--accent-cyan)] ${
                        checked ? "bg-accent-cyan" : "bg-border-default hover:bg-fg-muted/40"
                      }`}
                    >
                      <span
                        className={`absolute top-[2px] left-[2px] h-[16px] w-[16px] rounded-full bg-white shadow-sm transition-transform duration-200 ${
                          checked ? "translate-x-[16px]" : "translate-x-0"
                        }`}
                      />
                    </button>
                    <span className="text-xs font-medium text-fg-secondary group-hover:text-fg-primary transition-colors">
                      {label}
                    </span>
                  </label>
                );
              }

              return (
                <div className="space-y-2.5">
                  {groups.flatMap((grp, gi) => {
                    if (grp.length >= 2 && grp.every((p) => p.type === "checkbox")) {
                      return [
                        <div key={`g${gi}`} className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                          {grp.map(renderCb)}
                        </div>,
                      ];
                    }
                    return grp.map((param) => {
                      const label = t.has(`params.${param.label}`)
                        ? t(`params.${param.label}`)
                        : param.label;

                      if (param.type === "select") {
                        return (
                          <StyledSelect
                            key={param.id}
                            label={label}
                            value={instance.params[param.id] ?? param.defaultValue}
                            onChange={(e) => handleParamChange(param.id, e.target.value)}
                          >
                            {param.options?.map((opt) => {
                              const key = OPTION_KEY_MAP[`${param.id}.${opt.value}`];
                              const label = key && t.has(key) ? t(key) : opt.label;
                              return (
                                <option key={opt.value} value={opt.value}>
                                  {label}
                                </option>
                              );
                            })}
                          </StyledSelect>
                        );
                      }

                      if (param.type === "checkbox") return renderCb(param);

                      if (param.type === "slider") {
                        const min = param.min ?? 0;
                        const max = param.max ?? 100;
                        const step = param.step ?? 1;
                        const val = Number(instance.params[param.id] ?? param.defaultValue) || min;
                        return (
                          <div key={param.id}>
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-xs font-medium text-fg-secondary">
                                {label}
                              </label>
                              <span className="font-mono text-xs font-bold text-accent-cyan">
                                {val}
                              </span>
                            </div>
                            <div className="px-1">
                              <Slider
                                min={min}
                                max={max}
                                step={step}
                                value={val}
                                onChange={(v) =>
                                  handleParamChange(
                                    param.id,
                                    String(typeof v === "number" ? v : v[0])
                                  )
                                }
                                styles={{
                                  rail: { backgroundColor: "var(--border-default)", height: 4 },
                                  track: { backgroundColor: "var(--accent-cyan)", height: 4 },
                                  handle: {
                                    borderColor: "var(--accent-cyan)",
                                    backgroundColor: "var(--bg-surface)",
                                    height: 16,
                                    width: 16,
                                    marginLeft: -6,
                                    marginTop: -6,
                                    boxShadow: "0 0 4px var(--accent-cyan)",
                                  },
                                }}
                              />
                            </div>
                          </div>
                        );
                      }

                      return (
                        <StyledInput
                          key={param.id}
                          label={label}
                          value={instance.params[param.id] ?? param.defaultValue}
                          onChange={(e) => handleParamChange(param.id, e.target.value)}
                          placeholder={
                            param.placeholder
                              ? t.has(`placeholders.${param.placeholder}`)
                                ? t(`placeholders.${param.placeholder}`)
                                : param.placeholder
                              : undefined
                          }
                        />
                      );
                    });
                  })}
                </div>
              );
            })()}

          {output && (
            <div className="border-t border-border-default/60 pt-2.5 space-y-1.5">
              {output.result.ok ? (
                output.outputType === "image" ? (
                  <div>
                    <p className="text-[10px] font-medium text-fg-muted/60 uppercase tracking-wider mb-1.5">
                      {t("output")}
                    </p>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={output.result.output}
                      alt="Step output"
                      className="max-h-32 rounded-lg object-contain"
                    />
                    <ImageMetaTag dataUrl={output.result.output} />
                  </div>
                ) : (
                  <div>
                    <p className="text-[10px] font-medium text-fg-muted/60 uppercase tracking-wider mb-1.5">
                      {t("output")}
                    </p>
                    <pre className="text-xs bg-bg-input rounded-lg p-2.5 max-h-32 overflow-auto whitespace-pre-wrap break-all text-fg-primary border border-border-default/50">
                      {output.result.output.length > 500
                        ? output.result.output.slice(0, 500) + "..."
                        : output.result.output}
                    </pre>
                  </div>
                )
              ) : (
                <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-500/5 border border-danger/20">
                  <AlertCircle size={13} className="text-danger shrink-0 mt-0.5" />
                  <p className="text-xs text-danger">
                    {t.has(`errors.${output.result.error}`)
                      ? t(`errors.${output.result.error}`)
                      : output.result.error}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
