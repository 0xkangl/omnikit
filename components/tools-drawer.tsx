"use client";

import { useState, useEffect, useRef } from "react";
import { Dialog, DialogPanel } from "@headlessui/react";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter, usePathname } from "../i18n/navigation";
import {
  getToolCards,
  getToolIconColor,
  getToolCardMap,
  getToolCardsByKeys,
  TOOL_CATEGORIES,
  QUICK_ACCESS_DEFAULT,
} from "../libs/tools";
import type { ToolCard } from "../libs/tools";
import { searchTools } from "../libs/tools-search";
import { useIsMobile } from "../hooks/use-is-mobile";
import { useRecentTools } from "../hooks/use-recent-tools";

interface ToolsDrawerProps {
  open: boolean;
  onClose: () => void;
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-4 px-3 py-2">
      <span className="font-mono text-xs font-medium text-fg-muted uppercase tracking-[0.18em] whitespace-nowrap">
        {label}
      </span>
      <div className="ruler-divider flex-1" aria-hidden="true" />
    </div>
  );
}

function CompactToolCard({
  tool,
  isActive,
  isFocused,
  onSelect,
  cardRef,
}: {
  tool: ToolCard;
  isActive: boolean;
  isFocused: boolean;
  onSelect: () => void;
  cardRef?: (el: HTMLButtonElement | null) => void;
}) {
  const Icon = tool.icon;
  return (
    <button
      ref={cardRef}
      className={`flex flex-col items-center gap-1.5 rounded-lg p-2.5 text-center transition-[background-color] ${
        isActive
          ? "bg-accent-cyan/10"
          : isFocused
            ? "bg-accent-cyan/10 ring-1 ring-inset ring-accent-cyan/40"
            : "hover:bg-accent-cyan/8 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent-cyan/40"
      }`}
      onClick={onSelect}
    >
      <div
        className="flex h-8 w-8 items-center justify-center rounded-md"
        style={{ backgroundColor: `${getToolIconColor(tool.path)}15` }}
      >
        <Icon size={16} style={{ color: getToolIconColor(tool.path) }} aria-hidden="true" />
      </div>
      <span className="text-[11px] font-medium text-fg-primary leading-tight truncate w-full">
        {tool.title}
      </span>
    </button>
  );
}

function SearchResults({
  filteredTools,
  currentPath,
  focusedIndex,
  onSelect,
  onCardRef,
  noResultsText,
}: {
  filteredTools: ToolCard[];
  currentPath: string;
  focusedIndex: number;
  onSelect: (path: string) => void;
  onCardRef: (index: number, el: HTMLButtonElement | null) => void;
  noResultsText: string;
}) {
  if (filteredTools.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-fg-muted">
        {noResultsText}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-1.5 overflow-y-auto p-3">
      {filteredTools.map((tool, index) => {
        const Icon = tool.icon;
        const isActive = tool.path === currentPath;
        const isFocused = index === focusedIndex;

        return (
          <button
            key={tool.path}
            ref={(el) => onCardRef(index, el)}
            className={`flex flex-col items-start gap-1.5 rounded-lg p-3 text-left transition-[background-color,border-color] border-l-2 ${
              isActive
                ? "border-accent-cyan bg-accent-cyan/10"
                : isFocused
                  ? "border-accent-cyan bg-accent-cyan/10"
                  : "border-transparent hover:bg-accent-cyan/8 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent-cyan/40"
            }`}
            onClick={() => onSelect(tool.path)}
          >
            <div className="flex w-full min-w-0 items-center gap-2 overflow-hidden">
              <Icon
                size={16}
                className="shrink-0"
                style={{ color: getToolIconColor(tool.path) }}
                aria-hidden="true"
              />
              <span className="truncate text-sm font-medium text-fg-primary">{tool.title}</span>
            </div>
            <p className="text-xs text-fg-muted line-clamp-2 leading-relaxed">{tool.description}</p>
          </button>
        );
      })}
    </div>
  );
}

