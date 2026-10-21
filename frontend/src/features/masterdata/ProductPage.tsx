import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams, useSearchParams } from "react-router";
import { AppShell } from "../../components/AppShell";
import { Button } from "../../components/Button";
import { Chip } from "../../components/Chip";
import { Choice } from "../../components/Choice";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Icon } from "../../components/Icon";
import { Notice } from "../../components/Notice";
import { Tabs } from "../../components/Tabs";
import { TextField } from "../../components/TextField";
import type { User } from "../auth/api";
import type { Colour, Product } from "./api";
import { ColourPanel } from "./ColourPanel";
import { masterErrorKey } from "./errors";
import { isPositiveDecimal, trimDecimal } from "./format";
import { useProducts, useUpdateProduct } from "./hooks";
import { localName, otherLang, otherName } from "./names";

export function ProductPage({ me }: { me: User }) {
  const { t, i18n } = useTranslation();
  const { id } = useParams();
  const products = useProducts();
  const [params, setParams] = useSearchParams();
  const canManage = me.permissions.includes("masterdata.manage");
  const [colourPanel, setColourPanel] = useState<{ colour?: Colour } | null>(null);
  const lang = i18n.language;
  const product = products.data?.find((p) => p.id === id);
  const tab = params.get("tab") === "colours" ? "colours" : "details";

  const breadcrumb = (
    <nav aria-label={t("master.breadcrumb")} className="flex flex-wrap items-center gap-1.5 text-sm text-ink-muted">
      <Link to="/products" className="font-medium text-brand hover:underline">
        {t("nav.products")}
      </Link>
      {product && (
        <>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{localName(product, lang)}</span>
        </>
      )}
    </nav>
  );

  if (products.isPending) return <AppShell user={me} title={t("nav.products")} breadcrumb={breadcrumb}><div role="status" aria-label={t("master.loading")} className="h-40 rounded-lg bg-surface-0 shadow-card" /></AppShell>;
  if (!product) {
    return (
      <AppShell user={me} title={t("nav.products")} breadcrumb={breadcrumb}>
        <Notice tone="warning" title={products.isError ? t("master.loadError.title") : t("master.products.notFound")}>
          <Link to="/products" className="font-medium text-brand underline">
            {t("master.products.backToList")}
          </Link>
        </Notice>
      </AppShell>
    );
  }

  return (
    <AppShell
      user={me}
      title={localName(product, lang)}
      subtitle={`${t(product.sale_unit === "piece" ? "master.products.packagePieces" : "master.products.packageKg", { qty: trimDecimal(product.package_qty) })} · ${t(`master.units.${product.sale_unit}Cap`)}`}
      breadcrumb={breadcrumb}
      actions={tab === "colours" && canManage && <Button onClick={() => setColourPanel({})} icon={<Icon name="plus" />}>{t("master.colours.add")}</Button>}
    >
      <Tabs
        label={t("master.products.tabs")}
        active={tab}
        onChange={(k) => setParams(k === "colours" ? { tab: "colours" } : {}, { replace: true })}
        tabs={[
          { key: "details", label: t("master.products.tabDetails") },
          { key: "colours", label: `${t("master.products.tabColours")} · ${product.colours.length}` },
        ]}
      />
      {tab === "details" ? (
        <div role="tabpanel" id="panel-details" aria-labelledby="tab-details">
          <DetailsForm key={product.id} product={product} canManage={canManage} />
        </div>
      ) : (
        <div role="tabpanel" id="panel-colours" aria-labelledby="tab-colours">
          <ColoursList product={product} canManage={canManage} onRename={(c) => setColourPanel({ colour: c })} />
        </div>
      )}
      {colourPanel && <ColourPanel key={colourPanel.colour?.id ?? "new"} product={product} colour={colourPanel.colour} onClose={() => setColourPanel(null)} />}
    </AppShell>
  );
}

