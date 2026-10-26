import { useTranslation } from "react-i18next";
import { Button } from "../../components/Button";
import { LanguageSwitch } from "../../components/LanguageSwitch";
import { useLogout } from "../auth/useSession";
import { ChangePasswordForm } from "./ChangePasswordForm";

/** First sign-in, or after an administrator reset: nothing else is available until a new password is chosen. */
export function ForcedPasswordPage() {
  const { t } = useTranslation();
  const logout = useLogout();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-16 items-center justify-between gap-2 border-b border-line bg-surface-0 pl-4 pr-2 md:px-8">
        <span className="truncate text-lg font-semibold text-brand">{t("app.name")}</span>
        <LanguageSwitch compact />
      </header>
      <main className="flex flex-1 justify-center px-4 py-8 md:px-8">
        <div className="flex w-full max-w-[480px] flex-col gap-4">
          <ChangePasswordForm forced />
          <Button variant="ghost" className="h-11 self-center text-sm" loading={logout.isPending} onClick={() => logout.mutate()}>
            {t("account.signOutInstead")}
          </Button>
        </div>
      </main>
    </div>
  );
}
