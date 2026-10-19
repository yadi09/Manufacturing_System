import { useId, type InputHTMLAttributes, type ReactNode } from "react";

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  label: string;
  error?: string;
  /** Marks the field as wrong (red border) when the message is shown elsewhere. */
  invalid?: boolean;
  /** Rendered inside the field on the right (for example a show/hide button). */
  trailing?: ReactNode;
}

export function TextField({ label, error, invalid, trailing, className = "", ...rest }: Props) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium" style={{ lineHeight: "20px" }}>
        {label}
      </label>
      <div className="relative flex">
        <input
          {...rest}
          id={id}
          aria-invalid={error || invalid ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={[
            "h-control-md min-w-0 flex-1 rounded-md border bg-surface-0 px-3.5 text-base text-ink",
            error || invalid ? "border-danger" : "border-control-border",
            trailing ? "pr-24" : "",
            className,
          ].join(" ")}
        />
        {trailing && <div className="absolute inset-y-1 right-1 flex">{trailing}</div>}
      </div>
      {error && (
        <span id={errorId} className="text-[13px] text-danger" style={{ lineHeight: "18px" }}>
          {error}
        </span>
      )}
    </div>
  );
}