function DrawerBody({
  query,
  filteredTools,
  cardMap,
  currentPath,
  focusedIndex,
  quickAccessTools,
  categoryNames,
  onSelect,
  onCardRef,
  t,
  tTools,
}: {
  query: string;
  filteredTools: ToolCard[];
  cardMap: Map<string, ToolCard>;
  currentPath: string;
  focusedIndex: number;
  quickAccessTools: ToolCard[];
  categoryNames: Record<string, string>;
  onSelect: (path: string) => void;
  onCardRef: (index: number, el: HTMLButtonElement | null) => void;
  t: ReturnType<typeof useTranslations>;
  tTools: ReturnType<typeof useTranslations>;
}) {
  const isSearching = query.trim().length > 0;

  if (isSearching) {
    return (
      <SearchResults
        filteredTools={filteredTools}
        currentPath={currentPath}
        focusedIndex={focusedIndex}
        onSelect={onSelect}
        onCardRef={onCardRef}
        noResultsText={t("nav.noMatchingTools")}
      />
    );
  }

  const categoryOffsets = TOOL_CATEGORIES.reduce<
    { key: string; tools: ToolCard[]; offset: number }[]
  >((acc, cat) => {
    const tools = getToolCardsByKeys(cat.tools, cardMap);
    if (tools.length === 0) return acc;
    const offset =
      acc.length === 0 ? 0 : acc[acc.length - 1].offset + acc[acc.length - 1].tools.length;
    acc.push({ key: cat.key, tools, offset });
    return acc;
  }, []);

  return (
    <div className="flex-1 overflow-y-auto pb-4">
      <SectionHeader label={t("nav.quickAccess")} />
      <div className="grid grid-cols-3 gap-1.5 px-3">
        {quickAccessTools.map((tool) => (
          <CompactToolCard
            key={tool.path}
            tool={tool}
            isActive={tool.path === currentPath}
            isFocused={false}
            onSelect={() => onSelect(tool.path)}
          />
        ))}
      </div>

      <div className="mt-2 space-y-1">
        {categoryOffsets.map(({ key, tools, offset }) => (
          <div key={key}>
            <SectionHeader label={categoryNames[key] ?? key} />
            <div className="grid grid-cols-3 gap-1.5 px-3">
              {tools.map((tool, i) => {
                const globalIndex = offset + i;
                return (
                  <CompactToolCard
                    key={tool.path}
                    tool={tool}
                    isActive={tool.path === currentPath}
                    isFocused={globalIndex === focusedIndex}
                    onSelect={() => onSelect(tool.path)}
                    cardRef={(el) => onCardRef(globalIndex, el)}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ToolsDrawer({ open, onClose }: ToolsDrawerProps) {
  const router = useRouter();
  const currentPath = usePathname();
  const t = useTranslations("common");
  const tTools = useTranslations("tools");
  const isMobile = useIsMobile();
  const { recentTools, trackUsage } = useRecentTools();

  const [query, setQuery] = useState("");
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const cardRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

  const allTools = getToolCards(tTools);
  const cardMap = getToolCardMap(tTools);
  const filteredTools = searchTools(query, allTools);
  const isSearching = query.trim().length > 0;

  const quickAccessKeys = (() => {
    const recent = recentTools.slice(0, 3);
    const fillCount = 6 - recent.length;
    const defaults = QUICK_ACCESS_DEFAULT.filter((k) => !recent.includes(k)).slice(0, fillCount);
    return [...recent, ...defaults];
  })();
  const quickAccessTools = getToolCardsByKeys(quickAccessKeys, cardMap);

  const categoryNames: Record<string, string> = {};
  for (const cat of TOOL_CATEGORIES) {
    const i18nKey = `categories.${cat.key}`;
    if (tTools.has(i18nKey)) {
      categoryNames[cat.key] = tTools(i18nKey);
    }
  }

  const totalCategorizedTools = TOOL_CATEGORIES.reduce(
    (sum, cat) => sum + getToolCardsByKeys(cat.tools, cardMap).length,
    0
  );

  const totalCount = isSearching ? filteredTools.length : totalCategorizedTools;

  /* eslint-disable react-hooks/set-state-in-effect -- reset state when drawer opens */
  useEffect(() => {
    if (open) {
      setQuery("");
      setFocusedIndex(-1);
      cardRefs.current.clear();
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [open]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (focusedIndex < 0) return;
    const el = cardRefs.current.get(focusedIndex);
    el?.scrollIntoView({ block: "nearest" });
  }, [focusedIndex]);

  function handleCardRef(index: number, el: HTMLButtonElement | null) {
    if (el) {
      cardRefs.current.set(index, el);
    } else {
      cardRefs.current.delete(index);
    }
  }

  function handleSelect(path: string) {
    const key = path.slice(1);
    trackUsage(key);
    router.push(path);
    onClose();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = focusedIndex + 1;
      setFocusedIndex(next >= totalCount ? 0 : next);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = focusedIndex - 1;
      setFocusedIndex(prev < 0 ? totalCount - 1 : prev);
    } else if (e.key === "Enter" && focusedIndex >= 0) {
      e.preventDefault();
      if (isSearching) {
        const tool = filteredTools[focusedIndex];
        if (tool) handleSelect(tool.path);
      } else {
        let flatIndex = 0;
        for (const cat of TOOL_CATEGORIES) {
          const tools = getToolCardsByKeys(cat.tools, cardMap);
          if (tools.length === 0) continue;
          if (focusedIndex < flatIndex + tools.length) {
            const tool = tools[focusedIndex - flatIndex];
            if (tool) handleSelect(tool.path);
            return;
          }
          flatIndex += tools.length;
        }
      }
    }
  }

  const searchInput = (
    <div className="flex items-center gap-2 border-b border-border-default px-4 py-3">
      <Search size={16} className="text-fg-muted shrink-0" aria-hidden="true" />
      <input
        ref={inputRef}
        type="text"
        name="tools-search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setFocusedIndex(-1);
        }}
        onKeyDown={handleKeyDown}
        placeholder={t("nav.searchTools")}
        aria-label={t("searchTools")}
        autoComplete="off"
        className="w-full bg-transparent text-sm text-fg-primary placeholder:text-fg-muted outline-none focus-visible:ring-0"
      />
    </div>
  );

  const desktopPanel = (
    <div className="fixed inset-y-0 right-0 flex w-1/2 lg:w-[30%] lg:max-w-[500px]">
      <DialogPanel className="w-full bg-bg-surface border-l border-border-default flex flex-col overscroll-contain animate-drawer-right">
        {searchInput}
        <DrawerBody
          query={query}
          filteredTools={filteredTools}
          cardMap={cardMap}
          currentPath={currentPath}
          focusedIndex={focusedIndex}
          quickAccessTools={quickAccessTools}
          categoryNames={categoryNames}
          onSelect={handleSelect}
          onCardRef={handleCardRef}
          t={t}
          tTools={tTools}
        />
      </DialogPanel>
    </div>
  );

  const mobilePanel = (
    <div className="fixed inset-x-0 bottom-0 flex">
      <DialogPanel className="w-full max-h-[85vh] bg-bg-surface rounded-t-2xl border-t border-border-default flex flex-col overscroll-contain animate-drawer-up">
        <div className="flex justify-center pt-2 pb-1">
          <div className="h-1 w-8 rounded-full bg-border-default" />
        </div>
        {searchInput}
        <DrawerBody
          query={query}
          filteredTools={filteredTools}
          cardMap={cardMap}
          currentPath={currentPath}
          focusedIndex={focusedIndex}
          quickAccessTools={quickAccessTools}
          categoryNames={categoryNames}
          onSelect={handleSelect}
          onCardRef={handleCardRef}
          t={t}
          tTools={tTools}
        />
      </DialogPanel>
    </div>
  );

  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/40 animate-backdrop" aria-hidden="true" />
      {isMobile ? mobilePanel : desktopPanel}
    </Dialog>
  );
}
