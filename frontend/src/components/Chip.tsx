import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

type Tone = "active" | "off" | "neutral";

const TONES: Record<Tone, string> = {
  active: "bg-brand-tint text-brand",
  off: "bg-surface-100 text-ink-muted",
  neutral: "bg-surface-100 text-ink",
};

/** Small pill. Status chips always carry an icon and a word, never colour alone. */
export function Chip({ tone = "neutral", icon, children }: { tone?: Tone; icon?: IconName; children: ReactNode }) {
  return (
    <span className={`inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-medium ${TONES[tone]}`} style={{ lineHeight: "18px" }}>
      {icon && <Icon name={icon} size={14} />}
      {children}
    </span>
  );
}
