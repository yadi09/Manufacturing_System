import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

type Tone = "danger" | "warning" | "info";

const TONES: Record<Tone, { box: string; head: string; icon: IconName }> = {
  danger: { box: "bg-danger-tint", head: "text-danger", icon: "alert" },
  warning: { box: "bg-warning-tint", head: "text-ink", icon: "clock" },
  info: { box: "bg-brand-tint", head: "text-brand", icon: "info" },
};

interface Props {
  tone: Tone;
  title: string;
  children?: ReactNode;
  icon?: IconName;
}

/** Errors are announced to screen readers (role=alert); never colour alone: icon plus words. */
export function Notice({ tone, title, children, icon }: Props) {
  const t = TONES[tone];
  return (
    <div role={tone === "info" ? "status" : "alert"} className={`flex items-start gap-3 rounded-md px-3.5 py-3 ${t.box}`}>
      <Icon name={icon ?? t.icon} className={`mt-0.5 shrink-0 ${t.head}`} />
      <div className="flex flex-col gap-0.5 text-sm" style={{ lineHeight: "20px" }}>
        <strong className={`font-semibold ${t.head}`}>{title}</strong>
        {children && <span>{children}</span>}
      </div>
    </div>
  );
}
