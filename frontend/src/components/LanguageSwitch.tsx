import { useTranslation } from "react-i18next";
import { LANGUAGES } from "../i18n";

/** Always visible. Each language is named in its own script. `compact` shows EN / አማ on narrow screens. */
export function LanguageSwitch({ compact }: { compact?: boolean }) {
  const { t, i18n } = useTranslation();
  return (
    <div role="group" aria-label={t("language.label")} className="flex gap-0.5 rounded-md bg-surface-100 p-[3px]">
      {LANGUAGES.map((lng) => (
        <button
          key={lng}
          type="button"
          lang={lng}
          aria-label={compact ? t(`language.${lng}`) : undefined}
          onClick={() => void i18n.changeLanguage(lng)}
          aria-pressed={i18n.language === lng}
          className={`min-h-10 rounded-[8px] px-3 text-sm font-medium text-ink aria-pressed:bg-surface-0 aria-pressed:shadow-[0_1px_2px_rgb(19_32_30/0.12)] ${compact ? "min-h-11 min-w-12 px-2 md:min-w-[76px] md:px-3" : "min-w-[76px]"}`}
        >
          {compact ? (
            <>
              <span aria-hidden="true" className="md:hidden">
                {t(`language.${lng}Short`)}
              </span>
              <span aria-hidden="true" className="hidden md:inline">
                {t(`language.${lng}`)}
              </span>
            </>
          ) : (
            t(`language.${lng}`)
          )}
        </button>
      ))}
    </div>
  );
}
