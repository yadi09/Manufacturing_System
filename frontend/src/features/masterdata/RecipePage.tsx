import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams, useSearchParams } from "react-router";
import { AppShell } from "../../components/AppShell";
import { Button } from "../../components/Button";
import { Chip } from "../../components/Chip";
import { Icon } from "../../components/Icon";
import { Modal } from "../../components/Modal";
import { Notice } from "../../components/Notice";
import { formatShortDate } from "../../lib/calendar/format";
import { useCalendar } from "../../lib/calendar/preference";
import type { User } from "../auth/api";
import { useMaterials, useProducts } from "./hooks";
import { localName } from "./names";
import { RecipeEditor } from "./RecipeEditor";
import { Card, RecipeSections } from "./RecipeSections";
import { useRecipe, useRecipeVersion, useRecipeVersions } from "./recipeHooks";

export function RecipePage({ me }: { me: User }) {
  const { t, i18n } = useTranslation();
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const products = useProducts();
  const materials = useMaterials();
  const recipe = useRecipe(id);
  const canManage = me.permissions.includes("masterdata.manage");
  const [calendar] = useCalendar();
  const [saved, setSaved] = useState<{ version: number; previous: number } | null>(null);
  const lang = i18n.language;

  const mode = params.get("mode");
  const copyFrom = params.get("copy");
  const copy = useRecipe(copyFrom ?? undefined);
  const product = products.data?.find((p) => p.colours.some((c) => c.id === id));
  const colour = product?.colours.find((c) => c.id === id);

  const breadcrumb = (
    <nav aria-label={t("master.breadcrumb")} className="flex flex-wrap items-center gap-1.5 text-sm text-ink-muted">
      <Link to="/products" className="font-medium text-brand hover:underline">
        {t("nav.products")}
      </Link>
      {product && colour && (
        <>
          <span aria-hidden="true">/</span>
          <Link to={`/products/${product.id}?tab=colours`} className="font-medium text-brand hover:underline">
            {localName(product, lang)}
          </Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{localName(colour, lang)}</span>
        </>
      )}
    </nav>
  );

  if (products.isPending || recipe.isPending) {
    return (
      <AppShell user={me} title={t("nav.products")} breadcrumb={breadcrumb}>
        <div role="status" aria-label={t("master.loading")} className="h-40 rounded-lg bg-surface-0 shadow-card" />
      </AppShell>
    );
  }
  if (!product || !colour) {
    return (
      <AppShell user={me} title={t("nav.products")} breadcrumb={breadcrumb}>
        <Notice tone="warning" title={products.isError ? t("master.loadError.title") : t("master.recipe.colourNotFound")}>
          <Link to="/products" className="font-medium text-brand underline">
            {t("master.products.backToList")}
          </Link>
        </Notice>
      </AppShell>
    );
  }
  if (recipe.isError) {
    return (
      <AppShell user={me} title={localName(colour, lang)} breadcrumb={breadcrumb}>
        <Notice tone="danger" title={t("master.loadError.title")}>
          <Button variant="secondary" className="h-10 px-4 text-sm font-medium" onClick={() => void recipe.refetch()}>
            {t("master.loadError.retry")}
          </Button>
        </Notice>
      </AppShell>
    );
  }

  const current = recipe.data ?? null;
  const title = t("master.recipe.title", { colour: localName(colour, lang) });
  const subtitle = t("master.recipe.for", { product: localName(product, lang) });
  const go = (next: Record<string, string>) => setParams(next, { replace: false });
  const editing = canManage && mode === "edit";
  const others = (products.data ?? []).flatMap((p) => p.colours.filter((c) => c.id !== colour.id && c.active_version !== null).map((c) => ({ id: c.id, label: `${localName(p, lang)}, ${localName(c, lang)}` })));

  let body;
  if (editing) {
    // The copied recipe is fetched first, so the form starts filled.
    if (copyFrom && copy.isPending) {
      body = <div role="status" aria-label={t("master.loading")} className="h-40 rounded-lg bg-surface-0 shadow-card" />;
    } else {
      body = (
        <RecipeEditor
          key={copyFrom ?? "own"}
          colourId={colour.id}
          product={product}
          current={current}
          start={copyFrom ? (copy.data ?? null) : null}
          materials={materials.data ?? []}
          products={products.data ?? []}
          latest={current}
          onConflict={() => void recipe.refetch()}
          onCancel={() => setParams({}, { replace: true })}
          onSaved={(r, previous) => {
            setSaved({ version: r.version, previous });
            setParams({}, { replace: true });
          }}
        />
      );
    }
  } else if (!current) {
    body = <EmptyRecipe colourName={localName(colour, lang)} canManage={canManage} others={others} onStart={(copyId) => go(copyId ? { mode: "edit", copy: copyId } : { mode: "edit" })} />;
  } else if (mode === "history") {
    body = <History colourId={colour.id} productName={localName(product, lang)} onBack={() => setParams({}, { replace: true })} calendar={calendar} />;
  } else {
    body = (
      <>
        {saved && (
          <Notice tone="info" icon="check" title={t("master.recipe.saved", { version: saved.version })}>
            {saved.previous > 0 ? t("master.recipe.savedBody", { previous: saved.previous }) : t("master.recipe.savedFirst")}
          </Notice>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Chip tone="active" icon="check">
            {t("master.recipe.versionInUse", { version: current.version })}
          </Chip>
          <span className="text-sm text-ink-muted">{t("master.recipe.activeSince", { date: formatShortDate(t, new Date(current.created_at), calendar), by: current.created_by })}</span>
          <span className="flex gap-2 md:ml-auto">
            <Button variant="secondary" className="h-11 px-4 text-sm font-medium" onClick={() => go({ mode: "history" })}>
              {t("master.recipe.history")}
            </Button>
            {canManage && (
              <Button className="h-11 px-4 text-sm" onClick={() => go({ mode: "edit" })}>
                {t("master.recipe.editNew")}
              </Button>
            )}
          </span>
        </div>
        <RecipeSections recipe={current} productName={localName(product, lang)} />
      </>
    );
  }

  return (
    <AppShell user={me} title={title} subtitle={subtitle} breadcrumb={breadcrumb}>
      {body}
    </AppShell>
  );
}

function EmptyRecipe({ colourName, canManage, others, onStart }: { colourName: string; canManage: boolean; others: Array<{ id: string; label: string }>; onStart: (copyId?: string) => void }) {
  const { t } = useTranslation();
  const [from, setFrom] = useState(others[0]?.id ?? "");
  return (
    <div className="flex flex-col items-center gap-4 rounded-lg bg-surface-0 px-6 py-10 text-center shadow-card">
      <span className="flex size-14 items-center justify-center rounded-full bg-brand-tint text-brand">
        <Icon name="box" size={28} />
      </span>
      <h2 className="text-lg font-semibold">{t("master.recipe.emptyTitle", { colour: colourName })}</h2>
      <p className="max-w-[340px] text-ink-muted">{t("master.recipe.emptyBody")}</p>
      {canManage ? (
        <div className="flex w-full max-w-[340px] flex-col gap-2 text-left">
          {others.length > 0 && (
            <>
              <label htmlFor="copy-from" className="text-sm font-medium">
                {t("master.recipe.copyFrom")}
              </label>
              <select id="copy-from" value={from} onChange={(e) => setFrom(e.target.value)} className="h-12 rounded-md border border-control-border bg-surface-0 px-3 text-base">
                {others.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
              <Button onClick={() => onStart(from)}>{t("master.recipe.copyAndEdit")}</Button>
            </>
          )}
          <Button variant="secondary" onClick={() => onStart()}>
            {t("master.recipe.startEmpty")}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-ink-muted">{t("master.recipe.readerEmpty")}</p>
      )}
    </div>
  );
}

function History({ colourId, productName, onBack, calendar }: { colourId: string; productName: string; onBack: () => void; calendar: "ethiopian" | "gregorian" }) {
  const { t } = useTranslation();
  const versions = useRecipeVersions(colourId);
  const [open, setOpen] = useState<number | null>(null);
  const shown = useRecipeVersion(colourId, open);
  const date = (iso: string) => formatShortDate(t, new Date(iso), calendar);
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-lg font-semibold">{t("master.recipe.historyTitle")}</h2>
          <p className="text-sm text-ink-muted">{t("master.recipe.historyNote")}</p>
        </div>
        <Button variant="secondary" className="h-11 px-4 text-sm font-medium" onClick={onBack}>
          {t("master.recipe.backToRecipe")}
        </Button>
      </div>
      {versions.isPending && <div role="status" aria-label={t("master.loading")} className="h-24 rounded-lg bg-surface-0 shadow-card" />}
      {versions.isError && <Notice tone="danger" title={t("master.loadError.title")} />}
      {versions.data?.map((v) => (
        <div key={v.version} className="grid items-start gap-2 rounded-lg bg-surface-0 px-5 py-4 shadow-card md:grid-cols-[150px_minmax(0,1.4fr)_minmax(0,2fr)_100px] md:gap-4">
          <span className="flex flex-col items-start gap-1.5">
            <span className="font-semibold">{t("master.recipe.versionLabel", { version: v.version })}</span>
            <Chip tone={v.status === "active" ? "active" : "off"}>{t(v.status === "active" ? "master.recipe.statusActive" : "master.recipe.statusReplaced")}</Chip>
          </span>
          <span className="text-sm text-ink-muted">{v.replaced_at ? t("master.recipe.periodRange", { from: date(v.created_at), to: date(v.replaced_at) }) : t("master.recipe.periodNow", { from: date(v.created_at) })}</span>
          <span className="text-sm" style={{ lineHeight: "20px" }}>
            <span className="text-ink-muted">{v.created_by}</span>
            <br />
            {v.reason}
          </span>
          <Button variant="secondary" className="h-11 px-3.5 text-sm font-medium" onClick={() => setOpen(v.version)} aria-label={t("master.recipe.viewVersionN", { version: v.version })}>
            {t("master.recipe.view")}
          </Button>
        </div>
      ))}
      {open !== null && (
        <Modal title={t("master.recipe.versionTitle", { version: open })} onClose={() => setOpen(null)}>
          <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto">
            {shown.isPending && <div role="status" aria-label={t("master.loading")} className="h-24 rounded-lg bg-surface-50" />}
            {shown.data && <RecipeSections recipe={shown.data} productName={productName} />}
          </div>
          <Button variant="secondary" data-autofocus onClick={() => setOpen(null)}>
            {t("master.close")}
          </Button>
        </Modal>
      )}
    </section>
  );
}

export { Card };
