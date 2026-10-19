import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppShell } from "../../components/AppShell";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { Notice } from "../../components/Notice";
import { useMediaQuery } from "../../lib/useMediaQuery";
import type { User } from "../auth/api";
import { useRoles, useUsers } from "./hooks";
import { PasswordResultDialog } from "./PasswordDialogs";
import { UserList } from "./UserList";
import { UserPanel } from "./UserPanel";

type Panel = { kind: "edit"; id: string } | { kind: "add" } | null;
interface Shown {
  kind: "created" | "reset";
  name: string;
  password: string;
}

export function UsersPage({ me }: { me: User }) {
  const { t } = useTranslation();
  const users = useUsers();
  const roles = useRoles();
  const asTable = useMediaQuery("(min-width: 768px)");
  const [query, setQuery] = useState("");
  const [panel, setPanel] = useState<Panel>(null);
  const [shown, setShown] = useState<Shown | null>(null);

  const all = users.data ?? [];
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? all.filter((u) => u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)) : all;
  }, [all, query]);
  const activeCount = all.filter((u) => u.active).length;
  const editing = panel?.kind === "edit" ? all.find((u) => u.id === panel.id) : undefined;
  const loading = users.isPending || roles.isPending;
  const failed = users.isError || roles.isError;

  const addButton = (
    <Button onClick={() => setPanel({ kind: "add" })} icon={<Icon name="plus" />} disabled={!roles.data}>
      {t("users.add")}
    </Button>
  );

  return (
    <AppShell
      user={me}
      title={t("nav.users")}
      subtitle={users.data ? t("users.summary", { count: all.length, active: activeCount }) : undefined}
      actions={addButton}
    >
      <div className="flex max-w-[360px] flex-col gap-2">
        <label htmlFor="user-search" className="text-sm font-medium" style={{ lineHeight: "20px" }}>
          {t("users.search")}
        </label>
        <div className="relative flex">
          <Icon name="search" className="pointer-events-none absolute left-3.5 top-3.5 text-ink-muted" />
          <input
            id="user-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("users.searchHint")}
            className="h-control-md min-w-0 flex-1 rounded-md border border-control-border bg-surface-0 pl-11 pr-3.5 text-base"
          />
        </div>
      </div>

      {failed && (
        <Notice tone="danger" title={t("users.loadError.title")}>
          <span className="flex flex-col items-start gap-2">
            {t("users.loadError.body")}
            <Button
              variant="secondary"
              className="h-10 px-4 text-sm font-medium"
              onClick={() => {
                void users.refetch();
                void roles.refetch();
              }}
            >
              {t("users.loadError.retry")}
            </Button>
          </span>
        </Notice>
      )}

      {loading && !failed && (
        <div role="status" aria-label={t("users.loading")} className="overflow-hidden rounded-lg bg-surface-0 shadow-card">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-4 border-t border-line px-5 py-4 first:border-t-0">
              <span className="size-10 rounded-full bg-surface-100" />
              <span className="flex flex-1 flex-col gap-2">
                <span className="h-3.5 w-44 rounded-sm bg-surface-100" />
                <span className="h-3 w-60 max-w-full rounded-sm bg-surface-100" />
              </span>
              <span className="hidden h-7 w-24 rounded-full bg-surface-100 md:block" />
            </div>
          ))}
        </div>
      )}

      {users.data && roles.data && all.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-lg bg-surface-0 px-6 py-12 text-center shadow-card">
          <span className="flex size-14 items-center justify-center rounded-full bg-brand-tint text-brand">
            <Icon name="users" size={28} />
          </span>
          <h2 className="text-lg font-semibold">{t("users.empty.title")}</h2>
          <p className="max-w-[360px] text-ink-muted">{t("users.empty.body")}</p>
          {addButton}
        </div>
      )}

      {users.data && roles.data && all.length > 0 && visible.length === 0 && <p className="text-ink-muted">{t("users.noMatch", { query })}</p>}

      {users.data && roles.data && visible.length > 0 && <UserList users={visible} roles={roles.data} asTable={asTable} onEdit={(id) => setPanel({ kind: "edit", id })} />}

      {roles.data && panel && (panel.kind === "add" || editing) && (
        <UserPanel
          key={panel.kind === "edit" ? panel.id : "add"}
          user={editing}
          roles={roles.data}
          onClose={() => setPanel(null)}
          onPassword={(kind, name, password) => {
            setPanel(null);
            setShown({ kind, name, password });
          }}
        />
      )}

      {shown && <PasswordResultDialog kind={shown.kind} name={shown.name} password={shown.password} onClose={() => setShown(null)} />}
    </AppShell>
  );
}
