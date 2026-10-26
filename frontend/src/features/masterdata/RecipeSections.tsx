import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Chip } from "../../components/Chip";
import { Icon } from "../../components/Icon";
import { trimDecimal } from "./format";
import { localName } from "./names";
import type { Recipe, RecipeLine } from "./recipeApi";

export function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-lg bg-surface-0 p-6 shadow-card">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-lg font-semibold" style={{ lineHeight: "26px" }}>
          {title}
        </h2>
        {subtitle && <p className="text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

/** "g per piece": the unit of an ingredient quantity, said against what the product is sold by. */
export function perUnitLabel(t: (k: string) => string, unit: RecipeLine["unit"], saleUnit: Recipe["sale_unit"]) {
  return t(`master.recipe.per.${unit}_${saleUnit}`);
}

/** A recipe version, read-only: ingredients, regrind rules and tolerances. */
export function RecipeSections({ recipe, productName }: { recipe: Recipe; productName: string }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const ownTolerance = recipe.warn_pct !== null || recipe.crit_pct !== null;
  return (
    <>
      <Card title={t("master.recipe.ingredients")} subtitle={t(recipe.sale_unit === "piece" ? "master.recipe.perPiece" : "master.recipe.perKg", { product: productName })}>
        <ul className="flex flex-col gap-2">
          {recipe.lines.map((l) => (
            <li key={l.item_id} className="grid items-center gap-1 rounded-md bg-surface-50 px-4 py-3 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1.4fr)] md:gap-3">
              <span className="flex min-w-0 flex-col">
                <span className="font-medium">{localName(l, lang)}</span>
                <span className="text-[13px] text-ink-muted" style={{ lineHeight: "18px" }}>
                  {t(`master.materials.kinds.${l.kind}`)}
                </span>
              </span>
              <span className="tabular md:text-right">
                <strong className="font-semibold">{trimDecimal(l.qty)}</strong> <span className="text-ink-muted">{perUnitLabel(t, l.unit, recipe.sale_unit)}</span>
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card title={t("master.recipe.regrind")} subtitle={t("master.recipe.regrindSub")}>
        {recipe.regrind.length === 0 ? (
          <div className="flex items-start gap-3 rounded-md bg-surface-50 px-4 py-3.5 text-sm" style={{ lineHeight: "20px" }}>
            <Icon name="ban" className="mt-0.5 shrink-0 text-ink-muted" />
            <span>
              <strong className="font-semibold">{t("master.recipe.noRegrindTitle")}</strong>
              <br />
              {t("master.recipe.noRegrindBody")}
            </span>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {recipe.regrind.map((r) => (
              <li key={r.source_product_id} className="grid items-center gap-1 rounded-md bg-surface-50 px-4 py-3 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1.4fr)] md:gap-3">
                <span className="flex items-center gap-2.5">
                  <Chip tone="active">{t("master.recipe.allowed")}</Chip>
                  <span className="font-medium">{t("master.recipe.fromSource", { name: localName(r, lang) })}</span>
                </span>
                <span className="text-sm text-ink-muted md:text-right">{r.max_blend_pct === null ? t("master.recipe.noMax") : t("master.recipe.maxPct", { pct: trimDecimal(r.max_blend_pct) })}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={t("master.recipe.tolerance")} subtitle={t("master.recipe.toleranceSub")}>
        <dl className="flex flex-wrap gap-x-10 gap-y-3">
          <div>
            <dt className="text-sm text-ink-muted">{t("master.recipe.warn")}</dt>
            <dd className="tabular text-lg font-semibold">±{trimDecimal(recipe.effective_warn_pct)}%</dd>
          </div>
          <div>
            <dt className="text-sm text-ink-muted">{t("master.recipe.crit")}</dt>
            <dd className="tabular text-lg font-semibold">±{trimDecimal(recipe.effective_crit_pct)}%</dd>
          </div>
        </dl>
        <p className="text-[13px] text-ink-muted" style={{ lineHeight: "18px" }}>
          {ownTolerance ? t("master.recipe.toleranceOwn") : t("master.recipe.toleranceDefault")}
        </p>
      </Card>
    </>
  );
}
