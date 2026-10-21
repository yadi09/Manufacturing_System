import type { Employee, Location, Mould, Profession, Reason, Settings, Shift, Workspace } from "../api";

/** Crown's machines and areas. Machine 2 carries the clear jar cap mould at the weekly report's 31.7 s. */
export const WORKSPACES: Workspace[] = [
  { id: "w1", kind: "machine", name: "Machine 1", name_am: "ማሽን 1", runs_24h: true, active: true, setups: [{ mould_id: "mo2", standard_cycle_s: null, active: true, colours: [] }] },
  { id: "w2", kind: "machine", name: "Machine 2", name_am: "ማሽን 2", runs_24h: true, active: true, setups: [{ mould_id: "mo1", standard_cycle_s: "31.70", active: true, colours: [{ colour_id: "c3", cycle_s: "30.70" }] }] },
  { id: "w3", kind: "qc", name: "QC area", name_am: "የጥራት ቁጥጥር ቦታ", runs_24h: true, active: true, setups: [] },
  { id: "w4", kind: "recycling", name: "Recycling", name_am: "መልሶ መጠቀሚያ", runs_24h: true, active: true, setups: [] },
];

/** The egg tray mould's cavities are not known yet (Crown's data is still coming). */
export const MOULDS: Mould[] = [
  { id: "mo1", product_id: "p2", name: "Clear jar cap mould", name_am: "የግልጽ ጀሪካን ክዳን ሻጋታ", cavities: 11, active: true },
  { id: "mo2", product_id: "p1", name: "Egg tray mould", name_am: "የእንቁላል ትሪ ሻጋታ", cavities: null, active: true },
];

export const SHIFTS: Shift[] = [
  { id: "s1", name: "Day", name_am: "ቀን", start_time: "08:00", end_time: "18:00", position: 1, active: true, crosses_midnight: false },
  { id: "s2", name: "Night", name_am: "ሌሊት", start_time: "18:00", end_time: "08:00", position: 2, active: true, crosses_midnight: true },
];

/** The reasons in Crown's weekly report. */
export const REASONS: Reason[] = [
  { id: "r1", kind: "damage", name: "Colour defect", name_am: "የቀለም ጉድለት", active: true },
  { id: "r2", kind: "damage", name: "Raw material spill from the mould", name_am: "ከሻጋታው የጥሬ ዕቃ መፍሰስ", active: true },
  { id: "r3", kind: "damage", name: "Splitting", name_am: "መሰንጠቅ", active: true },
  { id: "r4", kind: "downtime", name: "Power off", name_am: "የኃይል መቋረጥ", active: true },
];

export const LOCATIONS: Location[] = [
  { key: "raw_store", holds_stock: true, name: "Raw material store", name_am: "የጥሬ ዕቃ መጋዘን" },
  { key: "regrind_store", holds_stock: true, name: "Regrind store", name_am: "የሚፈጭ መጋዘን" },
  { key: "qc_area", holds_stock: false, name: "QC area", name_am: "የጥራት ቁጥጥር ቦታ" },
  { key: "staging_area", holds_stock: false, name: "Staging area", name_am: "የማቆያ ቦታ" },
  { key: "fg_store", holds_stock: true, name: "Finished goods store", name_am: "የተጠናቀቁ ዕቃዎች መጋዘን" },
];

export const PROFESSIONS: Profession[] = [
  { id: "pr1", name: "Machine operator", name_am: "የማሽን ኦፕሬተር", active: true, employees: 3 },
  { id: "pr2", name: "QC inspector", name_am: "የጥራት ተቆጣጣሪ", active: true, employees: 1 },
  { id: "pr3", name: "Shift supervisor", name_am: "የፈረቃ ተቆጣጣሪ", active: true, employees: 1 },
  { id: "pr4", name: "Production manager", name_am: "የምርት ሥራ አስኪያጅ", active: true, employees: 1 },
  { id: "pr5", name: "Store manager", name_am: "የመጋዘን ኃላፊ", active: true, employees: 0 },
];

/** Invented people. Operators have no account; three people are linked to users in the users fixtures. */
export const EMPLOYEES: Employee[] = [
  { id: "e1", full_name: "Dawit Alemu", name_am: "ዳዊት አለሙ", profession_id: "pr4", user_id: "u3", email: "dawit.alemu@example.com", active: true },
  { id: "e2", full_name: "Hana Bekele", name_am: "ሐና በቀለ", profession_id: "pr1", user_id: null, email: null, active: true },
  { id: "e3", full_name: "Meron Haile", name_am: "ሜሮን ኃይሌ", profession_id: "pr3", user_id: "u4", email: "meron.haile@example.com", active: true },
  { id: "e4", full_name: "Selamawit Mekonnen", name_am: null, profession_id: "pr2", user_id: null, email: null, active: true },
  { id: "e5", full_name: "Tesfaye Girma", name_am: "ተስፋዬ ግርማ", profession_id: "pr1", user_id: null, email: null, active: true },
  { id: "e6", full_name: "Yonas Tadesse", name_am: "ዮናስ ታደሰ", profession_id: "pr1", user_id: null, email: null, active: true },
  { id: "e7", full_name: "Kebede Ayele", name_am: "ከበደ አየለ", profession_id: "pr1", user_id: null, email: null, active: false },
];

export const SETTINGS: Settings = { display_time_zone: "Africa/Addis_Ababa", login_max_attempts: 5, login_lockout_minutes: 15, rest_rotation_minutes: 60, bom_warn_pct: 5, bom_crit_pct: 10 };