function DetailsForm({ product, canManage }: { product: Product; canManage: boolean }) {
  const { t } = useTranslation();
  const update = useUpdateProduct();
  const [name, setName] = useState(product.name);
  const [nameAm, setNameAm] = useState(product.name_am);
  const [unit, setUnit] = useState(product.sale_unit);
  const [pkg, setPkg] = useState(trimDecimal(product.package_qty));
  const [weight, setWeight] = useState(trimDecimal(product.weight_per_piece_g));
  const [errors, setErrors] = useState<{ name?: string; nameAm?: string; pkg?: string; weight?: string }>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmRetire, setConfirmRetire] = useState(false);

  // The unit decides how every quantity is counted, so it is fixed once any colour has a recipe.
  const unitLocked = product.colours.some((c) => c.active_version !== null);
  const dirty = name.trim() !== product.name || nameAm.trim() !== product.name_am || unit !== product.sale_unit || pkg.trim() !== trimDecimal(product.package_qty) || weight.trim() !== trimDecimal(product.weight_per_piece_g);

  function reset() {
    setName(product.name);
    setNameAm(product.name_am);
    setUnit(product.sale_unit);
    setPkg(trimDecimal(product.package_qty));
    setWeight(trimDecimal(product.weight_per_piece_g));
    setErrors({});
    setProblem(null);
  }

  function send(active: boolean, onDone?: () => void) {
    update.mutate(
      { id: product.id, name: name.trim(), name_am: nameAm.trim(), sale_unit: unit, package_qty: pkg.trim(), weight_per_piece_g: weight.trim() || null, active },
      {
        onSuccess: (p) => {
          // Show exactly what the server kept (for example "30.000" as "30"), and keep the confirmation visible.
          setName(p.name);
          setNameAm(p.name_am);
          setUnit(p.sale_unit);
          setPkg(trimDecimal(p.package_qty));
          setWeight(trimDecimal(p.weight_per_piece_g));
          setSaved(true);
          onDone?.();
        },
        onError: (err) => {
          setConfirmRetire(false);
          const key = masterErrorKey(err);
          if (key === "duplicateName") setErrors({ name: t("master.errors.duplicateName") });
          else if (key === "invalidQuantity") setErrors({ pkg: t("master.errors.invalidQuantity") });
          else setProblem(key);
        },
      },
    );
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setSaved(false);
    setProblem(null);
    const next: typeof errors = {};
    if (!name.trim()) next.name = t("master.errors.nameRequired");
    if (!nameAm.trim()) next.nameAm = t("master.errors.nameAmRequired");
    if (!isPositiveDecimal(pkg, 3)) next.pkg = t(unit === "piece" ? "master.products.packageNeededPieces" : "master.products.packageNeededKg");
    if (weight.trim() && !isPositiveDecimal(weight, 3)) next.weight = t("master.errors.invalidQuantity");
    setErrors(next);
    if (Object.keys(next).length) return;
    send(product.active);
  }

  const ro = !canManage;
  return (
    <form onSubmit={submit} noValidate className="flex max-w-[720px] flex-col gap-5 rounded-lg bg-surface-0 p-6 shadow-card">
      {saved && !dirty && (
        <Notice tone="info" icon="check" title={t("master.products.saved")} />
      )}
      {problem && (
        <Notice tone="danger" title={t("master.errors.title")}>
          {t(`master.errors.${problem}`)}
        </Notice>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <TextField label={t("master.nameEn")} value={name} onChange={(e) => setName(e.target.value)} readOnly={ro} autoComplete="off" error={errors.name} />
        <TextField label={t("master.nameAm")} lang="am" value={nameAm} onChange={(e) => setNameAm(e.target.value)} readOnly={ro} autoComplete="off" error={errors.nameAm} />
      </div>

      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="p-0 text-sm font-medium">{t("master.products.soldBy")}</legend>
        {unitLocked || ro ? (
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <span className="inline-flex h-12 items-center rounded-md border border-line bg-surface-50 px-4 text-ink-muted">{t(`master.units.${product.sale_unit}Cap`)}</span>
            <span className="flex-1 basis-60 text-[13px] text-ink-muted" style={{ lineHeight: "18px" }}>
              {t("master.products.soldByLocked")}
            </span>
          </div>
        ) : (
          <>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(["piece", "kg"] as const).map((u) => (
                <Choice key={u} name="sale_unit" checked={unit === u} onChange={() => setUnit(u)}>
                  <span>{t(`master.units.${u}`)}</span>
                </Choice>
              ))}
            </div>
            <span className="text-[13px] text-ink-muted">{t("master.products.soldByHelp")}</span>
          </>
        )}
      </fieldset>

      <div className="grid gap-4 md:grid-cols-2">
        <TextField
          label={t("master.products.package")}
          inputMode="decimal"
          value={pkg}
          onChange={(e) => setPkg(e.target.value)}
          readOnly={ro}
          error={errors.pkg}
          trailing={<span className="flex items-center px-3 text-sm text-ink-muted">{t(unit === "piece" ? "master.units.pieces" : "master.units.kgPerBag")}</span>}
        />
        <TextField
          label={`${t("master.products.weight")} (${t("master.optional")})`}
          inputMode="decimal"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          readOnly={ro}
          placeholder="—"
          error={errors.weight}
          trailing={<span className="flex items-center px-3 text-sm text-ink-muted">g</span>}
        />
      </div>
      <p className="text-[13px] text-ink-muted" style={{ lineHeight: "18px" }}>
        {t("master.products.weightHelp")}
      </p>

      {canManage && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
          <div className="flex flex-1 basis-64 gap-3">
            <Button type="submit" className="flex-1" loading={update.isPending && !confirmRetire} disabled={!dirty}>
              {t("master.save")}
            </Button>
            <Button type="button" variant="secondary" onClick={reset} disabled={!dirty || update.isPending}>
              {t("master.cancel")}
            </Button>
          </div>
          {product.active ? (
            <Button type="button" variant="secondary" className="border-danger text-danger" onClick={() => setConfirmRetire(true)} disabled={update.isPending}>
              {t("master.products.retire")}
            </Button>
          ) : (
            <Button type="button" variant="secondary" loading={update.isPending} onClick={() => send(true)}>
              {t("master.reactivate")}
            </Button>
          )}
        </div>
      )}
      {!product.active && (
        <Chip tone="off" icon="ban">
          {t("master.products.retiredNote")}
        </Chip>
      )}
      {confirmRetire && (
        <ConfirmDialog
          danger
          title={t("master.products.retireTitle", { name: product.name })}
          confirmLabel={t("master.products.retire")}
          cancelLabel={t("master.cancel")}
          pending={update.isPending}
          onClose={() => setConfirmRetire(false)}
          onConfirm={() => send(false, () => setConfirmRetire(false))}
        >
          {t("master.products.retireBody")}
        </ConfirmDialog>
      )}
    </form>
  );
}

