import { useTranslation } from "react-i18next";
import { Button } from "../../components/Button";
import { LanguageSwitch } from "../../components/LanguageSwitch";
import type { User } from "./api";
import { useLogout } from "./useSession";

/** Temporary page after sign-in. Real screens are built after their mockups are approved. */
export function AccountPlaceholder({ user }: { user: User }) {
  const { t } = useTranslation();
  const logout = useLogout();
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-6 p-4 md:p-8">
      <div className="flex items-center justify-between gap-3">
        <span className="font-semibold text-brand">{t("app.name")}</span>
        <LanguageSwitch />
      </div>
      <section className="flex flex-col gap-3 rounded-lg bg-surface-0 p-6 shadow-card">
        <h1 className="text-lg font-semibold">{t("account.signedInAs", { name: user.full_name })}</h1>
        <p className="text-sm text-ink-muted">
          {t("account.roles")}: {user.roles.map((r) => r.name).join(", ") || "—"}
        </p>
        <p className="text-sm text-ink-muted">{t("account.placeholder")}</p>
        <Button variant="secondary" className="self-start" loading={logout.isPending} onClick={() => logout.mutate()}>
          {logout.isPending ? t("account.signingOut") : t("account.signOut")}
        </Button>
      </section>
    </main>
  );
}
