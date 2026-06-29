import { KeyboardEvent, ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  onClick?: () => void;
}

export function Card({ children, className = "", hover = false, onClick }: CardProps) {
  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!onClick) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick();
    }
  }

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- conditional role/tabIndex/onKeyDown applied when onClick is present
    <div
      onClick={onClick}
      onKeyDown={onClick ? handleKeyDown : undefined}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={`
        group relative bg-bg-surface border border-border-default rounded-lg p-4
        transition-all duration-200
        ${hover ? "hover:-translate-y-0.5 hover:shadow-card-hover hover:border-glow cursor-pointer" : "shadow-card"}
        ${className}
      `}
    >
      {hover && <RegistrationMarks />}
      {children}
    </div>
  );
}

/* 签名元素：制图对位角标，hover 时以青墨色增强 */
function RegistrationMarks() {
  const base =
    "pointer-events-none absolute h-2 w-2 border-fg-muted/25 transition-colors duration-200 group-hover:border-accent-cyan";
  return (
    <>
      <span className={`${base} left-1.5 top-1.5 border-l border-t`} aria-hidden="true" />
      <span className={`${base} right-1.5 top-1.5 border-r border-t`} aria-hidden="true" />
      <span className={`${base} bottom-1.5 left-1.5 border-b border-l`} aria-hidden="true" />
      <span className={`${base} bottom-1.5 right-1.5 border-b border-r`} aria-hidden="true" />
    </>
  );
}
