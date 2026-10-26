import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { NavLink } from "react-router";
import type { User } from "../features/auth/api";
import { useLogout } from "../features/auth/useSession";
import { useMediaQuery } from "../lib/useMediaQuery";
import { Avatar } from "./Avatar";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";
import { LanguageSwitch } from "./LanguageSwitch";
import { Modal } from "./Modal";

interface NavItem {
  to: string;
  labelKey: string;
  icon: IconName;
  /** A small heading shown above the first item of a group. */
  groupKey?: string;
  /** Shown only to people whose roles grant this permission. No fake items: add one when its screen exists. */
  permission?: string;
  /** Starts a new group without a heading. */
  separate?: boolean;
}

const NAV: NavItem[] = [
  { to: "/products", labelKey: "nav.products", icon: "box", permission: "masterdata.read", groupKey: "nav.masterData" },
  { to: "/materials", labelKey: "nav.materials", icon: "layers", permission: "masterdata.read" },
  { to: "/machines", labelKey: "nav.machines", icon: "factory", permission: "masterdata.read" },
  { to: "/shifts", labelKey: "nav.shifts", icon: "clock", permission: "masterdata.read" },
  { to: "/employees", labelKey: "nav.employees", icon: "badge", permission: "masterdata.read" },
  { to: "/reasons", labelKey: "nav.reasons", icon: "message", permission: "masterdata.read" },
  { to: "/stores", labelKey: "nav.stores", icon: "store", permission: "masterdata.read" },
  { to: "/users", labelKey: "nav.users", icon: "users", permission: "users.manage", groupKey: "nav.administration" },
  { to: "/settings", labelKey: "nav.settings", icon: "sliders", permission: "settings.manage" },
  { to: "/account", labelKey: "nav.account", icon: "user", separate: true },
];

interface Props {
  user: User;
  title: string;
  subtitle?: string;
  /** Where this page sits, shown above the title (for example Products / Egg tray). */
  breadcrumb?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}

/** Sidebar on desktop (1024px and up); top bar with a menu below that. */
export function AppShell({ user, title, subtitle, breadcrumb, actions, children }: Props) {
  const { t, i18n } = useTranslation();
  const wide = useMediaQuery("(min-width: 1024px)");
  const [menuOpen, setMenuOpen] = useState(false);
  const logout = useLogout();
  const items = NAV.filter((n) => !n.permission || user.permissions.includes(n.permission));
  const role = user.roles[0] ? (i18n.language === "am" && user.roles[0].name_am ? user.roles[0].name_am : user.roles[0].name) : "";

  const nav = (
    <nav aria-label={t("nav.main")} className="flex flex-col gap-1">
      {items.map((n, i) => (
        <div key={n.to} className={`flex flex-col gap-1 ${n.separate && i > 0 ? "mt-3" : ""}`}>
          {n.groupKey && (
            <span className={`px-3 text-xs font-semibold uppercase tracking-wider text-ink-muted ${i > 0 ? "mt-3" : ""}`} style={{ lineHeight: "16px" }}>
              {t(n.groupKey)}
            </span>
          )}
        <NavLink
          to={n.to}
          onClick={() => setMenuOpen(false)}
          className="flex h-control-md items-center gap-3 rounded-md px-3 text-base font-medium text-ink hover:bg-surface-100 aria-[current=page]:bg-brand-tint aria-[current=page]:font-semibold aria-[current=page]:text-brand"
        >
          <Icon name={n.icon} />
          {t(n.labelKey)}
        </NavLink>
        </div>
      ))}
    </nav>
  );

  const account = (
    <div className="flex flex-col gap-3 rounded-md bg-surface-50 p-3">
      <div className="flex items-center gap-2.5">
        <Avatar name={user.full_name} solid />
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-semibold" style={{ lineHeight: "20px" }}>
            {user.full_name}
          </span>
          <span className="truncate text-[13px] text-ink-muted" style={{ lineHeight: "18px" }}>
            {role}
          </span>
        </div>
      </div>
      <Button variant="secondary" className="h-11 text-sm font-medium" loading={logout.isPending} onClick={() => logout.mutate()}>
        {t("account.signOut")}
      </Button>
    </div>
  );

  const header = (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-1">
        {breadcrumb}
        <h1 className="text-[28px] font-semibold leading-9 am:leading-10">{title}</h1>
        {subtitle && <p className="text-sm text-ink-muted">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {wide && <LanguageSwitch />}
        {actions}
      </div>
    </header>
  );

  if (wide) {
    return (
      <div className="flex min-h-dvh">
        <aside className="sticky top-0 flex h-dvh w-60 shrink-0 flex-col justify-between border-r border-line bg-surface-0 px-4 py-6">
          <div className="flex flex-col gap-6">
            <span className="px-2 text-lg font-semibold text-brand" style={{ lineHeight: "26px" }}>
              {t("app.name")}
            </span>
            {nav}
          </div>
          {account}
        </aside>
        <main className="flex min-w-0 flex-1 flex-col gap-6 px-12 py-8">
          {header}
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="flex h-16 items-center justify-between gap-1 border-b border-line bg-surface-0 pl-1 pr-2 md:px-8 md:pl-5">
        <div className="flex min-w-0 items-center gap-0.5 md:gap-2">
          <button
            type="button"
            aria-label={t("nav.menu")}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
            className="flex size-12 shrink-0 items-center justify-center rounded-md text-ink hover:bg-surface-100"
          >
            <Icon name="menu" size={24} />
          </button>
          <span className="truncate font-semibold text-brand md:text-lg">
            <span className="md:hidden">{t("app.nameShort")}</span>
            <span className="hidden md:inline">{t("app.name")}</span>
          </span>
        </div>
        <LanguageSwitch compact />
      </div>
      <main className="flex flex-1 flex-col gap-4 px-4 pb-6 pt-5 md:gap-6 md:px-8 md:py-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            {breadcrumb}
            <h1 className="text-[28px] font-semibold leading-9 am:leading-10">{title}</h1>
            {subtitle && <p className="text-sm text-ink-muted">{subtitle}</p>}
          </div>
          <div className="flex w-full flex-col md:w-auto">{actions}</div>
        </header>
        {children}
      </main>
      {menuOpen && (
        <Modal variant="drawer" title={t("nav.menu")} onClose={() => setMenuOpen(false)}>
          <span className="px-2 text-lg font-semibold text-brand">{t("app.name")}</span>
          {nav}
          <div className="mt-auto">{account}</div>
        </Modal>
      )}
    </div>
  );
}
