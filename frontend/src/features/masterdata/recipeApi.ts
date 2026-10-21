import { request } from "../../api/client";

export interface RecipeLine {
  item_id: string;
  kind: "raw_material" | "additive";
  name: string;
  name_am: string;
  /** Per ONE sale unit of the product, as an exact decimal string. */
  qty: string;
  unit: "g" | "kg";
}

export interface RegrindRule {
  source_product_id: string;
  name: string;
  name_am: string;
  /** null: no maximum. */
  max_blend_pct: string | null;
}

export interface Recipe {
  colour_id: string;
  version: number;
  status: "active" | "replaced";
  reason: string;
  created_by: string;
  created_at: string;
  replaced_at: string | null;
  sale_unit: "piece" | "kg";
  lines: RecipeLine[];
  regrind: RegrindRule[];
  /** The recipe's own tolerances; null means the settings default applies. */
  warn_pct: string | null;
  crit_pct: string | null;
  effective_warn_pct: string;
  effective_crit_pct: string;
}

export interface VersionSummary {
  version: number;
  status: "active" | "replaced";
  reason: string;
  created_by: string;
  created_at: string;
  replaced_at: string | null;
}

export interface NewRecipe {
  base_version: number;
  reason: string;
  lines: Array<{ item_id: string; qty: string; unit: "g" | "kg" }>;
  regrind: Array<{ source_product_id: string; max_blend_pct: string | null }>;
  warn_pct: string | null;
  crit_pct: string | null;
}

export const getRecipe = (colourId: string) => request<Recipe>("GET", `/api/colours/${colourId}/recipe`);
export const getRecipeVersion = (colourId: string, version: number) => request<Recipe>("GET", `/api/colours/${colourId}/recipe/versions/${version}`);
export const listRecipeVersions = (colourId: string) => request<VersionSummary[]>("GET", `/api/colours/${colourId}/recipe/versions`);
export const saveRecipe = (colourId: string, r: NewRecipe) => request<Recipe>("POST", `/api/colours/${colourId}/recipe/versions`, r);
