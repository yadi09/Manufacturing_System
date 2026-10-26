import { useTranslation } from "react-i18next";
import { AccountPlaceholder } from "./features/auth/AccountPlaceholder";
import { LoginPage } from "./features/auth/LoginPage";
import { useMe } from "./features/auth/useSession";

export default function App() {
  const { t } = useTranslation();
  const me = useMe();

  if (me.isPending) {
    return <div className="grid min-h-dvh place-items-center text-ink-muted">{t("account.loading")}</div>;
  }
  if (me.isError) {
    // The server cannot be reached: the sign-in page reports the problem when the user tries.
    return <LoginPage />;
  }
  return me.data ? <AccountPlaceholder user={me.data} /> : <LoginPage />;
}
