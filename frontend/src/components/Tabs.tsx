import { useRef, type KeyboardEvent } from "react";

export interface TabItem {
  key: string;
  label: string;
}

/** Tabs with the keyboard pattern people expect: arrow keys move, Home and End jump. */
export function Tabs({ label, tabs, active, onChange }: { label: string; tabs: TabItem[]; active: string; onChange: (key: string) => void }) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function onKey(e: KeyboardEvent, index: number) {
    const last = tabs.length - 1;
    const next = e.key === "ArrowRight" ? (index + 1) % tabs.length : e.key === "ArrowLeft" ? (index + last) % tabs.length : e.key === "Home" ? 0 : e.key === "End" ? last : -1;
    if (next < 0) return;
    e.preventDefault();
    onChange(tabs[next].key);
    refs.current[next]?.focus();
  }

  return (
    <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t, i) => {
        const selected = t.key === active;
        return (
          <button
            key={t.key}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`tab-${t.key}`}
            aria-selected={selected}
            aria-controls={`panel-${t.key}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.key)}
            onKeyDown={(e) => onKey(e, i)}
            className={`h-12 shrink-0 whitespace-nowrap border-b-[3px] px-4 text-base ${selected ? "border-brand font-semibold text-brand" : "border-transparent font-medium text-ink-muted hover:text-ink"}`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
