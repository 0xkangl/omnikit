"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Dialog, DialogPanel } from "@headlessui/react";
import type { DataType, Recipe, RecipeStepInstance } from "../../libs/recipe/types";
import { STEP_REGISTRY } from "../../libs/recipe/registry";
import { listRecipes, saveRecipe, deleteRecipe } from "../../libs/recipe/storage";
import { StyledInput } from "../ui/input";
import { Button } from "../ui/button";
import { showToast } from "../../libs/toast";
import { useIsMobile } from "../../hooks/use-is-mobile";
import {
  Download,
  Save,
  Trash2,
  Copy,
  FileText,
  ImageIcon,
  Play,
  FlaskConical,
  Replace,
  PlusCircle,
} from "lucide-react";
import ImageMetaTag from "../image/ImageMetaTag";

interface RecipePanelProps {
  finalOutput: string | null;
  finalOutputType: DataType | null;
  isLoading: boolean;
  steps: RecipeStepInstance[];
  onLoadRecipe: (steps: RecipeStepInstance[]) => void;
  onAppendRecipe: (steps: RecipeStepInstance[]) => void;
}

function formatRelativeTime(timestamp: number, t: ReturnType<typeof useTranslations>): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return t("ago.seconds", { count: seconds });
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t("ago.minutes", { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("ago.hours", { count: hours });
  const days = Math.floor(hours / 24);
  if (days < 30) return t("ago.days", { count: days });
  return new Date(timestamp).toLocaleDateString();
}

const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  encoding: { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/20" },
  crypto: { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/20" },
  text: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/20" },
  format: { bg: "bg-violet-500/10", text: "text-violet-400", border: "border-violet-500/20" },
  generators: { bg: "bg-rose-500/10", text: "text-rose-400", border: "border-rose-500/20" },
  visual: { bg: "bg-cyan-500/10", text: "text-cyan-400", border: "border-cyan-500/20" },
};

function RecipeDetailContent({
  recipe,
  t,
  onReplace,
  onAppend,
}: {
  recipe: Recipe;
  t: ReturnType<typeof useTranslations>;
  onReplace: () => void;
  onAppend: () => void;
}) {
  return (
    <>
      <div className="flex items-center justify-between px-5 py-4 border-b border-border-default">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-fg-primary truncate">{recipe.name}</p>
          <p className="text-[11px] text-fg-muted mt-0.5">
            {t("stepsCount", { count: recipe.steps.length })}
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
        {recipe.steps.map((step, idx) => {
          const def = STEP_REGISTRY.get(step.stepId);
          if (!def) return null;
          const stepName = t(`steps.${def.id}.name`);
          const catColor = CATEGORY_COLORS[def.category] ?? CATEGORY_COLORS.text;
          const categoryName = t(`categories.${def.category}`);

          return (
            <div
              key={idx}
              className="rounded-xl border border-border-default/60 bg-bg-elevated p-3 space-y-2"
            >
              <div className="flex items-center gap-2">
                <span className="text-base shrink-0">{def.icon}</span>
                <span className="text-sm font-medium text-fg-primary truncate">{stepName}</span>
                <span
                  className={`inline-flex items-center px-2 py-0.5 text-[10px] font-medium rounded-md border ${catColor.bg} ${catColor.text} ${catColor.border} shrink-0`}
                >
                  {categoryName}
                </span>
              </div>
              {def.parameters.length > 0 && (
                <div className="space-y-1 pl-7">
                  {def.parameters.map((param) => {
                    const value = step.params[param.id] ?? param.defaultValue;
                    const label = t.has(`params.${param.label}`)
                      ? t(`params.${param.label}`)
                      : param.label;
                    if (param.type === "select") {
                      const selected = param.options?.find((opt) => opt.value === value);
                      return (
                        <div key={param.id} className="flex items-center gap-2 text-xs">
                          <span className="text-fg-muted">{label}:</span>
                          <span className="text-fg-primary">{selected?.label ?? value}</span>
                        </div>
                      );
                    }
                    return (
                      <div key={param.id} className="flex items-center gap-2 text-xs">
                        <span className="text-fg-muted">{label}:</span>
                        <span className="text-fg-primary font-mono break-all">{value || "—"}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2 px-5 py-4 border-t border-border-default">
        <Button variant="primary" size="sm" className="flex-1" onClick={onReplace}>
          <Replace size={14} />
          {t("replace")}
        </Button>
        <Button variant="outline" size="sm" className="flex-1" onClick={onAppend}>
          <PlusCircle size={14} />
          {t("append")}
        </Button>
      </div>
    </>
  );
}

export default function RecipePanel({
  finalOutput,
  finalOutputType,
  isLoading,
  steps,
  onLoadRecipe,
  onAppendRecipe,
}: RecipePanelProps) {
  const t = useTranslations("recipe");
  const tc = useTranslations("common");
  const isMobile = useIsMobile();
  const [recipeName, setRecipeName] = useState("");
  const [savedRecipes, setSavedRecipes] = useState<Recipe[]>(() => listRecipes());
  const [detailRecipe, setDetailRecipe] = useState<Recipe | null>(null);

  function handleSave() {
    if (!recipeName.trim()) {
      showToast(t("toast.enterName"), "warning");
      return;
    }
    if (steps.length === 0) {
      showToast(t("toast.noSteps"), "warning");
      return;
    }
    const now = Date.now();
    saveRecipe({
      id: `recipe-${now}`,
      name: recipeName.trim(),
      steps: [...steps],
      createdAt: now,
      updatedAt: now,
    });
    setRecipeName("");
    setSavedRecipes(listRecipes());
    showToast(t("toast.saved"), "success");
  }

  function handleDeleteRecipe(id: string) {
    deleteRecipe(id);
    setSavedRecipes(listRecipes());
  }

  async function handleCopy() {
    if (!finalOutput) return;
    if (finalOutputType === "image" && finalOutput.startsWith("data:image")) {
      const commaIdx = finalOutput.indexOf(",");
      const mime = finalOutput.substring(5, finalOutput.indexOf(";"));
      const binary = atob(finalOutput.substring(commaIdx + 1));
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: mime });
      await navigator.clipboard.write([new ClipboardItem({ [mime]: blob })]);
    } else {
      await navigator.clipboard.writeText(finalOutput);
    }
    showToast(tc("copy"), "success", 2000);
  }

  function handleDownload() {
    if (!finalOutput) return;
    if (finalOutputType === "image" && finalOutput.startsWith("data:")) {
      const a = document.createElement("a");
      a.href = finalOutput;
      a.download = t("downloadImageName");
      a.click();
      return;
    }
    const blob = new Blob([finalOutput], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = t("downloadTextName");
    a.click();
    URL.revokeObjectURL(url);
  }

  const hasOutput = !!finalOutput;

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-6 h-6 rounded-md bg-accent-purple/10 border border-accent-purple/20">
              <div className="w-2 h-2 rounded-full bg-accent-purple" />
            </div>
            <span className="text-sm font-semibold text-fg-primary tracking-wide uppercase">
              {t("output")}
            </span>
          </div>
          {hasOutput && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-fg-muted hover:text-accent-cyan hover:bg-accent-cyan-dim/50 transition-all duration-200 cursor-pointer"
              >
                <Copy size={12} />
                {tc("copy")}
              </button>
              <button
                type="button"
                onClick={handleDownload}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-fg-muted hover:text-accent-cyan hover:bg-accent-cyan-dim/50 transition-all duration-200 cursor-pointer"
              >
                <Download size={12} />
                {tc("download")}
              </button>
            </div>
          )}
        </div>
        <div>
          {isLoading ? (
            <div className="flex flex-col items-center justify-center min-h-[30vh] lg:min-h-[50vh] rounded-xl border border-border-default bg-bg-surface">
              <div className="relative">
                <div className="h-10 w-10 border-2 border-accent-cyan/20 rounded-full" />
                <div className="absolute inset-0 h-10 w-10 border-2 border-transparent border-t-accent-cyan rounded-full animate-spin" />
              </div>
              <span className="mt-4 text-sm text-fg-muted">{t("computing")}</span>
            </div>
          ) : hasOutput ? (
            finalOutputType === "image" ? (
              <div>
                <div className="bg-bg-input rounded-xl p-4 flex items-center justify-center min-h-[30vh] lg:min-h-[50vh] border border-border-default">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={finalOutput}
                    alt="Output"
                    className="max-h-[30vh] lg:max-h-[50vh] max-w-full rounded-lg object-contain"
                  />
                </div>
                <ImageMetaTag dataUrl={finalOutput} />
              </div>
            ) : (
              <pre className="text-xs bg-bg-input rounded-xl p-4 min-h-[30vh] lg:min-h-[50vh] max-h-[30vh] lg:max-h-[50vh] overflow-auto whitespace-pre-wrap break-all text-fg-primary border border-border-default leading-relaxed">
                {finalOutput}
              </pre>
            )
          ) : (
            <div className="flex flex-col items-center justify-center min-h-[30vh] lg:min-h-[50vh] rounded-xl border border-dashed border-border-default/60 bg-bg-surface">
              <>
                <Play size={32} className="text-fg-muted/20 mb-3" />
                <p className="text-sm text-fg-muted/50">{t("noOutputYet")}</p>
              </>
            </div>
          )}
        </div>
      </div>

      {steps.length > 0 && (
        <div>
          <div className="flex items-center gap-2.5 mb-2">
            <div className="flex items-center justify-center w-6 h-6 rounded-md bg-accent-cyan/10 border border-accent-cyan/20">
              <Save size={12} className="text-accent-cyan" />
            </div>
            <span className="text-sm font-semibold text-fg-primary tracking-wide uppercase">
              {t("save")}
            </span>
          </div>
          <div className="flex gap-2">
            <StyledInput
              value={recipeName}
              onChange={(e) => setRecipeName(e.target.value)}
              placeholder={t("untitled")}
              className="flex-1"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
              }}
            />
            <Button variant="primary" size="sm" onClick={handleSave}>
              <Save size={14} />
            </Button>
          </div>
        </div>
      )}

      {savedRecipes.length > 0 && (
        <div>
          <div className="flex items-center gap-2.5 mb-2">
            <div className="flex items-center justify-center w-6 h-6 rounded-md bg-accent-purple/10 border border-accent-purple/20">
              <FileText size={12} className="text-accent-purple" />
            </div>
            <span className="text-sm font-semibold text-fg-primary tracking-wide uppercase">
              {t("savedRecipes")}
            </span>
          </div>
          <div className="space-y-1.5">
            {savedRecipes.map((recipe) => (
              <div
                key={recipe.id}
                className="flex items-center justify-between p-2.5 rounded-xl border border-border-default/60 bg-bg-surface hover:border-accent-cyan/30 hover:bg-bg-surface transition-all duration-200 group"
              >
                <button
                  type="button"
                  onClick={() => setDetailRecipe(recipe)}
                  className="flex-1 text-left min-w-0"
                >
                  <p className="text-sm text-fg-primary font-medium truncate group-hover:text-accent-cyan transition-colors">
                    {recipe.name}
                  </p>
                  <p className="text-[11px] text-fg-muted mt-0.5">
                    {t("stepsCount", { count: recipe.steps.length })} ·{" "}
                    {formatRelativeTime(recipe.updatedAt, t)}
                  </p>
                </button>
                <div className="flex items-center shrink-0 border border-border-default/60 rounded-lg divide-x divide-border-default/60">
                  <button
                    type="button"
                    onClick={() => {
                      onLoadRecipe(recipe.steps);
                    }}
                    className="flex items-center gap-1 px-2 py-1 text-fg-secondary hover:text-accent-cyan hover:bg-accent-cyan/10 transition-all duration-200 cursor-pointer text-[11px]"
                    title={t("replace")}
                  >
                    <Replace size={12} />
                    {t("replace")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onAppendRecipe(recipe.steps);
                    }}
                    className="flex items-center gap-1 px-2 py-1 text-fg-secondary hover:text-accent-purple hover:bg-accent-purple/10 transition-all duration-200 cursor-pointer text-[11px]"
                    title={t("append")}
                  >
                    <PlusCircle size={12} />
                    {t("append")}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteRecipe(recipe.id)}
                    className="flex items-center gap-1 px-2 py-1 text-fg-secondary hover:text-danger hover:bg-red-500/10 transition-all duration-200 cursor-pointer text-[11px]"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Dialog
        open={detailRecipe !== null}
        onClose={() => setDetailRecipe(null)}
        className="relative z-50"
      >
        <div className="fixed inset-0 bg-black/40 animate-backdrop" aria-hidden="true" />
        {isMobile ? (
          <div className="fixed inset-x-0 bottom-0 flex">
            <DialogPanel className="w-full max-h-[85vh] bg-bg-surface rounded-t-2xl border-t border-border-default flex flex-col overscroll-contain animate-drawer-up">
              <div className="flex justify-center pt-2 pb-1">
                <div className="h-1 w-8 rounded-full bg-border-default" />
              </div>
              {detailRecipe && (
                <RecipeDetailContent
                  recipe={detailRecipe}
                  t={t}
                  onReplace={() => {
                    onLoadRecipe(detailRecipe.steps);
                    setDetailRecipe(null);
                  }}
                  onAppend={() => {
                    onAppendRecipe(detailRecipe.steps);
                    setDetailRecipe(null);
                  }}
                />
              )}
            </DialogPanel>
          </div>
        ) : (
          <div className="fixed inset-y-0 right-0 flex w-full max-w-sm">
            <DialogPanel className="w-full bg-bg-surface border-l border-border-default flex flex-col overscroll-contain animate-drawer-right">
              {detailRecipe && (
                <RecipeDetailContent
                  recipe={detailRecipe}
                  t={t}
                  onReplace={() => {
                    onLoadRecipe(detailRecipe.steps);
                    setDetailRecipe(null);
                  }}
                  onAppend={() => {
                    onAppendRecipe(detailRecipe.steps);
                    setDetailRecipe(null);
                  }}
                />
              )}
            </DialogPanel>
          </div>
        )}
      </Dialog>
    </div>
  );
}
