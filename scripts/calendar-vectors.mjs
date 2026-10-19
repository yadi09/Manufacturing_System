// Generates docs/calendar-vectors.json from ICU (through Node's Intl), an
// independent reference. It must never import our own calendar code.
//   node scripts/calendar-vectors.mjs > docs/calendar-vectors.json
const DAY = 86_400_000;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const ethFmt = (timeZone) =>
  new Intl.DateTimeFormat("en-u-ca-ethiopic", { timeZone, era: "short", year: "numeric", month: "numeric", day: "numeric", weekday: "long" });
const gregFmt = (timeZone) =>
  new Intl.DateTimeFormat("en-u-ca-gregory", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });

function parts(fmt, date) {
  return Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
}

function ethiopianOf(date, timeZone = "UTC") {
  const p = parts(ethFmt(timeZone), date);
  if (p.era !== "AM") throw new Error(`unexpected era ${p.era} for ${date.toISOString()}`);
  return { year: +p.year, month: +p.month, day: +p.day, weekday: WEEKDAYS.indexOf(p.weekday) };
}

function gregorianOf(date, timeZone = "UTC") {
  const p = parts(gregFmt(timeZone), date);
  return `${p.year}-${p.month}-${p.day}`;
}

const iso = (date) => date.toISOString().slice(0, 10);
const utc = (s) => new Date(`${s}T00:00:00Z`);

const dates = new Map();
function add(date, note) {
  const key = iso(date);
  const e = ethiopianOf(date);
  const prev = dates.get(key);
  if (prev) {
    if (!prev.notes.includes(note)) prev.notes.push(note);
    return;
  }
  dates.set(key, { gregorian: key, ethiopian: { year: e.year, month: e.month, day: e.day }, weekday: e.weekday, notes: [note] });
}

// Every Gregorian day from Sept 1 of gYear to Sept 30 of gYear+1 covers one whole Ethiopian year.
function ethiopianYearDays(eYear) {
  const gYear = eYear + 7;
  const out = [];
  for (let t = utc(`${gYear}-09-01`).getTime(); t <= utc(`${gYear + 1}-09-30`).getTime(); t += DAY) {
    const d = new Date(t);
    if (ethiopianOf(d).year === eYear) out.push(d);
  }
  return out;
}

function lastDays(eYear) {
  const days = ethiopianYearDays(eYear);
  const byMonth = new Map();
  for (const d of days) byMonth.set(ethiopianOf(d).month, d);
  return [...byMonth.values()];
}

// 1. Last day of all 13 months, in a leap year (Pagume 6) and a common year (Pagume 5).
for (const d of lastDays(2015)) add(d, "last day of month, leap year 2015");
for (const d of lastDays(2016)) add(d, "last day of month, common year 2016");

// 2. Leap years with Pagume 6, near and far.
for (const y of [1891, 1999, 2011, 2015, 2019, 2023, 2099, 2391]) {
  const last = ethiopianYearDays(y).at(-1);
  if (ethiopianOf(last).day !== 6) throw new Error(`${y} expected Pagume 6`);
  add(last, `Pagume 6, leap year ${y}`);
}

// 3. New Year: Pagume 5/6 to Meskerem 1, including years starting Sept 11 and Sept 12,
//    and across 1900 and 2100 (not Gregorian leap years), where the offset shifts.
for (const y of [...range(1890, 1896), ...range(2008, 2022), ...range(2090, 2096)]) {
  const first = ethiopianYearDays(y)[0];
  const before = new Date(first.getTime() - DAY);
  const md = iso(first).slice(5);
  add(before, `last day of ${y - 1}`);
  add(first, `Meskerem 1, ${y}: New Year on ${md}`);
}

// 4. Dates far from today and well-known dates.
const far = {
  "1600-01-01": "far past",
  "1700-03-01": "far past, after a non-leap Gregorian Feb",
  "1896-03-01": "Battle of Adwa, published as Yekatit 23, 1888",
  "1899-12-31": "before 1900",
  "1900-02-28": "1900 is not a Gregorian leap year",
  "1900-03-01": "1900 is not a Gregorian leap year",
  "2007-09-12": "Ethiopian Millennium, published as Meskerem 1, 2000",
  "2026-10-19": "around today",
  "2100-02-28": "2100 is not a Gregorian leap year",
  "2100-03-01": "2100 is not a Gregorian leap year",
  "2400-02-29": "Gregorian leap day in a century year",
  "2500-12-31": "far future",
};
for (const [d, note] of Object.entries(far)) add(utc(d), note);

// 5. Instants: conversion depends on the display time zone.
const instants = [
  ["2026-09-10T20:59:59Z", "Africa/Addis_Ababa", "23:59:59 local, still the last day of 2018"],
  ["2026-09-10T21:00:00Z", "Africa/Addis_Ababa", "00:00 local: already New Year 2019 in Ethiopia"],
  ["2026-09-10T21:30:00Z", "Africa/Addis_Ababa", "late evening UTC is already the next day (New Year) in Ethiopia"],
  ["2026-09-10T21:30:00Z", "UTC", "same instant in UTC is still the previous day"],
  ["2026-10-19T22:15:00Z", "Africa/Addis_Ababa", "late evening UTC is the next day in Ethiopia"],
].map(([at, timeZone, note]) => {
  const d = new Date(at);
  const e = ethiopianOf(d, timeZone);
  return { utc: at, time_zone: timeZone, ethiopian: { year: e.year, month: e.month, day: e.day }, gregorian: gregorianOf(d, timeZone), note };
});

// 6. Shifts: a shift belongs to the local day it started. Expected day = ICU's local date of the shift start.
const shifts = [
  ["2026-09-10T19:00:00Z", "2026-09-11T00:00:00Z", "night shift 22:00-06:00 local over New Year; event at 03:00 local next day"],
  ["2026-10-19T19:00:00Z", "2026-10-20T02:30:00Z", "night shift 22:00-06:00 local; event at 05:30 local next day"],
  ["2026-10-20T03:00:00Z", "2026-10-20T10:00:00Z", "day shift 06:00-14:00 local; event at 13:00 local same day"],
].map(([start, event, note]) => {
  const timeZone = "Africa/Addis_Ababa";
  const e = ethiopianOf(new Date(start), timeZone);
  return { shift_start_utc: start, event_utc: event, time_zone: timeZone, shift_day: { gregorian: gregorianOf(new Date(start), timeZone), ethiopian: { year: e.year, month: e.month, day: e.day } }, note };
});

function range(a, b) {
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}

const out = {
  source: `ICU ${process.versions.icu} (tz ${process.versions.tz}) through Node ${process.version} Intl, Ethiopic calendar (Amete Mihret era) and IANA time zones. Not generated from this project's code.`,
  spot_checks: "Agrees with published dates: Ethiopian Millennium Meskerem 1, 2000 = 2007-09-12; Battle of Adwa Yekatit 23, 1888 = 1896-03-01.",
  generator: "scripts/calendar-vectors.mjs",
  conventions: "Ethiopian months 1-13 (1 = Meskerem, 13 = Pagume). weekday 0 = Sunday. Gregorian dates are proleptic, ISO YYYY-MM-DD.",
  dates: [...dates.values()].sort((a, b) => a.gregorian.localeCompare(b.gregorian)),
  instants,
  shifts,
};
process.stdout.write(JSON.stringify(out, null, 2) + "\n");