function ColoursList({ product, canManage, onRename }: { product: Product; canManage: boolean; onRename: (c: Colour) => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  if (product.colours.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg bg-surface-0 px-6 py-10 text-center shadow-card">
        <h2 className="text-lg font-semibold">{t("master.colours.emptyTitle")}</h2>
        <p className="max-w-[360px] text-ink-muted">{t("master.colours.emptyBody")}</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {product.colours.map((c) => (
        <div key={c.id} className="grid items-center gap-2 rounded-lg bg-surface-0 px-5 py-4 shadow-card md:grid-cols-[minmax(0,2fr)_minmax(0,1.6fr)_auto] md:gap-4">
          <span className="flex min-w-0 flex-col">
            <span className={`text-lg font-semibold ${c.active ? "" : "text-ink-muted"}`} style={{ lineHeight: "26px" }}>
              {localName(c, lang)}
            </span>
            <span lang={otherLang(lang)} className="text-[13px] text-ink-muted" style={{ lineHeight: "20px" }}>
              {otherName(c, lang)}
            </span>
          </span>
          <span className="flex flex-wrap gap-2">
            {c.active_version !== null ? (
              <Chip tone="active" icon="check">
                {t("master.colours.recipeInUse", { version: c.active_version })}
              </Chip>
            ) : (
              <Chip tone="off" icon="ban">
                {t("master.colours.noRecipe")}
              </Chip>
            )}
            {!c.active && (
              <Chip tone="off" icon="ban">
                {t("master.retiredChip")}
              </Chip>
            )}
          </span>
          {canManage && (
            <span className="flex gap-2 md:justify-end">
              <Button variant="secondary" className="h-11 px-3.5 text-sm font-medium" onClick={() => onRename(c)} aria-label={t("master.colours.renameFor", { name: localName(c, lang) })}>
                {t("master.colours.rename")}
              </Button>
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
