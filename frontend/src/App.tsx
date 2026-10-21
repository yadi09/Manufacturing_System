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
import { RecipePage } from "./features/masterdata/RecipePage";
import { EmployeesPage } from "./features/setup/EmployeesPage";
import { MachinesPage } from "./features/setup/MachinesPage";
import { ReasonsPage } from "./features/setup/ReasonsPage";
import { SettingsPage } from "./features/setup/SettingsPage";
import { ShiftsPage } from "./features/setup/ShiftsPage";
import { StoresPage } from "./features/setup/StoresPage";
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
  const settingsAdmin = user.permissions.includes("settings.manage");
  const away = <Navigate to="/account" replace />;
  return (
    <BrowserRouter>
      <PreferencesSync user={user} />
      <Routes>
        <Route path="/users" element={admin ? <UsersPage me={user} /> : <Navigate to="/account" replace />} />
        <Route path="/products" element={reader ? <ProductsPage me={user} /> : <Navigate to="/account" replace />} />
        <Route path="/products/:id" element={reader ? <ProductPage me={user} /> : <Navigate to="/account" replace />} />
        <Route path="/colours/:id/recipe" element={reader ? <RecipePage me={user} /> : <Navigate to="/account" replace />} />
        <Route path="/materials" element={reader ? <MaterialsPage me={user} /> : <Navigate to="/account" replace />} />
        <Route path="/machines" element={reader ? <MachinesPage me={user} /> : away} />
        <Route path="/shifts" element={reader ? <ShiftsPage me={user} /> : away} />
        <Route path="/employees" element={reader ? <EmployeesPage me={user} /> : away} />
        <Route path="/reasons" element={reader ? <ReasonsPage me={user} /> : away} />
        <Route path="/stores" element={reader ? <StoresPage me={user} /> : away} />
        <Route path="/settings" element={settingsAdmin ? <SettingsPage me={user} /> : away} />
        <Route path="/account" element={<AccountPage me={user} />} />
        <Route path="*" element={<Navigate to={admin ? "/users" : reader ? "/products" : "/account"} replace />} />
      </Routes>
    </BrowserRouter>
  );
}
