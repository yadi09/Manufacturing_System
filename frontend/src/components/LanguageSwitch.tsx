import { useTranslation } from "react-i18next";
import { LANGUAGES } from "../i18n";

/** Always visible. Each language is named in its own script, so it can be found from either one. */
export function LanguageSwitch() {
  const { t, i18n } = useTranslation();
  return (
    <div role="group" aria-label={t("language.label")} className="flex gap-0.5 rounded-md bg-surface-100 p-[3px]">
      {LANGUAGES.map((lng) => (
        <button
          key={lng}
          type="button"
          lang={lng}
          onClick={() => void i18n.changeLanguage(lng)}
          aria-pressed={i18n.language === lng}
          className="min-h-10 min-w-[76px] rounded-[8px] px-3 text-sm font-medium text-ink aria-pressed:bg-surface-0 aria-pressed:shadow-[0_1px_2px_rgb(19_32_30/0.12)]"
        >
          {t(`language.${lng}`)}
        </button>
      ))}
    </div>
  );
}
