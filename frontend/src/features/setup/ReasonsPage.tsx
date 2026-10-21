import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { AppShell } from "../../components/AppShell";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { Tabs } from "../../components/Tabs";
import type { User } from "../auth/api";
import { localName } from "../masterdata/names";
import type { Reason } from "./api";
import { useCreateReason, useReasons, useUpdateReason } from "./hooks";
import { NamePanel } from "./NamePanel";
import { InfoLine, ListState, Names, Row, StatusChip } from "./Shared";

const COLUMNS = "md:grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)_110px]";

export function ReasonsPage({ me }: { me: User }) {
  const { t, i18n } = useTranslation();
  const reasons = useReasons();
  const create = useCreateReason();
  const update = useUpdateReason();
  const [params, setParams] = useSearchParams();
  const kind: Reason["kind"] = params.get("tab") === "downtime" ? "downtime" : "damage";
  const canManage = me.permissions.includes("masterdata.manage");
  const [panel, setPanel] = useState<{ reason?: Reason } | null>(null);
  const all = reasons.data ?? [];
  const shown = all.filter((r) => r.kind === kind);
  const count = (k: Reason["kind"]) => all.filter((r) => r.kind === k && r.active).length;

  return (
    <AppShell
      user={me}
      title={t("nav.reasons")}
      subtitle={t("setup.reasons.intro")}
      actions={canManage && <Button onClick={() => setPanel({})} icon={<Icon name="plus" />}>{t(`setup.reasons.add.${kind}`)}</Button>}
    >
      <Tabs
        label={t("nav.reasons")}
        active={kind}
        onChange={(k) => setParams(k === "damage" ? {} : { tab: k }, { replace: true })}
        tabs={(["damage", "downtime"] as const).map((k) => ({ key: k, label: `${t(`setup.reasons.kinds.${k}`)} (${count(k)})` }))}
      />
      <div role="tabpanel" id={`panel-${kind}`} aria-labelledby={`tab-${kind}`} className="flex flex-col gap-3">
        <ListState query={reasons} empty={reasons.isSuccess && shown.length === 0} emptyTitle={t(`setup.reasons.empty.${kind}`)} emptyBody={t("setup.reasons.emptyBody")} />
        {shown.map((r) => (
          <Row key={r.id} columns={COLUMNS} label={t("setup.renameFor", { name: localName(r, i18n.language) })} onOpen={canManage ? () => setPanel({ reason: r }) : undefined}>
            <Names item={r} active={r.active} />
            <span className="text-sm text-ink-muted">{t(`setup.reasons.kinds.${r.kind}`)}</span>
            <span>
              <StatusChip active={r.active} />
            </span>
          </Row>
        ))}
        <InfoLine>{t("setup.reasons.retireNote")}</InfoLine>
      </div>
      {panel && (
        <NamePanel
          key={panel.reason?.id ?? "new"}
          title={panel.reason ? t("setup.reasons.edit") : t(`setup.reasons.add.${kind}`)}
          submitLabel={panel.reason ? t("master.save") : t(`setup.reasons.add.${kind}`)}
          item={panel.reason}
          pending={create.isPending || update.isPending}
          onClose={() => setPanel(null)}
          retireTitle={panel.reason && t("setup.retireTitle", { name: localName(panel.reason, i18n.language) })}
          retireBody={t("setup.reasons.retireBody")}
          save={(v, done) => (panel.reason ? update.mutate({ id: panel.reason.id, ...v, active: v.active ?? panel.reason.active }, done) : create.mutate({ kind, ...v }, done))}
        />
      )}
    </AppShell>
  );
}
