import { describe, expect, it } from "vitest";
import i18n from "i18next";
import vectors from "../../../../docs/calendar-vectors.json";
import en from "../../i18n/locales/en.json";
import am from "../../i18n/locales/am.json";
import {
  DEFAULT_TIME_ZONE,
  daysInMonth,
  ethiopianAt,
  formatISODate,
  localDate,
  shiftDay,
  toEthiopian,
  toGregorian,
  weekday,
  type GregorianDate,
} from "./index";
import { formatDate } from "./format";

const parse = (s: string): GregorianDate => {
  const [year, month, day] = s.split("-").map(Number);
  return { year, month, day };
};

describe("calendar vectors (ICU reference)", () => {
  it("has cases", () => {
    expect(vectors.dates.length).toBeGreaterThan(0);
    expect(vectors.instants.length).toBeGreaterThan(0);
    expect(vectors.shifts.length).toBeGreaterThan(0);
  });

  it.each(vectors.dates)("$gregorian converts both ways", (c) => {
    const g = parse(c.gregorian);
    expect(toEthiopian(g)).toEqual(c.ethiopian);
    expect(toGregorian(c.ethiopian)).toEqual(g);
    expect(weekday(g)).toBe(c.weekday);
  });

  it.each(vectors.instants)("$utc in $time_zone", (c) => {
    const at = new Date(c.utc);
    expect(ethiopianAt(at, c.time_zone)).toEqual(c.ethiopian);
    expect(formatISODate(localDate(at, c.time_zone))).toBe(c.gregorian);
  });

  it.each(vectors.shifts)("shift day: $note", (c) => {
    const start = new Date(c.shift_start_utc);
    expect(new Date(c.event_utc).getTime()).toBeGreaterThan(start.getTime());
    const day = shiftDay(start, c.time_zone);
    expect(formatISODate(day)).toBe(c.shift_day.gregorian);
    expect(toEthiopian(day)).toEqual(c.shift_day.ethiopian);
  });
});

describe("rules", () => {
  it("night shift crossing midnight belongs to the day it started", () => {
    const start = new Date("2026-10-19T19:00:00Z"); // 22:00 in Addis Ababa
    const event = new Date("2026-10-20T00:00:00Z"); // 03:00 next day in Addis Ababa
    expect(formatISODate(localDate(event))).toBe("2026-10-20");
    expect(formatISODate(shiftDay(start))).toBe("2026-10-19");
  });

  it("round-trips every Ethiopian day from 1890 to 2110", () => {
    for (let year = 1890; year <= 2110; year++)
      for (let month = 1; month <= 13; month++)
        for (let day = 1; day <= daysInMonth(year, month); day++) {
          const e = { year, month, day };
          const back = toEthiopian(toGregorian(e));
          if (back.year !== year || back.month !== month || back.day !== day) throw new Error(`round trip ${JSON.stringify(e)}`);
        }
  });

  it("rejects dates that do not exist", () => {
    for (const e of [
      { year: 2016, month: 13, day: 6 },
      { year: 2015, month: 13, day: 7 },
      { year: 2016, month: 0, day: 1 },
      { year: 2016, month: 14, day: 1 },
      { year: 2016, month: 1, day: 31 },
    ])
      expect(() => toGregorian(e)).toThrow(RangeError);
  });

  it("defaults to Africa/Addis_Ababa", () => {
    expect(DEFAULT_TIME_ZONE).toBe("Africa/Addis_Ababa");
    expect(localDate(new Date("2026-09-10T21:30:00Z"))).toEqual({ year: 2026, month: 9, day: 11 });
    expect(localDate(new Date("2026-09-10T21:30:00Z"), "")).toEqual({ year: 2026, month: 9, day: 11 });
  });
});

describe("names come from translation files", () => {
  const at = new Date("2026-09-10T21:30:00Z"); // Friday, Meskerem 1, 2019 in Addis Ababa

  it.each(["en", "am"] as const)("%s has 13 Ethiopian months, 12 Gregorian months and 7 weekdays", (lng) => {
    const cal = (lng === "en" ? en : am).calendar;
    expect(Object.keys(cal.ethiopianMonths)).toHaveLength(13);
    expect(Object.keys(cal.gregorianMonths)).toHaveLength(12);
    expect(Object.keys(cal.weekdays)).toHaveLength(7);
  });

  it("formats in English and Amharic", async () => {
    const i = i18n.createInstance();
    await i.init({ resources: { en: { translation: en }, am: { translation: am } }, lng: "en", interpolation: { escapeValue: false } });
    expect(formatDate(i.t, at)).toBe("Friday, Meskerem 1, 2019");
    expect(formatDate(i.t, at, "gregorian")).toBe("Friday, September 11, 2026");
    await i.changeLanguage("am");
    expect(formatDate(i.t, at)).toBe("ዓርብ፣ መስከረም 1 ቀን 2019 ዓ.ም.");
  });
});
