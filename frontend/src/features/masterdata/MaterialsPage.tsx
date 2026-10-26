import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AppShell } from "../../components/AppShell";
import { Button } from "../../components/Button";
import { Chip } from "../../components/Chip";
import { Icon } from "../../components/Icon";
import { Notice } from "../../components/Notice";
import type { User } from "../auth/api";
import type { Material } from "./api";
import { trimDecimal } from "./format";
import { useMaterials } from "./hooks";
import { MaterialPanel } from "./MaterialPanel";
import { localName, otherLang, otherName } from "./names";

const COLUMNS = "md:grid-cols-[minmax(0,2.4fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.4fr)]";

export function MaterialsPage({ me }: { me: User }) {
  const { t, i18n } = useTranslation();
  const materials = useMaterials();
  const canManage = me.permissions.includes("masterdata.manage");
  const [panel, setPanel] = useState<{ material?: Material } | null>(null);
  const lang = i18n.language;
  const all = materials.data ?? [];

  return (
    <AppShell
      user={me}
      title={t("nav.materials")}
      subtitle={materials.data ? t("master.materials.count", { count: all.length }) : undefined}
      actions={canManage && <Button onClick={() => setPanel({})} icon={<Icon name="plus" />}>{t("master.materials.add")}</Button>}
    >
      <p className="max-w-[640px] text-sm text-ink-muted">{t("master.materials.intro")}</p>

      {materials.isError && (
        <Notice tone="danger" title={t("master.loadError.title")}>
          <span className="flex flex-col items-start gap-2">
            {t("master.loadError.body")}
            <Button variant="secondary" className="h-10 px-4 text-sm font-medium" onClick={() => void materials.refetch()}>
              {t("master.loadError.retry")}
            </Button>
          </span>
        </Notice>
      )}
      {materials.isPending && <div role="status" aria-label={t("master.loading")} className="h-40 rounded-lg bg-surface-0 shadow-card" />}

      {materials.data && all.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-lg bg-surface-0 px-6 py-12 text-center shadow-card">
          <h2 className="text-lg font-semibold">{t("master.materials.emptyTitle")}</h2>
          <p className="max-w-[360px] text-ink-muted">{t("master.materials.emptyBody")}</p>
        </div>
      )}

      {all.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className={`hidden gap-4 px-5 text-[13px] font-medium text-ink-muted md:grid ${COLUMNS}`}>
            <span>{t("master.materials.col.material")}</span>
            <span>{t("master.materials.col.kind")}</span>
            <span>{t("master.materials.col.bag")}</span>
            <span>{t("master.materials.col.usedIn")}</span>
          </div>
          {all.map((m) => {
            const content = (
              <>
                <span className="flex min-w-0 flex-col">
                  <span className={`font-semibold ${m.active ? "" : "text-ink-muted"}`}>{localName(m, lang)}</span>
                  <span lang={otherLang(lang)} className="text-[13px] text-ink-muted" style={{ lineHeight: "20px" }}>
                    {otherName(m, lang)}
                  </span>
                </span>
                <span>
                  <Chip>{t(`master.materials.kinds.${m.kind}`)}</Chip>
                </span>
                <span className="tabular">{m.bag_qty ? `${trimDecimal(m.bag_qty)} ${m.unit}` : "—"}</span>
                <span className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
                  {m.used_in > 0 ? t("master.materials.usedIn", { count: m.used_in }) : t("master.materials.unused")}
                  {!m.active && (
                    <Chip tone="off" icon="ban">
                      {t("master.retiredChip")}
                    </Chip>
                  )}
                </span>
              </>
            );
            const cls = `grid w-full items-center gap-1.5 rounded-lg bg-surface-0 px-5 py-4 text-left shadow-card md:gap-4 ${COLUMNS}`;
            return canManage ? (
              <button key={m.id} type="button" className={cls} aria-label={t("master.materials.openFor", { name: localName(m, lang) })} onClick={() => setPanel({ material: m })}>
                {content}
              </button>
            ) : (
              <div key={m.id} className={cls}>
                {content}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex max-w-[720px] items-start gap-3 rounded-md bg-brand-tint px-3.5 py-3 text-sm" style={{ lineHeight: "20px" }}>
        <Icon name="info" className="mt-0.5 shrink-0 text-brand" />
        <span>{t("master.materials.autoItems")}</span>
      </div>

      {panel && <MaterialPanel key={panel.material?.id ?? "new"} material={panel.material} onClose={() => setPanel(null)} />}
    </AppShell>
  );
}
