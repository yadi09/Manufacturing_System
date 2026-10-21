import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/Button";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Icon } from "../../components/Icon";
import { Modal } from "../../components/Modal";
import { Notice } from "../../components/Notice";
import { ApiError } from "../../api/client";
import type { Material, Product } from "./api";
import { masterErrorKey } from "./errors";
import { isPositiveDecimal, trimDecimal } from "./format";
import { localName } from "./names";
import type { NewRecipe, Recipe } from "./recipeApi";
import { useSaveRecipe } from "./recipeHooks";
import { Card, perUnitLabel, RecipeSections } from "./RecipeSections";

interface LineState {
  item_id: string;
  name: string;
  name_am: string;
  kind: Material["kind"];
  qty: string;
  unit: "g" | "kg";
}
interface RuleState {
  source_product_id: string;
  name: string;
  name_am: string;
  max: string;
}
interface Draft {
  lines: LineState[];
  rules: RuleState[];
  warn: string;
  crit: string;
  reason: string;
}

function draftFrom(r: Recipe | null): Draft {
  return {
    lines: (r?.lines ?? []).map((l) => ({ item_id: l.item_id, name: l.name, name_am: l.name_am, kind: l.kind, qty: trimDecimal(l.qty), unit: l.unit })),
    rules: (r?.regrind ?? []).map((x) => ({ source_product_id: x.source_product_id, name: x.name, name_am: x.name_am, max: trimDecimal(x.max_blend_pct) })),
    warn: trimDecimal(r?.effective_warn_pct ?? "5"),
    crit: trimDecimal(r?.effective_crit_pct ?? "10"),
    reason: "",
  };
}

type Errors = { lines: Record<number, string>; rules: Record<number, string>; warn?: string; crit?: string; reason?: string; none?: string };

interface Props {
  colourId: string;
  product: Product;
  /** The version being changed (null when the colour has no recipe: the first recipe starts from version 0). */
  current: Recipe | null;
  /** A recipe whose lines, rules and tolerances fill the form (a copy from another colour). */
  start: Recipe | null;
  materials: Material[];
  products: Product[];
  /** The newest version on the server, refreshed when a save is refused. */
  latest: Recipe | null;
  onConflict: () => void;
  onCancel: () => void;
  onSaved: (saved: Recipe, previous: number) => void;
}

