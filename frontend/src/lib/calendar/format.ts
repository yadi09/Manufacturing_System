import type { TFunction } from "i18next";
import { ethiopianAt, localDate, toGregorian, weekday, type EthiopianDate } from "./index";

export type CalendarKind = "ethiopian" | "gregorian";

// Month and weekday names, and the date pattern, come from the translation files.
export const ethiopianMonthName = (t: TFunction, month: number) => t(`calendar.ethiopianMonths.${month}`);
export const gregorianMonthName = (t: TFunction, month: number) => t(`calendar.gregorianMonths.${month}`);
export const weekdayName = (t: TFunction, day: number) => t(`calendar.weekdays.${day}`);

export function formatEthiopian(t: TFunction, e: EthiopianDate): string {
  return t("calendar.format.ethiopian", {
    weekday: weekdayName(t, weekday(toGregorian(e))),
    month: ethiopianMonthName(t, e.month),
    day: e.day,
    year: e.year,
  });
}

/** Formats a UTC instant for display in the chosen calendar and time zone. */
export function formatDate(t: TFunction, instant: Date, calendar: CalendarKind = "ethiopian", timeZone?: string): string {
  if (calendar === "ethiopian") return formatEthiopian(t, ethiopianAt(instant, timeZone));
  const g = localDate(instant, timeZone);
  return t("calendar.format.gregorian", {
    weekday: weekdayName(t, weekday(g)),
    month: gregorianMonthName(t, g.month),
    day: g.day,
    year: g.year,
  });
}

/** A date without the weekday, for tables and histories: "Tikimt 2, 2019". */
export function formatShortDate(t: TFunction, instant: Date, calendar: CalendarKind = "ethiopian", timeZone?: string): string {
  if (calendar === "ethiopian") {
    const e = ethiopianAt(instant, timeZone);
    return t("calendar.format.ethiopianShort", { month: ethiopianMonthName(t, e.month), day: e.day, year: e.year });
  }
  const g = localDate(instant, timeZone);
  return t("calendar.format.gregorianShort", { month: gregorianMonthName(t, g.month), day: g.day, year: g.year });
}
