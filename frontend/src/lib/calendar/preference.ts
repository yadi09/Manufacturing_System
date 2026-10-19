import { useSyncExternalStore } from "react";
import type { CalendarKind } from "./format";

// The calendar a person wants dates shown in. Ethiopian by default. It is kept on this device
// (stored dates are exact either way, so this only changes how they are displayed).
const KEY = "calendar";
const listeners = new Set<() => void>();

export function getCalendar(): CalendarKind {
  try {
    return localStorage.getItem(KEY) === "gregorian" ? "gregorian" : "ethiopian";
  } catch {
    return "ethiopian"; // storage unavailable
  }
}

export function setCalendar(kind: CalendarKind): void {
  try {
    localStorage.setItem(KEY, kind);
  } catch {
    /* storage unavailable: the choice lasts until reload */
  }
  listeners.forEach((l) => l());
}

/** The chosen calendar, and a setter. Every screen showing dates updates when it changes. */
export function useCalendar(): [CalendarKind, (kind: CalendarKind) => void] {
  const kind = useSyncExternalStore(
    (notify) => {
      listeners.add(notify);
      window.addEventListener("storage", notify);
      return () => {
        listeners.delete(notify);
        window.removeEventListener("storage", notify);
      };
    },
    getCalendar,
    () => "ethiopian" as CalendarKind,
  );
  return [kind, setCalendar];
}
