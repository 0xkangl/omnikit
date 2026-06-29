"use client";

import { useState, useRef, useEffect, startTransition } from "react";
import Link from "next/link";
import Layout from "../../components/layout";
import { useRouter } from "../../i18n/navigation";
import { useTranslations, useLocale } from "next-intl";
import {
  getToolCards,
  getToolIconColor,
  getToolCardMap,
  getToolCardsByKeys,
  TOOL_CATEGORIES,
  QUICK_ACCESS_DEFAULT,
  CATEGORY_SLUGS,
} from "../../libs/tools";
import { searchTools } from "../../libs/tools-search";
import { Card } from "../../components/ui/card";
import { Accordion } from "../../components/ui/accordion";
import { useRecentTools } from "../../hooks/use-recent-tools";
import { Search, X, LayoutGrid, Grid3X3, CircleHelp, Shield, Wifi, Heart } from "lucide-react";

type ViewMode = "grouped" | "all";

function CrosshairMark({ className }: { className: string }) {
  return (
    <span
      className={`pointer-events-none absolute hidden text-accent-cyan/30 md:block ${className}`}
      aria-hidden="true"
    >
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor">
        <path d="M11 1v20M1 11h20" strokeWidth="1" />
        <circle cx="11" cy="11" r="4.5" strokeWidth="1" />
      </svg>
    </span>
  );
}

