import { useId } from "react";

interface Props {
  /** Distance between cup centres in px. */
  pitch: number;
  /** Cup radius in px. */
  radius: number;
  /** Cups (column,row) drawn lighter, like filled cups in a tray. */
  filled: Array<[number, number]>;
  className?: string;
}

/** The factory's own product as a pattern: rows of round cups. Decorative; hidden from screen readers. */
export function EggTrayPattern({ pitch, radius, filled, className }: Props) {
  const id = useId();
  const half = pitch / 2;
  return (
    <svg aria-hidden="true" className={className} width="100%" height="100%">
      <defs>
        <pattern id={id} width={pitch} height={pitch} patternUnits="userSpaceOnUse">
          <circle cx={half} cy={half} r={radius} fill="var(--color-brand-strong)" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
      {filled.map(([c, r]) => (
        <circle key={`${c},${r}`} cx={c * pitch + half} cy={r * pitch + half} r={radius} fill="var(--color-on-brand-muted)" />
      ))}
    </svg>
  );
}
