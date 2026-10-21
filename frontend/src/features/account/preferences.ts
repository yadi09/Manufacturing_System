import { request } from "../../api/client";

export interface PreferencesUpdate {
  language?: "en" | "am";
  calendar?: "ethiopian" | "gregorian";
}

export const savePreferences = (p: PreferencesUpdate) => request<void>("PATCH", "/api/auth/preferences", p);