/** Edit a recipe as a new version. Nothing is saved until a reason is given; older versions never change. */
export function RecipeEditor({ colourId, product, current, start, materials, products, latest, onConflict, onCancel, onSaved }: Props) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const save = useSaveRecipe(colourId);
  const initial = draftFrom(start ?? current);
  const [draft, setDraft] = useState<Draft>(initial);
  const [baseVersion, setBaseVersion] = useState(current?.version ?? 0);
  const [errors, setErrors] = useState<Errors>({ lines: {}, rules: {} });
  const [problem, setProblem] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [viewLatest, setViewLatest] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const nextVersion = baseVersion + 1;
  const baseUnit: "g" | "kg" = product.sale_unit === "piece" ? "g" : "kg";
  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));
  const usedItems = new Set(draft.lines.map((l) => l.item_id));
  const usedSources = new Set(draft.rules.map((r) => r.source_product_id));
  const addableMaterials = materials.filter((m) => m.active && !usedItems.has(m.id));
  const addableSources = products.filter((p) => !usedSources.has(p.id));

  function validate(): Errors {
    const e: Errors = { lines: {}, rules: {} };
    if (draft.lines.length === 0) e.none = t("master.recipe.errors.noIngredients");
    draft.lines.forEach((l, i) => {
      if (!isPositiveDecimal(l.qty, 6)) e.lines[i] = t("master.recipe.errors.invalidQuantity");
    });
    draft.rules.forEach((r, i) => {
      if (r.max.trim() && !(isPositiveDecimal(r.max, 2) && Number(r.max) <= 100)) e.rules[i] = t("master.recipe.errors.invalidBlend");
    });
    const warnOk = isPositiveDecimal(draft.warn, 2) && Number(draft.warn) <= 100;
    const critOk = isPositiveDecimal(draft.crit, 2) && Number(draft.crit) <= 100;
    if (!warnOk) e.warn = t("master.recipe.errors.invalidTolerance");
    if (!critOk) e.crit = t("master.recipe.errors.invalidTolerance");
    if (warnOk && critOk && Number(draft.warn) >= Number(draft.crit)) e.warn = t("master.recipe.errors.toleranceOrder");
    if (!draft.reason.trim()) e.reason = t("master.recipe.errors.reasonRequired");
    return e;
  }

  function submit() {
    setProblem(null);
    setConflict(false);
    const e = validate();
    setErrors(e);
    if (e.none || e.warn || e.crit || e.reason || Object.keys(e.lines).length || Object.keys(e.rules).length) return;
    // A tolerance that still equals what the recipe already uses stays as it was (a default stays a default).
    const sameAsEffective = (v: string, effective: string | undefined) => effective !== undefined && Number(v) === Number(effective);
    const baseWarn = (start ?? current)?.effective_warn_pct ?? "5";
    const baseCrit = (start ?? current)?.effective_crit_pct ?? "10";
    const ownWarn = (start ?? current)?.warn_pct ?? null;
    const ownCrit = (start ?? current)?.crit_pct ?? null;
    const body: NewRecipe = {
      base_version: baseVersion,
      reason: draft.reason.trim(),
      lines: draft.lines.map((l) => ({ item_id: l.item_id, qty: l.qty.trim(), unit: l.unit })),
      regrind: draft.rules.map((r) => ({ source_product_id: r.source_product_id, max_blend_pct: r.max.trim() || null })),
      warn_pct: sameAsEffective(draft.warn, baseWarn) && ownWarn === null ? null : draft.warn.trim(),
      crit_pct: sameAsEffective(draft.crit, baseCrit) && ownCrit === null ? null : draft.crit.trim(),
    };
    save.mutate(body, {
      onSuccess: (saved) => onSaved(saved, baseVersion),
      onError: (err) => {
        if (err instanceof ApiError && err.code === "version_conflict") {
          setConflict(true);
          onConflict();
          return;
        }
        const code = err instanceof ApiError ? err.code : "";
        const known: Record<string, string> = {
          reason_required: "reasonRequired", no_ingredients: "noIngredients", duplicate_ingredient: "duplicateIngredient", invalid_quantity: "invalidQuantity",
          unit_not_allowed: "unitNotAllowed", unknown_item: "unknownItem", invalid_blend: "invalidBlend", duplicate_regrind_source: "duplicateSource",
          unknown_regrind_source: "unknownSource", invalid_tolerance: "invalidTolerance",
        };
        setProblem(known[code] ? `recipe.errors.${known[code]}` : masterErrorKey(err));
      },
    });
  }

  function startAgain() {
    if (!latest) return;
    setDraft({ ...draftFrom(latest), reason: draft.reason });
    setBaseVersion(latest.version);
    setConflict(false);
    setErrors({ lines: {}, rules: {} });
  }

  const inputCls = (bad: boolean) => `h-12 rounded-md border bg-surface-0 px-3 text-base text-ink ${bad ? "border-danger" : "border-control-border"}`;

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-brand-tint px-3 text-sm font-semibold text-brand">
          <Icon name="check" size={14} />
          {t("master.recipe.editingBadge", { version: nextVersion })}
        </span>
        <span className="text-sm text-ink-muted">{current ? t("master.recipe.basedOn", { version: baseVersion }) : start ? t("master.recipe.copiedRecipe") : t("master.recipe.firstRecipe")}</span>
      </div>

      <Notice tone="info" title={t("master.recipe.editInfoTitle")}>
        {t("master.recipe.editInfoBody")}
      </Notice>

      {conflict && latest && latest.version !== baseVersion && (
        <Notice tone="warning" icon="clock" title={t("master.recipe.conflictTitle", { version: latest.version, by: latest.created_by })}>
          <span className="flex flex-col items-start gap-2">
            {t("master.recipe.conflictBody")}
            <span className="flex flex-wrap gap-2">
              <Button variant="secondary" className="h-10 px-4 text-sm font-medium" onClick={() => setViewLatest(true)}>
                {t("master.recipe.viewNewVersion", { version: latest.version })}
              </Button>
              <Button variant="secondary" className="h-10 px-4 text-sm font-medium" onClick={startAgain}>
                {t("master.recipe.startAgain", { version: latest.version })}
              </Button>
            </span>
          </span>
        </Notice>
      )}
      {problem && (
        <Notice tone="danger" title={t("master.errors.title")}>
          {t(problem.startsWith("recipe.") ? `master.${problem}` : `master.errors.${problem}`)}
        </Notice>
      )}

      <Card title={t("master.recipe.ingredients")} subtitle={t(product.sale_unit === "piece" ? "master.recipe.perPiece" : "master.recipe.perKg", { product: localName(product, lang) })}>
        {draft.lines.map((l, i) => (
          <div key={l.item_id} className="flex flex-col gap-1">
            <div className="grid grid-cols-[minmax(0,1fr)] items-center gap-2 rounded-md bg-surface-50 px-4 py-3 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1.6fr)] md:gap-3">
              <span className="flex min-w-0 flex-col">
                <span className="font-medium">{localName(l, lang)}</span>
                <span className="text-[13px] text-ink-muted" style={{ lineHeight: "18px" }}>
                  {t(`master.materials.kinds.${l.kind}`)}
                </span>
              </span>
              <span className="flex min-w-0 items-center gap-2">
                <input
                  aria-label={t("master.recipe.qtyFor", { name: localName(l, lang) })}
                  inputMode="decimal"
                  value={l.qty}
                  aria-invalid={errors.lines[i] ? true : undefined}
                  onChange={(e) => patch({ lines: draft.lines.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)) })}
                  className={`${inputCls(Boolean(errors.lines[i]))} w-28 text-right tabular`}
                />
                <select
                  aria-label={t("master.recipe.unitFor", { name: localName(l, lang) })}
                  value={l.unit}
                  onChange={(e) => patch({ lines: draft.lines.map((x, j) => (j === i ? { ...x, unit: e.target.value as "g" | "kg" } : x)) })}
                  className={`${inputCls(false)} min-w-0 flex-1 px-2 text-sm`}
                >
                  {(["g", "kg"] as const).map((u) => (
                    <option key={u} value={u}>
                      {perUnitLabel(t, u, product.sale_unit)}
                    </option>
                  ))}
                </select>
                <button type="button" aria-label={t("master.recipe.removeLine", { name: localName(l, lang) })} onClick={() => patch({ lines: draft.lines.filter((_, j) => j !== i) })} className="flex size-11 shrink-0 items-center justify-center rounded-md text-danger hover:bg-danger-tint">
                  <Icon name="trash" />
                </button>
              </span>
            </div>
            {errors.lines[i] && <span className="px-1 text-[13px] text-danger">{errors.lines[i]}</span>}
          </div>
        ))}
        {errors.none && <span className="text-[13px] text-danger">{errors.none}</span>}
        <label className="flex flex-col gap-2 self-start">
          <span className="sr-only">{t("master.recipe.addIngredient")}</span>
          <select
            aria-label={t("master.recipe.addIngredient")}
            value=""
            disabled={addableMaterials.length === 0}
            onChange={(e) => {
              const m = materials.find((x) => x.id === e.target.value);
              if (m) patch({ lines: [...draft.lines, { item_id: m.id, name: m.name, name_am: m.name_am, kind: m.kind, qty: "", unit: baseUnit }] });
            }}
            className="h-11 rounded-md border border-dashed border-control-border bg-surface-0 px-3 text-sm font-semibold text-brand"
          >
            <option value="">{addableMaterials.length === 0 ? t("master.recipe.noMoreMaterials") : `+ ${t("master.recipe.addIngredient")}`}</option>
            {addableMaterials.map((m) => (
              <option key={m.id} value={m.id}>
                {localName(m, lang)}
              </option>
            ))}
          </select>
        </label>
      </Card>

      <Card title={t("master.recipe.regrind")} subtitle={t("master.recipe.regrindSub")}>
        {draft.rules.length === 0 && (
          <div className="flex items-start gap-3 rounded-md bg-surface-50 px-4 py-3.5 text-sm" style={{ lineHeight: "20px" }}>
            <Icon name="ban" className="mt-0.5 shrink-0 text-ink-muted" />
            <span>
              <strong className="font-semibold">{t("master.recipe.noRegrindTitle")}</strong>
              <br />
              {t("master.recipe.noRegrindBody")}
            </span>
          </div>
        )}
        {draft.rules.map((r, i) => (
          <div key={r.source_product_id} className="flex flex-col gap-1">
            <div className="grid grid-cols-[minmax(0,1fr)] items-center gap-2 rounded-md bg-surface-50 px-4 py-3 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1.6fr)] md:gap-3">
              <span className="font-medium">{t("master.recipe.fromSource", { name: localName(r, lang) })}</span>
              <span className="flex min-w-0 items-center gap-2">
                <label className="text-[13px] text-ink-muted" htmlFor={`max-${r.source_product_id}`}>
                  {t("master.recipe.maxLabel")}
                </label>
                <input
                  id={`max-${r.source_product_id}`}
                  inputMode="decimal"
                  value={r.max}
                  placeholder={t("master.recipe.noCap")}
                  aria-invalid={errors.rules[i] ? true : undefined}
                  onChange={(e) => patch({ rules: draft.rules.map((x, j) => (j === i ? { ...x, max: e.target.value } : x)) })}
                  className={`${inputCls(Boolean(errors.rules[i]))} w-28 text-right`}
                />
                <span className="text-sm text-ink-muted">%</span>
                <button type="button" aria-label={t("master.recipe.removeSource", { name: localName(r, lang) })} onClick={() => patch({ rules: draft.rules.filter((_, j) => j !== i) })} className="ml-auto flex size-11 shrink-0 items-center justify-center rounded-md text-danger hover:bg-danger-tint">
                  <Icon name="trash" />
                </button>
              </span>
            </div>
            {errors.rules[i] && <span className="px-1 text-[13px] text-danger">{errors.rules[i]}</span>}
          </div>
        ))}
        <select
          aria-label={t("master.recipe.addSource")}
          value=""
          disabled={addableSources.length === 0}
          onChange={(e) => {
            const p = products.find((x) => x.id === e.target.value);
            if (p) patch({ rules: [...draft.rules, { source_product_id: p.id, name: p.name, name_am: p.name_am, max: "" }] });
          }}
          className="h-11 self-start rounded-md border border-dashed border-control-border bg-surface-0 px-3 text-sm font-semibold text-brand"
        >
          <option value="">{`+ ${t("master.recipe.addSource")}`}</option>
          {addableSources.map((p) => (
            <option key={p.id} value={p.id}>
              {t("master.recipe.fromSource", { name: localName(p, lang) })}
            </option>
          ))}
        </select>
      </Card>

      <Card title={t("master.recipe.tolerance")} subtitle={t("master.recipe.toleranceSub")}>
        <div className="flex flex-wrap gap-6">
          {([["warn", "master.recipe.warn"], ["crit", "master.recipe.crit"]] as const).map(([key, label]) => (
            <div key={key} className="flex flex-col gap-1.5">
              <label htmlFor={`tol-${key}`} className="text-sm font-medium">
                {t(label)}
              </label>
              <span className="flex min-w-0 items-center gap-2">
                <span className="text-ink-muted">±</span>
                <input id={`tol-${key}`} inputMode="decimal" value={draft[key]} aria-invalid={errors[key] ? true : undefined} onChange={(e) => patch({ [key]: e.target.value } as Partial<Draft>)} className={`${inputCls(Boolean(errors[key]))} w-24 text-right`} />
                <span className="text-ink-muted">%</span>
              </span>
              {errors[key] && <span className="text-[13px] text-danger">{errors[key]}</span>}
            </div>
          ))}
        </div>
        <p className="text-[13px] text-ink-muted" style={{ lineHeight: "18px" }}>
          {t("master.recipe.toleranceNote")}
        </p>
      </Card>

      <Card title={t("master.recipe.reason")}>
        <div className="flex flex-col gap-2">
          <label htmlFor="recipe-reason" className="sr-only">
            {t("master.recipe.reason")}
          </label>
          <textarea
            id="recipe-reason"
            rows={3}
            value={draft.reason}
            aria-invalid={errors.reason ? true : undefined}
            onChange={(e) => patch({ reason: e.target.value })}
            className={`w-full rounded-md border bg-surface-0 px-3.5 py-3 text-base text-ink ${errors.reason ? "border-danger" : "border-control-border"}`}
            style={{ lineHeight: "24px" }}
          />
          {errors.reason && <span className="text-[13px] text-danger">{errors.reason}</span>}
          <span className="text-[13px] text-ink-muted">{t("master.recipe.reasonHelp")}</span>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button className="flex-1 basis-56" loading={save.isPending} onClick={submit}>
            {t("master.recipe.saveAs", { version: nextVersion })}
          </Button>
          <Button variant="secondary" disabled={save.isPending} onClick={() => (dirty ? setConfirmDiscard(true) : onCancel())}>
            {t("master.cancel")}
          </Button>
        </div>
      </Card>

      {confirmDiscard && (
        <ConfirmDialog danger title={t("master.recipe.discardTitle")} confirmLabel={t("master.recipe.discard")} cancelLabel={t("master.recipe.keepEditing")} onClose={() => setConfirmDiscard(false)} onConfirm={onCancel}>
          {t("master.recipe.discardBody")}
        </ConfirmDialog>
      )}
      {viewLatest && latest && (
        <Modal title={t("master.recipe.versionTitle", { version: latest.version })} onClose={() => setViewLatest(false)}>
          <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto">
            <RecipeSections recipe={latest} productName={localName(product, lang)} />
          </div>
          <Button variant="secondary" data-autofocus onClick={() => setViewLatest(false)}>
            {t("master.close")}
          </Button>
        </Modal>
      )}
    </>
  );
}
