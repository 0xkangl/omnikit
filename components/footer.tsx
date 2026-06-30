"use client";

import { Link } from "../i18n/navigation";
import { useTranslations } from "next-intl";

export type FooterPosition = "sticky" | "fixed" | "none" | "hidden";

const GITHUB_URL = "https://github.com/0xkangl/omnikit";

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
    >
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.105-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  );
}

export default function Footer({ position }: { position: FooterPosition }) {
  const t = useTranslations("common");

  if (position === "hidden") {
    return <></>;
  }

  const positionClass = (() => {
    switch (position) {
      case "fixed":
        return "fixed bottom-0 left-0 right-0";
      case "sticky":
        return "sticky bottom-0";
      case "none":
        return "";
    }
  })();

  return (
    <footer className={`bg-bg-surface border-t border-border-default py-2 px-4 ${positionClass}`}>
      <div className="flex flex-col items-center justify-between gap-1 sm:flex-row">
        <p className="text-fg-muted text-xs">
          © {t("footer.copyright", { year: new Date().getFullYear() })}
        </p>
        <nav className="flex items-center gap-3">
          <Link href="/" className="text-fg-muted text-xs hover:text-accent-cyan transition-colors">
            {t("footer.home")}
          </Link>
          <Link
            href="/tnc/terms"
            className="text-fg-muted text-xs hover:text-accent-cyan transition-colors"
          >
            {t("footer.terms")}
          </Link>
          <Link
            href="/tnc/privacy"
            className="text-fg-muted text-xs hover:text-accent-cyan transition-colors"
          >
            {t("footer.privacy")}
          </Link>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-fg-muted hover:text-accent-cyan transition-colors"
            aria-label={t("footer.github")}
          >
            <GithubIcon className="w-4 h-4" />
          </a>
        </nav>
      </div>
    </footer>
  );
}
