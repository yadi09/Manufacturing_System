import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand text-on-brand hover:bg-brand-strong active:bg-brand-strong",
  secondary: "border border-control-border bg-surface-0 text-ink hover:bg-surface-50",
  ghost: "text-brand hover:bg-brand-tint",
  danger: "bg-status-down text-on-brand hover:opacity-90",
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  /** Floor screens use 64px targets for gloved taps; office screens 48px. */
  floor?: boolean;
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({ variant = "primary", floor, loading, icon, className = "", children, disabled, ...rest }: Props) {
  const inert = disabled || loading;
  return (
    <button
      {...rest}
      disabled={inert}
      aria-busy={loading || undefined}
      className={[
        "inline-flex items-center justify-center gap-2.5 rounded-md px-5 font-semibold transition-colors",
        floor ? "h-control-floor text-lg" : "h-control-md text-base",
        disabled && !loading ? "cursor-not-allowed bg-surface-100 text-ink-muted" : VARIANTS[variant],
        loading ? "cursor-progress bg-brand-strong text-on-brand" : "",
        className,
      ].join(" ")}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
}

function Spinner() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="animate-spin motion-reduce:animate-none">
      <path d="M12 3a9 9 0 1 0 9 9" />
    </svg>
  );
}
