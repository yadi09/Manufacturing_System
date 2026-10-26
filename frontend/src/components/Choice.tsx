import type { ReactNode } from "react";

/** A large radio option: the whole card is the target, and the selected one is tinted. */
export function Choice({ name, checked, onChange, disabled, children }: { name: string; checked: boolean; onChange: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <label
      className={`flex min-h-12 items-start gap-2.5 rounded-md border px-3.5 py-2.5 ${disabled ? "cursor-not-allowed opacity-70" : "cursor-pointer"} ${checked ? "border-brand bg-brand-tint" : "border-line bg-surface-0"}`}
    >
      <input type="radio" name={name} checked={checked} onChange={onChange} disabled={disabled} className="mt-1 size-5 shrink-0 accent-brand" />
      <span className="flex flex-col">{children}</span>
    </label>
  );
}
