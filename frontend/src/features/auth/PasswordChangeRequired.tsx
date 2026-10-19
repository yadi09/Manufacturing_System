import { useTranslation } from "react-i18next";
import { Button } from "../../components/Button";
import { LanguageSwitch } from "../../components/LanguageSwitch";
import { Notice } from "../../components/Notice";
import type { User } from "./api";
import { useLogout } from "./useSession";

/**
 * TEMPORARY. The API already refuses everything except changing the password until it is changed.
 * The real "choose a new password" screen is part of the Account page, which waits for an
 * approved mockup. Until then this page only explains and offers sign out.
 */
export function PasswordChangeRequired({ user }: { user: User }) {
  const { t } = useTranslation();
  const logout = useLogout();
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-6 p-4 md:p-8">
      <div className="flex items-center justify-between gap-3">
        <span className="font-semibold text-brand">{t("app.name")}</span>
        <LanguageSwitch />
      </div>
      <section className="flex flex-col gap-4 rounded-lg bg-surface-0 p-6 shadow-card">
        <h1 className="text-lg font-semibold">{t("account.signedInAs", { name: user.full_name })}</h1>
        <Notice tone="warning" title={t("account.mustChange.title")}>
          {t("account.mustChange.body")}
        </Notice>
        <Button variant="secondary" className="self-start" loading={logout.isPending} onClick={() => logout.mutate()}>
          {t("account.signOut")}
        </Button>
      </section>
    </main>
  );
}
