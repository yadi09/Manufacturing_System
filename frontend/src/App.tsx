import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { useTranslation } from "react-i18next";
import { AccountPlaceholder } from "./features/auth/AccountPlaceholder";
import { LoginPage } from "./features/auth/LoginPage";
import { PasswordChangeRequired } from "./features/auth/PasswordChangeRequired";
import { useMe } from "./features/auth/useSession";
import { UsersPage } from "./features/users/UsersPage";

export default function App() {
  const { t } = useTranslation();
  const me = useMe();

  if (me.isPending) {
    return <div className="grid min-h-dvh place-items-center text-ink-muted">{t("account.loading")}</div>;
  }
  const user = me.data;
  // Not signed in, or the server cannot be reached: the sign-in page reports the problem when the user tries.
  if (!user) return <LoginPage />;
  if (user.must_change_password) return <PasswordChangeRequired user={user} />;

  const admin = user.permissions.includes("users.manage");
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/users" element={admin ? <UsersPage me={user} /> : <Navigate to="/" replace />} />
        <Route path="*" element={admin ? <Navigate to="/users" replace /> : <AccountPlaceholder user={user} />} />
      </Routes>
    </BrowserRouter>
  );
}
