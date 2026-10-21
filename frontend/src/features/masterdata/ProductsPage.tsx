import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { AppShell } from "../../components/AppShell";
import { Button } from "../../components/Button";
import { Chip } from "../../components/Chip";
import { Icon } from "../../components/Icon";
import { Notice } from "../../components/Notice";
import type { User } from "../auth/api";
import { AddProductPanel } from "./AddProductPanel";
import { trimDecimal } from "./format";
import { useProducts } from "./hooks";
import { localName, otherLang, otherName } from "./names";

const COLUMNS = "md:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.6fr)_120px]";

export function ProductsPage({ me }: { me: User }) {
  const { t, i18n } = useTranslation();
  const products = useProducts();
  const navigate = useNavigate();
  const canManage = me.permissions.includes("masterdata.manage");
  const [adding, setAdding] = useState(false);
  const lang = i18n.language;
  const all = products.data ?? [];
  const colourCount = all.reduce((n, p) => n + p.colours.length, 0);

  return (
    <AppShell
      user={me}
      title={t("nav.products")}
      subtitle={products.data ? `${t("master.products.countProducts", { count: all.length })} · ${t("master.products.countColours", { count: colourCount })}` : undefined}
      actions={canManage && <Button onClick={() => setAdding(true)} icon={<Icon name="plus" />}>{t("master.products.add")}</Button>}
    >
      {products.isError && (
        <Notice tone="danger" title={t("master.loadError.title")}>
          <span className="flex flex-col items-start gap-2">
            {t("master.loadError.body")}
            <Button variant="secondary" className="h-10 px-4 text-sm font-medium" onClick={() => void products.refetch()}>
              {t("master.loadError.retry")}
            </Button>
          </span>
        </Notice>
      )}
      {products.isPending && <div role="status" aria-label={t("master.loading")} className="h-40 rounded-lg bg-surface-0 shadow-card" />}

      {products.data && all.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-lg bg-surface-0 px-6 py-12 text-center shadow-card">
          <h2 className="text-lg font-semibold">{t("master.products.emptyTitle")}</h2>
          <p className="max-w-[320px] text-ink-muted">{t("master.products.emptyBody")}</p>
          {canManage && <Button onClick={() => setAdding(true)}>{t("master.products.add")}</Button>}
        </div>
      )}

      {all.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className={`hidden gap-4 px-5 text-[13px] font-medium text-ink-muted md:grid ${COLUMNS}`}>
            <span>{t("master.products.col.product")}</span>
            <span>{t("master.products.col.soldBy")}</span>
            <span>{t("master.products.col.package")}</span>
            <span>{t("master.products.col.colours")}</span>
            <span>{t("master.products.col.status")}</span>
          </div>
          {all.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-label={t("master.products.openFor", { name: localName(p, lang) })}
              onClick={() => navigate(`/products/${p.id}`)}
              className={`grid w-full items-center gap-1.5 rounded-lg bg-surface-0 px-5 py-4 text-left shadow-card md:gap-4 ${COLUMNS}`}
            >
              <span className="flex min-w-0 flex-col">
                <span className={`text-lg font-semibold ${p.active ? "" : "text-ink-muted"}`} style={{ lineHeight: "26px" }}>
                  {localName(p, lang)}
                </span>
                <span lang={otherLang(lang)} className="text-[13px] text-ink-muted" style={{ lineHeight: "20px" }}>
                  {otherName(p, lang)}
                </span>
              </span>
              <span>{t(`master.units.${p.sale_unit}Cap`)}</span>
              <span className="tabular">{t(p.sale_unit === "piece" ? "master.products.packagePieces" : "master.products.packageKg", { qty: trimDecimal(p.package_qty) })}</span>
              <span className="flex flex-wrap gap-1.5">
                {p.colours.length === 0 && <span className="text-sm text-ink-muted">{t("master.products.noColours")}</span>}
                {p.colours.map((c) => (
                  <Chip key={c.id}>{localName(c, lang)}</Chip>
                ))}
              </span>
              <span>
                {p.active ? (
                  <Chip tone="active" icon="check">
                    {t("master.activeChip")}
                  </Chip>
                ) : (
                  <Chip tone="off" icon="ban">
                    {t("master.retiredChip")}
                  </Chip>
                )}
              </span>
            </button>
          ))}
        </div>
      )}

      {adding && (
        <AddProductPanel
          onClose={() => setAdding(false)}
          onCreated={(p) => {
            setAdding(false);
            navigate(`/products/${p.id}?tab=colours`);
          }}
        />
      )}
    </AppShell>
  );
}
