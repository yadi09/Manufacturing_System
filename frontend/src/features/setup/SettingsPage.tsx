import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { ApiError } from "../../api/client";
import { AppShell } from "../../components/AppShell";
import { Button } from "../../components/Button";
import { Notice } from "../../components/Notice";
import { TextField } from "../../components/TextField";
import type { User } from "../auth/api";
import type { Settings } from "./api";
import { useSettings, useUpdateSettings } from "./hooks";
import { ListState, useErrorText } from "./Shared";

type Key = keyof Settings;

/** Limits match the server's; the server checks again. */
const NUMBERS: Record<Exclude<Key, "display_time_zone">, { min: number; max: number; unit: string; plusMinus?: boolean }> = {
  login_max_attempts: { min: 1, max: 50, unit: "attempts" },
  login_lockout_minutes: { min: 1, max: 1440, unit: "minutes" },
  rest_rotation_minutes: { min: 5, max: 720, unit: "minutes" },
  bom_warn_pct: { min: 1, max: 100, unit: "percent", plusMinus: true },
  bom_crit_pct: { min: 1, max: 100, unit: "percent", plusMinus: true },
};

const GROUPS: Array<{ key: string; items: Key[] }> = [
  { key: "time", items: ["display_time_zone"] },
  { key: "signIn", items: ["login_max_attempts", "login_lockout_minutes"] },
  { key: "production", items: ["rest_rotation_minutes", "bom_warn_pct", "bom_crit_pct"] },
];

const zones = (): string[] => {
  try {
    return (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
  } catch {
    return [];
  }
};

export function SettingsPage({ me }: { me: User }) {
  const { t } = useTranslation();
  const settings = useSettings();
  // Kept here: the form starts again from the saved values, and the notice must survive that.
  const [saved, setSaved] = useState(false);
  return (
    <AppShell user={me} title={t("nav.settings")} subtitle={t("setup.settings.intro")}>
      <ListState query={settings} empty={false} emptyTitle="" emptyBody="" />
      {settings.data && <SettingsForm key={JSON.stringify(settings.data)} current={settings.data} saved={saved} setSaved={setSaved} />}
    </AppShell>
  );
}

function SettingsForm({ current, saved, setSaved }: { current: Settings; saved: boolean; setSaved: (v: boolean) => void }) {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const save = useUpdateSettings();
  const [values, setValues] = useState<Record<Key, string>>(() => Object.fromEntries(Object.entries(current).map(([k, v]) => [k, String(v)])) as Record<Key, string>);
  const [errors, setErrors] = useState<Partial<Record<Key, string>>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const changed = (Object.keys(values) as Key[]).filter((k) => values[k].trim() !== String(current[k]));
  const tzList = zones();

  function submit(e: FormEvent) {
    e.preventDefault();
    setProblem(null);
    setSaved(false);
    const next: Partial<Record<Key, string>> = {};
    for (const k of Object.keys(NUMBERS) as Array<keyof typeof NUMBERS>) {
      const v = values[k].trim();
      const n = Number(v);
      if (!/^\d+$/.test(v) || n < NUMBERS[k].min || n > NUMBERS[k].max) next[k] = t("setup.settings.range", { min: NUMBERS[k].min, max: NUMBERS[k].max });
    }
    if (!next.bom_warn_pct && !next.bom_crit_pct && Number(values.bom_warn_pct) >= Number(values.bom_crit_pct)) next.bom_warn_pct = t("setup.errors.tolerance_order");
    if (!values.display_time_zone.trim()) next.display_time_zone = t("setup.errors.invalid_time_zone");
    setErrors(next);
    if (Object.keys(next).length) return;
    const body: Partial<Settings> = {};
    for (const k of changed) (body as Record<string, unknown>)[k] = k === "display_time_zone" ? values[k].trim() : Number(values[k]);
    save.mutate(body, {
      onSuccess: () => setSaved(true),
      onError: (err) => {
        // The server names the setting too; these two codes each belong to one field.
        const field: Key | undefined = err instanceof ApiError ? ({ tolerance_order: "bom_warn_pct", invalid_time_zone: "display_time_zone" } as const)[err.code as "tolerance_order"] : undefined;
        if (field) setErrors({ [field]: errorText(err) });
        else setProblem(errorText(err));
      },
    });
  }

  return (
    <form onSubmit={submit} noValidate className="flex max-w-[760px] flex-col gap-4">
      {saved && <Notice tone="info" icon="check" title={t("setup.settings.saved")} />}
      {problem && <Notice tone="danger" title={t("master.errors.title")}>{problem}</Notice>}
      {GROUPS.map((g) => (
        <section key={g.key} aria-labelledby={`settings-${g.key}`} className="flex flex-col gap-4 rounded-lg bg-surface-0 p-5 shadow-card md:p-6">
          <div className="flex flex-col gap-0.5">
            <h2 id={`settings-${g.key}`} className="text-lg font-semibold">
              {t(`setup.settings.groups.${g.key}.title`)}
            </h2>
            <span className="text-sm text-ink-muted">{t(`setup.settings.groups.${g.key}.sub`)}</span>
          </div>
          {g.items.map((k) => {
            const spec = k === "display_time_zone" ? null : NUMBERS[k];
            return (
              <div key={k} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-t border-line pt-4">
                <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-0.5">
                  <label htmlFor={`setting-${k}`} className="font-medium">
                    {t(`setup.settings.keys.${k}.label`)}
                  </label>
                  <span id={`setting-${k}-help`} className="text-[13px] text-ink-muted">
                    {t(`setup.settings.keys.${k}.help`)}
                  </span>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="flex items-center gap-2">
                    {spec?.plusMinus && <span className="text-ink-muted">±</span>}
                    {spec ? (
                      <input
                        id={`setting-${k}`}
                        inputMode="numeric"
                        value={values[k]}
                        onChange={(e) => (setSaved(false), setValues((v) => ({ ...v, [k]: e.target.value })))}
                        aria-invalid={errors[k] ? true : undefined}
                        aria-describedby={`setting-${k}-help${errors[k] ? ` setting-${k}-error` : ""}`}
                        className={`h-control-md w-24 rounded-md border bg-surface-0 px-3 text-right text-base tabular ${errors[k] ? "border-danger" : "border-control-border"}`}
                      />
                    ) : tzList.length > 0 ? (
                      <select
                        id={`setting-${k}`}
                        value={values[k]}
                        onChange={(e) => setValues((v) => ({ ...v, [k]: e.target.value }))}
                        aria-describedby={`setting-${k}-help`}
                        className="h-control-md w-full max-w-[280px] rounded-md border border-control-border bg-surface-0 px-3 text-base"
                      >
                        {(tzList.includes(values[k]) ? tzList : [values[k], ...tzList]).map((z) => (
                          <option key={z} value={z}>
                            {z}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="w-[260px]">
                        <TextField label={t(`setup.settings.keys.${k}.label`)} value={values[k]} onChange={(e) => setValues((v) => ({ ...v, [k]: e.target.value }))} error={errors[k]} />
                      </div>
                    )}
                    {spec && <span className="min-w-[64px] text-sm text-ink-muted">{t(`setup.settings.units.${spec.unit}`)}</span>}
                  </span>
                  {errors[k] && spec && (
                    <span id={`setting-${k}-error`} className="text-[13px] text-danger">
                      {errors[k]}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      ))}
      <span className="text-[13px] text-ink-muted">{t("setup.settings.audit")}</span>
      <Button type="submit" className="self-start px-6" loading={save.isPending} disabled={changed.length === 0}>
        {t("setup.settings.save")}
      </Button>
    </form>
  );
}
