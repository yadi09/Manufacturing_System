// Gregorian <-> Ethiopian conversion for display. The database always stores UTC.
//
// The Go twin lives in backend/internal/calendar. Both are tested against
// docs/calendar-vectors.json, generated from ICU, so they cannot drift.
// Intl is used only to find the local date in a time zone, never for the
// Ethiopian conversion itself.

export const DEFAULT_TIME_ZONE = "Africa/Addis_Ababa";

/** Month 1 is Meskerem, 13 is Pagume. */
export interface EthiopianDate {
  year: number;
  month: number;
  day: number;
}

/** Proleptic Gregorian civil date; month is 1-12. */
export interface GregorianDate {
  year: number;
  month: number;
  day: number;
}

// Julian day number of Meskerem 1, year 1 (Amete Mihret era).
const ETHIOPIAN_EPOCH = 1724221;

const div = (a: number, b: number) => Math.floor(a / b);
const mod = (a: number, b: number) => a - b * div(a, b);

/** Pagume has 6 days in a leap year. */
export const isLeapYear = (year: number) => mod(year, 4) === 3;

export function daysInMonth(year: number, month: number): number {
  if (month < 13) return 30;
  return isLeapYear(year) ? 6 : 5;
}

export function isValidEthiopian(e: EthiopianDate): boolean {
  return (
    Number.isInteger(e.year) &&
    Number.isInteger(e.month) &&
    Number.isInteger(e.day) &&
    e.month >= 1 &&
    e.month <= 13 &&
    e.day >= 1 &&
    e.day <= daysInMonth(e.year, e.month)
  );
}

const ethiopianJDN = (e: EthiopianDate) =>
  ETHIOPIAN_EPOCH + 365 * (e.year - 1) + div(e.year, 4) + 30 * (e.month - 1) + e.day - 1;

// Reingold and Dershowitz, Calendrical Calculations (coptic-from-fixed).
function ethiopianFromJDN(jdn: number): EthiopianDate {
  const year = div(4 * (jdn - ETHIOPIAN_EPOCH) + 1463, 1461);
  const month = div(jdn - ethiopianJDN({ year, month: 1, day: 1 }), 30) + 1;
  return { year, month, day: jdn - ethiopianJDN({ year, month, day: 1 }) + 1 };
}

// Fliegel and Van Flandern, proleptic Gregorian.
function gregorianJDN(g: GregorianDate): number {
  const a = div(14 - g.month, 12);
  const y = g.year + 4800 - a;
  const m = g.month + 12 * a - 3;
  return g.day + div(153 * m + 2, 5) + 365 * y + div(y, 4) - div(y, 100) + div(y, 400) - 32045;
}

function gregorianFromJDN(jdn: number): GregorianDate {
  const a = jdn + 32044;
  const b = div(4 * a + 3, 146097);
  const c = a - div(146097 * b, 4);
  const d = div(4 * c + 3, 1461);
  const e = c - div(1461 * d, 4);
  const m = div(5 * e + 2, 153);
  return { year: 100 * b + d - 4800 + div(m, 10), month: m + 3 - 12 * div(m, 10), day: e - div(153 * m + 2, 5) + 1 };
}

export const toEthiopian = (g: GregorianDate): EthiopianDate => ethiopianFromJDN(gregorianJDN(g));

export function toGregorian(e: EthiopianDate): GregorianDate {
  if (!isValidEthiopian(e)) throw new RangeError(`invalid Ethiopian date ${e.year}-${e.month}-${e.day}`);
  return gregorianFromJDN(ethiopianJDN(e));
}

/** 0 = Sunday. */
export const weekday = (g: GregorianDate): number => mod(gregorianJDN(g) + 1, 7);

/** Gregorian date of an instant in a time zone (the display setting; empty means the default). */
export function localDate(instant: Date, timeZone: string = DEFAULT_TIME_ZONE): GregorianDate {
  const parts = new Intl.DateTimeFormat("en-u-ca-gregory", {
    timeZone: timeZone || DEFAULT_TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

export const ethiopianAt = (instant: Date, timeZone?: string): EthiopianDate => toEthiopian(localDate(instant, timeZone));

/** A shift belongs to the local day it started, even when it crosses midnight. */
export const shiftDay = (shiftStart: Date, timeZone?: string): GregorianDate => localDate(shiftStart, timeZone);

export const formatISODate = (g: GregorianDate) =>
  `${String(g.year).padStart(4, "0")}-${String(g.month).padStart(2, "0")}-${String(g.day).padStart(2, "0")}`;
