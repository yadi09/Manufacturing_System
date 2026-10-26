import type { Recipe, VersionSummary } from "../recipeApi";

const line = (item_id: string, name: string, name_am: string, kind: "raw_material" | "additive", qty: string, unit: "g" | "kg") => ({ item_id, kind, name, name_am, qty, unit });

const eggLines = [line("m1", "LLDPE M500026", "LLDPE M500026", "raw_material", "42.000000", "g"), line("m2", "Grey masterbatch", "ግራጫ ማስተርባች", "additive", "0.800000", "g")];

/** Egg tray, Grey: regrind from egg tray and from jar cover, no maximum. Three versions. */
export const EGG_VERSIONS: Recipe[] = [
  { colour_id: "c1", version: 1, status: "replaced", reason: "First recipe.", created_by: "abebe.kebede@example.com", created_at: "2026-09-01T08:00:00Z", replaced_at: "2026-09-20T08:00:00Z", sale_unit: "piece", lines: eggLines, regrind: [], warn_pct: null, crit_pct: null, effective_warn_pct: "5", effective_crit_pct: "10" },
  { colour_id: "c1", version: 2, status: "replaced", reason: "Masterbatch amount corrected after a weighing test.", created_by: "dawit.alemu@example.com", created_at: "2026-09-20T08:00:00Z", replaced_at: "2026-10-12T08:00:00Z", sale_unit: "piece", lines: eggLines, regrind: [{ source_product_id: "p1", name: "Egg tray", name_am: "የእንቁላል ትሪ", max_blend_pct: null }], warn_pct: null, crit_pct: null, effective_warn_pct: "5", effective_crit_pct: "10" },
  {
    colour_id: "c1", version: 3, status: "active", reason: "Allowed regrind from jar cover (same material).", created_by: "dawit.alemu@example.com", created_at: "2026-10-12T08:00:00Z", replaced_at: null, sale_unit: "piece", lines: eggLines,
    regrind: [
      { source_product_id: "p1", name: "Egg tray", name_am: "የእንቁላል ትሪ", max_blend_pct: null },
      { source_product_id: "p2", name: "Jar cover", name_am: "የጀሪካን ክዳን", max_blend_pct: null },
    ],
    warn_pct: null, crit_pct: null, effective_warn_pct: "5", effective_crit_pct: "10",
  },
];

/** Jar cover, Clear: no regrind allowed. Two versions. */
export const JAR_VERSIONS: Recipe[] = [
  { colour_id: "c2", version: 1, status: "replaced", reason: "First recipe.", created_by: "abebe.kebede@example.com", created_at: "2026-09-01T08:00:00Z", replaced_at: "2026-10-12T08:00:00Z", sale_unit: "kg", lines: [line("m4", "LLDPE M500040", "LLDPE M500040", "raw_material", "1.000000", "kg")], regrind: [], warn_pct: null, crit_pct: null, effective_warn_pct: "5", effective_crit_pct: "10" },
  { colour_id: "c2", version: 2, status: "active", reason: "Material grade changed to M500026.", created_by: "dawit.alemu@example.com", created_at: "2026-10-12T08:00:00Z", replaced_at: null, sale_unit: "kg", lines: [line("m1", "LLDPE M500026", "LLDPE M500026", "raw_material", "1.000000", "kg")], regrind: [], warn_pct: "3.00", crit_pct: "6.00", effective_warn_pct: "3.00", effective_crit_pct: "6.00" },
];

export const summaryOf = (r: Recipe): VersionSummary => ({ version: r.version, status: r.status, reason: r.reason, created_by: r.created_by, created_at: r.created_at, replaced_at: r.replaced_at });
