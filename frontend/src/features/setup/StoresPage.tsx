import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AppShell } from "../../components/AppShell";
import { Chip } from "../../components/Chip";
import type { User } from "../auth/api";
import { localName } from "../masterdata/names";
import type { Location } from "./api";
import { useLocations, useRenameLocation } from "./hooks";
import { NamePanel } from "./NamePanel";
import { InfoLine, ListState, Names, Row } from "./Shared";

const COLUMNS = "md:grid-cols-[minmax(0,1.3fr)_150px_minmax(0,2fr)]";

export function StoresPage({ me }: { me: User }) {
  const { t, i18n } = useTranslation();
  const locations = useLocations();
  const rename = useRenameLocation();
  const canManage = me.permissions.includes("masterdata.manage");
  const [editing, setEditing] = useState<Location | null>(null);
  const all = locations.data ?? [];

  return (
    <AppShell user={me} title={t("nav.stores")} subtitle={t("setup.stores.intro")}>
      <InfoLine>{t("setup.stores.fixed")}</InfoLine>
      <ListState query={locations} empty={false} emptyTitle="" emptyBody="" />
      <div className="flex flex-col gap-3">
        {all.map((l) => (
          <Row key={l.key} columns={COLUMNS} label={t("setup.renameFor", { name: localName(l, i18n.language) })} onOpen={canManage ? () => setEditing(l) : undefined}>
            <Names item={l} />
            <span>
              {l.holds_stock ? (
                <Chip tone="active" icon="check">
                  {t("setup.stores.holdsStock")}
                </Chip>
              ) : (
                <Chip tone="neutral">{t("setup.stores.notStock")}</Chip>
              )}
            </span>
            <span className="flex flex-col text-sm" style={{ lineHeight: "20px" }}>
              <span>{t(`setup.stores.what.${l.key}`)}</span>
              <span className="text-[13px] text-ink-muted">{t(`setup.stores.rule.${l.key}`)}</span>
            </span>
          </Row>
        ))}
      </div>
      {editing && (
        <NamePanel
          title={t("setup.stores.rename")}
          submitLabel={t("master.save")}
          item={editing}
          pending={rename.isPending}
          onClose={() => setEditing(null)}
          save={(v, done) => rename.mutate({ key: editing.key, name: v.name, name_am: v.name_am }, done)}
        />
      )}
    </AppShell>
  );
}
