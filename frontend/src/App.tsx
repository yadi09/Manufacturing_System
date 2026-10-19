import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { getHealth } from "./api";
import { LANGUAGES } from "./i18n";

// Foundation placeholder only. Real screens wait for approved mockups.
export default function App() {
  const { t, i18n } = useTranslation();
  const health = useQuery({ queryKey: ["health"], queryFn: getHealth, retry: false });

  return (
    <main className="mx-auto max-w-xl p-4 sm:p-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-brand">{t("app.name")}</h1>
        <div role="group" aria-label={t("foundation.language")} className="flex gap-1">
          {LANGUAGES.map((lng) => (
            <button
              key={lng}
              type="button"
              onClick={() => void i18n.changeLanguage(lng)}
              aria-pressed={i18n.language === lng}
              className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm aria-pressed:border-brand aria-pressed:bg-brand aria-pressed:text-white"
            >
              {t(`language.${lng}`)}
            </button>
          ))}
        </div>
      </header>
      <p className="mt-2 text-slate-600">{t("app.tagline")}</p>
      <section className="mt-6 rounded-xl border border-slate-200 p-4">
        <h2 className="text-lg font-semibold">{t("foundation.title")}</h2>
        <p className="mt-1 text-sm text-slate-600">{t("foundation.description")}</p>
        <p className="mt-3 text-sm">
          {t("foundation.apiStatus")}:{" "}
          <span data-testid="api-status" className="font-medium">
            {health.isPending ? "…" : health.data ? `${health.data.status} / ${health.data.database}` : t("foundation.statusOffline")}
          </span>
        </p>
      </section>
    </main>
  );
}
