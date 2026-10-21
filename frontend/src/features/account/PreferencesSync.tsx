import { useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import i18n from "../../i18n";
import { getCalendar, setCalendar, subscribeCalendar } from "../../lib/calendar/preference";
import type { User } from "../auth/api";
import { savePreferences, type PreferencesUpdate } from "./preferences";

/**
 * Keeps the person's language and calendar on the server, so they follow the person to any device.
 *
 * - When a person signs in, their saved choices are applied on this device. Nothing saved yet
 *   (null) means the device's current value stays, and nothing is written until they choose.
 * - After that, every change to the language or calendar is saved. Saving is best effort: if the
 *   network is down the choice still works on this device.
 * - Before sign-in the device value is the only one there is (the fallback).
 */
export function PreferencesSync({ user }: { user: User }) {
  const known = useRef<{ language: string | null; calendar: string | null }>({
    language: user.preferences.language,
    calendar: user.preferences.calendar,
  });
  const save = useMutation({ mutationFn: (p: PreferencesUpdate) => savePreferences(p) });
  const saveRef = useRef(save.mutate);
  saveRef.current = save.mutate;

  useEffect(() => {
    const { language, calendar } = user.preferences;
    if (language && i18n.language !== language) void i18n.changeLanguage(language);
    if (calendar && getCalendar() !== calendar) setCalendar(calendar);
  }, [user.id, user.preferences]);

  useEffect(() => {
    const onLanguage = (lng: string) => {
      if ((lng === "en" || lng === "am") && known.current.language !== lng) {
        known.current.language = lng;
        saveRef.current({ language: lng });
      }
    };
    i18n.on("languageChanged", onLanguage);
    const stopCalendar = subscribeCalendar(() => {
      const c = getCalendar();
      if (known.current.calendar !== c) {
        known.current.calendar = c;
        saveRef.current({ calendar: c });
      }
    });
    return () => {
      i18n.off("languageChanged", onLanguage);
      stopCalendar();
    };
  }, []);

  return null;
}
