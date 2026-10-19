import { useTranslation } from "react-i18next";
import { Avatar } from "../../components/Avatar";
import { Chip } from "../../components/Chip";
import { Icon } from "../../components/Icon";
import type { RoleInfo, UserSummary } from "./api";
import { roleName } from "./roleText";

interface Props {
  users: UserSummary[];
  roles: RoleInfo[];
  /** Cards on a phone, a table from 768px. */
  asTable: boolean;
  onEdit: (id: string) => void;
}

function useRoleNames(roles: RoleInfo[]) {
  const { i18n } = useTranslation();
  const byKey = new Map(roles.map((r) => [r.key, r]));
  return (keys: string[]) => keys.map((k) => (byKey.get(k) ? roleName(byKey.get(k)!, i18n.language) : k));
}

function StatusChip({ active }: { active: boolean }) {
  const { t } = useTranslation();
  return active ? (
    <Chip tone="active" icon="check">
      {t("users.status.active")}
    </Chip>
  ) : (
    <Chip tone="off" icon="ban">
      {t("users.status.off")}
    </Chip>
  );
}

function RoleChips({ names }: { names: string[] }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      {names.map((n) => (
        <Chip key={n}>{n}</Chip>
      ))}
    </span>
  );
}

export function UserList({ users, roles, asTable, onEdit }: Props) {
  const { t } = useTranslation();
  const names = useRoleNames(roles);

  if (!asTable) {
    return (
      <ul className="flex flex-col gap-3">
        {users.map((u) => (
          <li key={u.id}>
            <button
              type="button"
              onClick={() => onEdit(u.id)}
              aria-label={t("users.editFor", { name: u.full_name })}
              className="flex w-full flex-col gap-3 rounded-lg bg-surface-0 p-4 text-left shadow-card"
            >
              <span className="flex w-full items-center gap-3">
                <Avatar name={u.full_name} size={44} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className={`font-semibold ${u.active ? "" : "text-ink-muted"}`}>{u.full_name}</span>
                  <span className="break-words text-[13px] text-ink-muted" style={{ lineHeight: "18px" }}>
                    {u.email}
                  </span>
                </span>
                <Icon name="chevron" className="shrink-0 text-ink-muted" />
              </span>
              <span className="flex flex-wrap items-center gap-1.5">
                <StatusChip active={u.active} />
                <RoleChips names={names(u.roles)} />
              </span>
            </button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg bg-surface-0 shadow-card">
      <table className="w-full border-collapse text-sm" style={{ lineHeight: "20px" }}>
        <thead>
          <tr className="bg-surface-100 text-left text-ink-muted">
            <th scope="col" className="px-5 py-3 font-medium">
              {t("users.col.name")}
            </th>
            <th scope="col" className="px-5 py-3 font-medium">
              {t("users.col.roles")}
            </th>
            <th scope="col" className="px-5 py-3 font-medium">
              {t("users.col.status")}
            </th>
            <th scope="col" className="w-24 px-5 py-3">
              <span className="sr-only">{t("users.col.actions")}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-t border-line">
              <th scope="row" className="px-5 py-3 text-left font-normal">
                <span className="flex items-center gap-3">
                  <Avatar name={u.full_name} />
                  <span className="flex min-w-0 flex-col">
                    <span className={`text-base font-medium ${u.active ? "" : "text-ink-muted"}`} style={{ lineHeight: "24px" }}>
                      {u.full_name}
                    </span>
                    <span className="break-words text-[13px] text-ink-muted" style={{ lineHeight: "18px" }}>
                      {u.email}
                    </span>
                  </span>
                </span>
              </th>
              <td className="px-5 py-3">
                <RoleChips names={names(u.roles)} />
              </td>
              <td className="px-5 py-3">
                <StatusChip active={u.active} />
              </td>
              <td className="px-5 py-2 text-right">
                <button
                  type="button"
                  onClick={() => onEdit(u.id)}
                  aria-label={t("users.editFor", { name: u.full_name })}
                  className="h-11 rounded-md px-3.5 font-semibold text-brand hover:bg-brand-tint"
                >
                  {t("users.edit")}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
