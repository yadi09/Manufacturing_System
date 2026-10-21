import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { useTranslation } from "react-i18next";
import { AccountPage } from "./features/account/AccountPage";
import { ForcedPasswordPage } from "./features/account/ForcedPasswordPage";
import { PreferencesSync } from "./features/account/PreferencesSync";
import { LoginPage } from "./features/auth/LoginPage";
import { useMe } from "./features/auth/useSession";
import { MaterialsPage } from "./features/masterdata/MaterialsPage";
import { ProductPage } from "./features/masterdata/ProductPage";
import { ProductsPage } from "./features/masterdata/ProductsPage";
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
  // The API allows nothing else until the password is changed, so the screen offers nothing else either.
  if (user.must_change_password) {
    return (
      <>
        <PreferencesSync user={user} />
        <ForcedPasswordPage />
      </>
    );
  }

  const admin = user.permissions.includes("users.manage");
  const reader = user.permissions.includes("masterdata.read");
  return (
    <BrowserRouter>
      <PreferencesSync user={user} />
      <Routes>
        <Route path="/users" element={admin ? <UsersPage me={user} /> : <Navigate to="/account" replace />} />
        <Route path="/products" element={reader ? <ProductsPage me={user} /> : <Navigate to="/account" replace />} />
        <Route path="/products/:id" element={reader ? <ProductPage me={user} /> : <Navigate to="/account" replace />} />
        <Route path="/materials" element={reader ? <MaterialsPage me={user} /> : <Navigate to="/account" replace />} />
        <Route path="/account" element={<AccountPage me={user} />} />
        <Route path="*" element={<Navigate to={admin ? "/users" : reader ? "/products" : "/account"} replace />} />
      </Routes>
    </BrowserRouter>
  );
}
