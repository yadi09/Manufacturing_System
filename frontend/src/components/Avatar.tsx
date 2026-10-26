import { initials } from "../lib/initials";

export function Avatar({ name, size = 40, solid }: { name: string; size?: number; solid?: boolean }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className={`flex shrink-0 items-center justify-center rounded-full text-sm font-semibold ${solid ? "bg-brand text-on-brand" : "bg-brand-tint text-brand"}`}
    >
      {initials(name)}
    </span>
  );
}
