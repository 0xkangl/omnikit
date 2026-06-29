"use client";

import { useState, useEffect, useSyncExternalStore, useRef } from "react";
import { useRouter, usePathname, Link } from "../i18n/navigation";
import {
  LayoutGrid,
  Sun,
  Moon,
  ClipboardX,
  Maximize,
  Minimize,
  ChevronRight,
  ShieldCheck,
} from "lucide-react";
import { useTheme } from "../libs/theme";
import { useTranslations } from "next-intl";
import LanguageSwitcher from "./language_switcher";
import ToolsDrawer from "./tools-drawer";
import { useFullscreen } from "../hooks/use-fullscreen";
import { showToast } from "../libs/toast";
import { STORAGE_KEYS } from "../libs/storage-keys";
import { useOnboarding } from "../hooks/use-onboarding";
import { useRecentTools } from "../hooks/use-recent-tools";
import { OnboardingPopover } from "./ui/onboarding-popover";

export type HeaderPosition = "sticky" | "none" | "hidden";

export default function Header({
  position,
  title,
  hideToolsButton,
  categoryLabel,
  categorySlug,
}: {
  position: HeaderPosition;
  title?: string;
  hideToolsButton?: boolean;
  categoryLabel?: string;
  categorySlug?: string;
}) {
  const router = useRouter();
  const currentPath = usePathname();
  const { theme, toggleTheme } = useTheme();
  const t = useTranslations("common");
  const [spinning, setSpinning] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [flipping, setFlipping] = useState(false);
  const fullscreen = useFullscreen();
  const [clipAnimating, setClipAnimating] = useState(false);
  const isClipboardSupported = useSyncExternalStore(
    () => () => {},
    () => typeof navigator !== "undefined" && !!navigator.clipboard,
    () => false
  );
  const clipboardBtnRef = useRef<HTMLButtonElement>(null);
  const { shouldShow: notGuided, dismiss } = useOnboarding(STORAGE_KEYS.onboardingClearClipboard);
  const { recentTools } = useRecentTools();
  const shouldShowOnboarding = notGuided && recentTools.length > 0 && isClipboardSupported;

  useEffect(() => {
    if (hideToolsButton) return;
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setDrawerOpen(true);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [hideToolsButton]);

  const handleClearClipboard = async () => {
    setClipAnimating(true);
    try {
      await navigator.clipboard.writeText("");
      showToast(t("clearedClipboard"), "success");
    } catch {
      showToast(t("clipboardClearFailed"), "danger");
    }
  };

  if (position === "hidden") {
    return <></>;
  }

  const positionClass = position === "sticky" ? "sticky top-0 z-50" : "relative z-40";

  return (
    <>
      <nav
        className={`${positionClass} bg-bg-surface/80 backdrop-blur-md`}
        aria-label={t("nav.mainNavigation")}
      >
        <div className="mx-auto flex items-center justify-between px-4 py-2 lg:px-6">
          <div className="flex items-center gap-1.5 min-w-0">
            <Link
              href="/"
              className="flex shrink-0 items-center gap-2 text-fg-primary hover:text-accent-cyan transition-colors"
            >
              <img src="/favicon.svg" alt="Logo" height={28} width={28} />
              <span className="font-display text-base font-bold tracking-tight hidden md:inline">
                {t("nav.brand")}
              </span>
            </Link>

            {categoryLabel && categorySlug && (
              <>
                <span className="text-fg-muted/40 shrink-0 hidden md:inline">·</span>
                <Link
                  href={`/${categorySlug}`}
                  className="shrink-0 text-sm font-medium text-fg-secondary hover:text-accent-cyan transition-colors truncate"
                >
                  {categoryLabel}
                </Link>
              </>
            )}

            {title && (
              <>
                <ChevronRight size={10} className="text-fg-muted/50 shrink-0 hidden md:block" />
                <h1 className="text-sm font-semibold text-fg-secondary truncate hidden md:inline">
                  {title}
                </h1>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            {!hideToolsButton && (
              <>
                <button
                  type="button"
                  className={`flex h-8 w-8 items-center justify-center rounded-lg text-fg-secondary hover:text-accent-cyan hover:bg-accent-cyan/10 transition-colors ${spinning ? "nav-btn-spin" : ""}`}
                  onClick={() => {
                    setSpinning(true);
                    setDrawerOpen(true);
                  }}
                  onAnimationEnd={() => setSpinning(false)}
                  aria-label={t("nav.tools")}
                  title={t("nav.searchToolsHint")}
                >
                  <LayoutGrid size={16} />
                </button>
                <ToolsDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
              </>
            )}

            {isClipboardSupported && (
              <>
                <button
                  ref={clipboardBtnRef}
                  type="button"
                  className={`flex h-8 w-8 items-center justify-center rounded-lg text-fg-secondary hover:text-accent-cyan hover:bg-accent-cyan/10 transition-colors ${clipAnimating ? "nav-btn-clear" : ""} ${shouldShowOnboarding ? "onboarding-pulse" : ""}`}
                  onClick={handleClearClipboard}
                  onAnimationEnd={() => setClipAnimating(false)}
                  aria-label={t("nav.clearClipboard")}
                  title={t("nav.clearClipboard")}
                >
                  <ClipboardX size={16} />
                </button>
                <OnboardingPopover
                  show={shouldShowOnboarding}
                  onDismiss={dismiss}
                  targetRef={clipboardBtnRef}
                  icon={<ShieldCheck size={16} />}
                  title={t("onboarding.clearClipboardTitle")}
                  description={t("onboarding.clearClipboardDesc")}
                  buttonLabel={t("onboarding.gotIt")}
                />
              </>
            )}

            {fullscreen.isSupported && (
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-fg-secondary hover:text-accent-cyan hover:bg-accent-cyan/10 transition-colors"
                onClick={() => fullscreen.toggle()}
                aria-label={fullscreen.isFullscreen ? t("nav.exitFullscreen") : t("nav.fullscreen")}
                title={fullscreen.isFullscreen ? t("nav.exitFullscreen") : t("nav.fullscreen")}
              >
                {fullscreen.isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
              </button>
            )}

            <button
              type="button"
              className={`flex h-8 w-8 items-center justify-center rounded-lg text-fg-secondary hover:text-accent-cyan hover:bg-accent-cyan/10 transition-colors ${flipping ? "nav-btn-flip" : ""}`}
              onClick={() => {
                setFlipping(true);
                toggleTheme();
              }}
              onAnimationEnd={() => setFlipping(false)}
              aria-label={t(theme === "dark" ? "nav.switchToLight" : "nav.switchToDark")}
            >
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>

            <LanguageSwitcher />
          </div>
        </div>

        <div className="h-px bg-gradient-to-r from-transparent via-accent-cyan/20 to-transparent" />
      </nav>
    </>
  );
}