function HeroSection({
  query,
  onQueryChange,
  onClear,
  onKeyDown,
  searchPlaceholder,
  subtitle,
  tagline,
  badge,
  clearLabel,
  stats,
  inputRef,
}: {
  query: string;
  onQueryChange: (q: string) => void;
  onClear: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  searchPlaceholder: string;
  subtitle: string;
  tagline: string;
  badge: string;
  clearLabel: string;
  stats: string[];
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <section className="relative overflow-hidden border-b border-border-default bg-bg-base">
      <div
        className="bg-grid-pattern absolute inset-0 [mask-image:radial-gradient(ellipse_70%_70%_at_50%_30%,#000_40%,transparent_100%)]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2 h-[260px] w-[620px] rounded-full bg-accent-cyan/[0.07] blur-3xl"
        aria-hidden="true"
      />
      <CrosshairMark className="left-6 top-6" />
      <CrosshairMark className="right-6 top-6" />
      <CrosshairMark className="bottom-6 left-6" />
      <CrosshairMark className="bottom-6 right-6" />

      <div className="relative mx-auto max-w-3xl px-6 py-14 md:py-20 text-center">
        <span className="hero-rise inline-flex items-center gap-2 rounded-full border border-border-default bg-bg-surface/70 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-fg-secondary backdrop-blur-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-signal" aria-hidden="true" />
          {badge}
        </span>

        <h1
          className="hero-rise font-display text-4xl font-bold leading-[1.05] tracking-tight text-fg-primary text-balance md:text-6xl mt-5"
          style={{ animationDelay: "60ms" }}
        >
          {subtitle}
        </h1>
        <p
          className="hero-rise mx-auto mt-4 max-w-md text-base leading-relaxed text-fg-secondary"
          style={{ animationDelay: "120ms" }}
        >
          {tagline}
        </p>

        <div className="hero-rise mx-auto mt-8 max-w-xl" style={{ animationDelay: "180ms" }}>
          <div className="group relative">
            {/* 仪器输入框：四角对位标记 */}
            <span className="pointer-events-none absolute -left-1 -top-1 h-2.5 w-2.5 border-l border-t border-accent-cyan/40 transition-colors group-focus-within:border-accent-cyan" />
            <span className="pointer-events-none absolute -right-1 -top-1 h-2.5 w-2.5 border-r border-t border-accent-cyan/40 transition-colors group-focus-within:border-accent-cyan" />
            <span className="pointer-events-none absolute -bottom-1 -left-1 h-2.5 w-2.5 border-b border-l border-accent-cyan/40 transition-colors group-focus-within:border-accent-cyan" />
            <span className="pointer-events-none absolute -bottom-1 -right-1 h-2.5 w-2.5 border-b border-r border-accent-cyan/40 transition-colors group-focus-within:border-accent-cyan" />
            <div className="relative flex items-center">
              <Search size={18} className="absolute left-4 text-fg-muted" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={searchPlaceholder}
                className="w-full rounded-lg border border-border-default bg-bg-surface py-3.5 pl-11 pr-16 text-sm text-fg-primary placeholder:text-fg-muted outline-none transition-all focus:border-accent-cyan/50 focus:shadow-input-focus"
                role="combobox"
                aria-label={searchPlaceholder}
                aria-expanded={query.trim().length > 0}
                aria-controls="home-search-results"
                aria-autocomplete="list"
              />
              {query && (
                <button
                  type="button"
                  onClick={onClear}
                  className="absolute right-14 flex h-6 w-6 items-center justify-center rounded-full text-fg-muted hover:text-fg-primary hover:bg-bg-elevated transition-colors"
                  aria-label={clearLabel}
                >
                  <X size={14} />
                </button>
              )}
              <kbd className="absolute right-4 hidden sm:inline-flex items-center gap-0.5 rounded border border-border-default bg-bg-elevated px-1.5 py-0.5 text-[10px] font-mono text-fg-muted">
                ⌘K
              </kbd>
            </div>
          </div>
        </div>

        {/* 仪表读出条 */}
        <div
          className="hero-rise mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 font-mono text-[11px] uppercase tracking-wider text-fg-muted"
          style={{ animationDelay: "240ms" }}
        >
          {stats.map((stat, i) => (
            <span key={stat} className="flex items-center gap-3">
              {i > 0 && <span className="h-3 w-px bg-border-default" aria-hidden="true" />}
              {stat}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function ToolCardItem({
  tool,
  onClick,
}: {
  tool: ReturnType<typeof getToolCards>[0];
  onClick: () => void;
}) {
  const Icon = tool.icon;
  return (
    <Card hover className="group flex flex-col cursor-pointer" onClick={onClick}>
      <div className="flex flex-1 flex-col items-center p-2">
        {Icon && (
          <div
            className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl transition-colors group-hover:brightness-110"
            style={{ backgroundColor: `${getToolIconColor(tool.path)}15` }}
          >
            <Icon size={28} style={{ color: getToolIconColor(tool.path) }} />
          </div>
        )}
        <h3 className="font-semibold text-fg-primary text-center">{tool.title}</h3>
        <p className="mt-2 line-clamp-2 text-sm text-fg-secondary text-center leading-relaxed">
          {tool.description}
        </p>
      </div>
    </Card>
  );
}

function QuickAccessSection({
  tools,
  onToolClick,
  label,
}: {
  tools: ReturnType<typeof getToolCards>;
  onToolClick: (path: string, key: string) => void;
  label: string;
}) {
  if (tools.length === 0) return null;

  return (
    <section className="pt-10">
      <div className="flex items-center gap-4 mb-4">
        <span className="font-mono text-xs font-medium text-fg-muted uppercase tracking-[0.18em] whitespace-nowrap">
          {label}
        </span>
        <div className="ruler-divider flex-1" aria-hidden="true" />
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {tools.map((tool) => {
          const Icon = tool.icon;
          const key = tool.path.slice(1);
          return (
            <Card
              key={tool.path}
              hover
              className="group flex flex-col items-center cursor-pointer py-4"
              onClick={() => onToolClick(tool.path, key)}
            >
              {Icon && (
                <div
                  className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg transition-colors group-hover:brightness-110"
                  style={{ backgroundColor: `${getToolIconColor(tool.path)}15` }}
                >
                  <Icon size={22} style={{ color: getToolIconColor(tool.path) }} />
                </div>
              )}
              <span className="text-xs font-semibold text-fg-primary text-center leading-tight">
                {tool.title}
              </span>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

function ViewModeToggle({
  mode,
  onChange,
  labels,
}: {
  mode: ViewMode;
  onChange: (m: ViewMode) => void;
  labels: { grouped: string; all: string };
}) {
  return (
    <div className="flex items-center gap-1 rounded-lg bg-bg-input p-0.5">
      <button
        type="button"
        onClick={() => onChange("grouped")}
        className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
          mode === "grouped"
            ? "bg-bg-surface text-fg-primary shadow-sm"
            : "text-fg-muted hover:text-fg-secondary"
        }`}
      >
        <Grid3X3 size={12} />
        {labels.grouped}
      </button>
      <button
        type="button"
        onClick={() => onChange("all")}
        className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
          mode === "all"
            ? "bg-bg-surface text-fg-primary shadow-sm"
            : "text-fg-muted hover:text-fg-secondary"
        }`}
      >
        <LayoutGrid size={12} />
        {labels.all}
      </button>
    </div>
  );
}

function CategorySections({
  categories,
  cardMap,
  onToolClick,
  categoryNames,
  localePrefix,
}: {
  categories: typeof TOOL_CATEGORIES;
  cardMap: Map<string, ReturnType<typeof getToolCards>[0]>;
  onToolClick: (path: string, key: string) => void;
  categoryNames: Record<string, string>;
  localePrefix: string;
}) {
  return (
    <div className="space-y-8">
      {categories.map((cat) => {
        const tools = getToolCardsByKeys(cat.tools, cardMap);
        if (tools.length === 0) return null;
        return (
          <section key={cat.key}>
            <div className="flex items-center gap-4 mb-3">
              <Link
                href={`${localePrefix}/${CATEGORY_SLUGS[cat.key]}`}
                className="font-mono text-xs font-medium text-fg-muted uppercase tracking-[0.18em] whitespace-nowrap hover:text-accent-cyan transition-colors"
              >
                {categoryNames[cat.key] ?? cat.key}
              </Link>
              <div className="ruler-divider flex-1" aria-hidden="true" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {tools.map((tool) => (
                <ToolCardItem
                  key={tool.path}
                  tool={tool}
                  onClick={() => onToolClick(tool.path, tool.path.slice(1))}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function SearchResults({
  results,
  onToolClick,
  noResultsText,
  resultsCountText,
  focusedIndex,
  onCardRef,
}: {
  results: ReturnType<typeof getToolCards>;
  onToolClick: (path: string, key: string) => void;
  noResultsText: string;
  resultsCountText: string;
  focusedIndex: number;
  onCardRef: (index: number, el: HTMLDivElement | null) => void;
}) {
  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Search size={32} className="text-fg-muted mb-3" />
        <p className="text-sm text-fg-muted">{noResultsText}</p>
      </div>
    );
  }

  return (
    <div role="listbox" id="home-search-results" aria-label={resultsCountText}>
      <p className="mb-4 text-sm text-fg-muted">{resultsCountText}</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {results.map((tool, index) => {
          const Icon = tool.icon;
          const isFocused = index === focusedIndex;
          return (
            // eslint-disable-next-line jsx-a11y/interactive-supports-focus, jsx-a11y/click-events-have-key-events -- managed by parent listbox keyboard navigation
            <div
              key={tool.path}
              ref={(el) => onCardRef(index, el)}
              role="option"
              aria-selected={isFocused}
              onClick={() => onToolClick(tool.path, tool.path.slice(1))}
              className={`group relative rounded-lg border bg-bg-surface p-4 cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover hover:border-glow ${
                isFocused
                  ? "border-accent-cyan ring-2 ring-accent-cyan/20"
                  : "border-border-default"
              }`}
            >
              <span
                className="pointer-events-none absolute left-1.5 top-1.5 h-2 w-2 border-l border-t border-fg-muted/25 transition-colors group-hover:border-accent-cyan"
                aria-hidden="true"
              />
              <span
                className="pointer-events-none absolute right-1.5 top-1.5 h-2 w-2 border-r border-t border-fg-muted/25 transition-colors group-hover:border-accent-cyan"
                aria-hidden="true"
              />
              <span
                className="pointer-events-none absolute bottom-1.5 left-1.5 h-2 w-2 border-b border-l border-fg-muted/25 transition-colors group-hover:border-accent-cyan"
                aria-hidden="true"
              />
              <span
                className="pointer-events-none absolute bottom-1.5 right-1.5 h-2 w-2 border-b border-r border-fg-muted/25 transition-colors group-hover:border-accent-cyan"
                aria-hidden="true"
              />
              <div className="flex flex-col items-center">
                {Icon && (
                  <div
                    className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl"
                    style={{ backgroundColor: `${getToolIconColor(tool.path)}15` }}
                  >
                    <Icon size={28} style={{ color: getToolIconColor(tool.path) }} />
                  </div>
                )}
                <h3 className="font-semibold text-fg-primary text-center truncate w-full">
                  {tool.title}
                </h3>
                <p className="mt-2 line-clamp-2 text-sm text-fg-secondary text-center leading-relaxed">
                  {tool.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function HomeClient() {
  const router = useRouter();
  const t = useTranslations("tools");
  const tHome = useTranslations("home");
  const locale = useLocale();
  const prefix = locale === "en" ? "" : `/${locale}`;
  const { recentTools, trackUsage } = useRecentTools();

  const [query, setQuery] = useState("");
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const cardRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("grouped");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("okrun:home-view");
      if (saved === "all" || saved === "grouped") {
        startTransition(() => setViewMode(saved));
      }
    } catch {}
  }, []);

  const allTools = getToolCards(t);
  const cardMap = getToolCardMap(t);
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
    if (t.has(i18nKey)) {
      categoryNames[cat.key] = t(i18nKey);
    }
  }

  const noResultsText = tHome("noResults", { query });
  const resultsCountText = tHome("resultsCount", { count: filteredTools.length });

  const handleToolClick = (path: string, key: string) => {
    trackUsage(key);
    router.push(path);
  };

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem("okrun:home-view", mode);
    } catch {}
  };

  const handleClearSearch = () => {
    setQuery("");
    setFocusedIndex(-1);
    cardRefs.current.clear();
  };

  const handleQueryChange = (q: string) => {
    setQuery(q);
    setFocusedIndex(-1);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      handleClearSearch();
      return;
    }
    if (!isSearching) return;

    const total = filteredTools.length;
    const cols =
      typeof window !== "undefined"
        ? window.innerWidth >= 1024
          ? 4
          : window.innerWidth >= 640
            ? 3
            : 2
        : 4;

    if (e.key === "ArrowRight") {
      e.preventDefault();
      const cur = focusedIndex < 0 ? -1 : focusedIndex;
      setFocusedIndex((cur + 1) % total);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      const cur = focusedIndex < 0 ? 0 : focusedIndex;
      setFocusedIndex(cur === 0 ? total - 1 : cur - 1);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const cur = focusedIndex < 0 ? 0 : focusedIndex;
      const next = cur + cols;
      setFocusedIndex(next >= total ? cur : next);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const cur = focusedIndex < 0 ? 0 : focusedIndex;
      const prev = cur - cols;
      setFocusedIndex(prev < 0 ? cur : prev);
    } else if (e.key === "Enter" && focusedIndex >= 0) {
      e.preventDefault();
      const tool = filteredTools[focusedIndex];
      if (tool) handleToolClick(tool.path, tool.path.slice(1));
    }
  };

  const handleCardRef = (index: number, el: HTMLDivElement | null) => {
    if (el) {
      cardRefs.current.set(index, el);
    } else {
      cardRefs.current.delete(index);
    }
  };

  useEffect(() => {
    if (focusedIndex >= 0 && cardRefs.current.has(focusedIndex)) {
      cardRefs.current.get(focusedIndex)?.scrollIntoView({ block: "nearest" });
    }
  }, [focusedIndex]);

  useEffect(() => {
    function handleGlobalSearchShortcut(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handleGlobalSearchShortcut);
    return () => document.removeEventListener("keydown", handleGlobalSearchShortcut);
  }, []);

  return (
    <Layout headerPosition="sticky" hideToolsButton>
      <HeroSection
        query={query}
        onQueryChange={handleQueryChange}
        onClear={handleClearSearch}
        onKeyDown={handleSearchKeyDown}
        searchPlaceholder={tHome("searchPlaceholder")}
        subtitle={tHome("subtitle")}
        tagline={tHome("tagline")}
        badge={tHome("badge")}
        clearLabel={tHome("clearSearch")}
        stats={[tHome("toolCount"), tHome("whyPrivacyTitle"), tHome("whyOfflineTitle")]}
        inputRef={searchInputRef}
      />

      <section className="container mx-auto px-4 pb-20 pt-6">
        {isSearching ? (
          <SearchResults
            results={filteredTools}
            onToolClick={handleToolClick}
            noResultsText={noResultsText}
            resultsCountText={resultsCountText}
            focusedIndex={focusedIndex}
            onCardRef={handleCardRef}
          />
        ) : (
          <>
            <QuickAccessSection
              tools={quickAccessTools}
              onToolClick={handleToolClick}
              label={tHome("quickAccess")}
            />

            <div className="mt-10">
              <div className="flex items-center justify-between mb-4">
                <span className="font-mono text-xs font-medium text-fg-muted uppercase tracking-[0.18em]">
                  {tHome("allTools")}
                </span>
                <ViewModeToggle
                  mode={viewMode}
                  onChange={handleViewModeChange}
                  labels={{
                    grouped: tHome("viewGrouped"),
                    all: tHome("viewAll"),
                  }}
                />
              </div>

              {viewMode === "grouped" ? (
                <CategorySections
                  categories={TOOL_CATEGORIES}
                  cardMap={cardMap}
                  onToolClick={handleToolClick}
                  categoryNames={categoryNames}
                  localePrefix={prefix}
                />
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  {allTools.map((tool) => (
                    <ToolCardItem
                      key={tool.path}
                      tool={tool}
                      onClick={() => handleToolClick(tool.path, tool.path.slice(1))}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </section>

      {!isSearching && (
        <>
          <section className="mx-auto mt-16 max-w-4xl text-center">
            <h2 className="font-display text-2xl font-bold tracking-tight text-fg-primary">
              {tHome("toolCount")}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-fg-secondary">
              {tHome("brandDescription")}
            </p>
          </section>

          <section className="mx-auto mt-16 max-w-4xl">
            <h2 className="text-center font-display text-2xl font-bold tracking-tight text-fg-primary mb-8">
              {tHome("whyTitle")}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-lg border border-border-default bg-bg-surface p-6 text-center shadow-card">
                <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-accent-cyan/10">
                  <Shield size={20} className="text-accent-cyan" />
                </div>
                <h3 className="text-sm font-semibold text-fg-primary">
                  {tHome("whyPrivacyTitle")}
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-fg-secondary">
                  {tHome("whyPrivacyDesc")}
                </p>
              </div>
              <div className="rounded-lg border border-border-default bg-bg-surface p-6 text-center shadow-card">
                <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-accent-cyan/10">
                  <Wifi size={20} className="text-accent-cyan" />
                </div>
                <h3 className="text-sm font-semibold text-fg-primary">
                  {tHome("whyOfflineTitle")}
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-fg-secondary">
                  {tHome("whyOfflineDesc")}
                </p>
              </div>
              <div className="rounded-lg border border-border-default bg-bg-surface p-6 text-center shadow-card">
                <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-accent-cyan/10">
                  <Heart size={20} className="text-accent-cyan" />
                </div>
                <h3 className="text-sm font-semibold text-fg-primary">{tHome("whyFreeTitle")}</h3>
                <p className="mt-2 text-xs leading-relaxed text-fg-secondary">
                  {tHome("whyFreeDesc")}
                </p>
              </div>
            </div>
          </section>

          <section className="mx-auto mt-16 max-w-4xl">
            <h2 className="text-center font-display text-2xl font-bold tracking-tight text-fg-primary mb-8">
              {tHome("categoryIntroTitle")}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {TOOL_CATEGORIES.map((cat) => {
                const slug = CATEGORY_SLUGS[cat.key];
                const descKey =
                  "cat" +
                  slug
                    .split("-")
                    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                    .join("");
                return (
                  <div
                    key={cat.key}
                    className="rounded-lg border border-border-default bg-bg-surface p-5 shadow-card"
                  >
                    <h3 className="text-sm font-semibold text-fg-primary">
                      {categoryNames[cat.key] ?? cat.key}
                    </h3>
                    <p className="mt-2 text-xs leading-relaxed text-fg-secondary">
                      {tHome(descKey)}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="mx-auto mt-12 max-w-4xl pb-12">
            <div className="mb-4 flex items-center gap-2">
              <CircleHelp size={16} className="shrink-0 text-accent-cyan" aria-hidden="true" />
              <h2 className="text-base font-semibold text-fg-primary">{tHome("faqTitle")}</h2>
            </div>
            <Accordion
              items={[1, 2, 3, 4].map((i) => ({
                title: tHome(`faq${i}Q`),
                content: <p>{tHome(`faq${i}A`)}</p>,
              }))}
            />
          </section>
        </>
      )}
    </Layout>
  );
}
