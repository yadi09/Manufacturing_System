import type { RoleInfo } from "./api";

type Lang = string;
const isAm = (lang: Lang) => lang.startsWith("am");

/** Role names and descriptions are data in both languages; fall back to English if one is missing. */
export const roleName = (r: Pick<RoleInfo, "name" | "name_am">, lang: Lang) => (isAm(lang) && r.name_am ? r.name_am : r.name);
export const roleDescription = (r: Pick<RoleInfo, "description" | "description_am">, lang: Lang) =>
  isAm(lang) && r.description_am ? r.description_am : r.description;
