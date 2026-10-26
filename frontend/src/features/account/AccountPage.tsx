import { useTranslation } from "react-i18next";
import { AppShell } from "../../components/AppShell";
import { Button } from "../../components/Button";
import type { User } from "../auth/api";
import { useLogout } from "../auth/useSession";
import { DetailsCard, DisplayCard } from "./AccountCards";
import { ChangePasswordForm } from "./ChangePasswordForm";

export function AccountPage({ me }: { me: User }) {
  const { t } = useTranslation();
  const logout = useLogout();
  return (
    <AppShell user={me} title={t("nav.account")} subtitle={t("account.subtitle")}>
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <DetailsCard user={me} />
          <DisplayCard />
        </div>
        <ChangePasswordForm />
      </div>
      {/* On small screens the sidebar account box is inside the menu; keep sign-out one tap away. */}
      <Button variant="secondary" className="lg:hidden" loading={logout.isPending} onClick={() => logout.mutate()}>
        {t("account.signOut")}
      </Button>
    </AppShell>
  );
}
