import { useEffect, useId, useRef, type ReactNode } from "react";

interface Props {
  /** "dialog" is centred and small; "panel" slides in from the right and fills the screen on a phone; "drawer" is the navigation menu from the left. */
  variant?: "dialog" | "panel" | "drawer";
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Alert dialogs (a confirmation that needs an answer) use role=alertdialog. */
  alert?: boolean;
  /** Set false while a request is running so Esc and the backdrop cannot lose the answer. */
  dismissible?: boolean;
}

// Open modals, innermost last. Only the top one reacts to the keyboard (a dialog opened from a panel).
const stack: symbol[] = [];

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Accessible modal: focus moves in and is kept inside, Esc closes, focus returns where it was. */
export function Modal({ variant = "dialog", title, onClose, children, alert, dismissible = true }: Props) {
  const titleId = useId();
  const box = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const canClose = useRef(dismissible);
  canClose.current = dismissible;

  useEffect(() => {
    const me = Symbol("modal");
    stack.push(me);
    const previous = document.activeElement as HTMLElement | null;
    const el = box.current;
    const first = el?.querySelector<HTMLElement>("[data-autofocus]") ?? el?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? el)?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKey(e: KeyboardEvent) {
      if (stack[stack.length - 1] !== me) return;
      if (e.key === "Escape" && canClose.current) {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !el) return;
      const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const firstItem = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstItem) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        firstItem.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      stack.splice(stack.indexOf(me), 1);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, []);

  const panel = variant === "panel";
  const drawer = variant === "drawer";
  return (
    <div className={`fixed inset-0 z-50 flex ${panel ? "justify-end" : drawer ? "justify-start" : "items-center justify-center p-4"}`}>
      <div className="absolute inset-0 bg-ink/30" aria-hidden="true" onClick={() => dismissible && onClose()} />
      <div
        ref={box}
        role={alert ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={
          panel
            ? "relative flex h-full w-full flex-col overflow-y-auto bg-surface-0 shadow-raised md:max-w-[440px]"
            : drawer
              ? "relative flex h-full w-full max-w-[280px] flex-col gap-4 overflow-y-auto bg-surface-0 p-4 shadow-raised"
              : "relative flex max-h-full w-full max-w-[440px] flex-col gap-4 overflow-y-auto rounded-lg bg-surface-0 p-6 shadow-raised"
        }
      >
        <h2 id={titleId} className={panel || drawer ? "sr-only" : "text-lg font-semibold"} style={{ lineHeight: "26px" }}>
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
