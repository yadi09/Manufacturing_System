// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import i18n from "./i18n";
import { ADMIN_ME, createFakeServer, fakeFetch } from "./features/users/testing/fakeServer";
import type { User } from "./features/auth/api";

function start(me: User | null, path = "/") {
  window.history.pushState({}, "", path);
  vi.stubGlobal("fetch", vi.fn(fakeFetch(createFakeServer({ me }))));
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <App />
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage("en");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("App", () => {
  it("signed out: the sign-in page, also on a deep link", async () => {
    start(null, "/users");
    expect(await screen.findByRole("heading", { level: 1, name: "Sign in" })).toBeInTheDocument();
  });

  it("an administrator lands on the users screen", async () => {
    start(ADMIN_ME, "/");
    expect(await screen.findByRole("heading", { level: 1, name: "Users" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/users");
    expect(await screen.findByText("Meron Haile")).toBeInTheDocument();
  });

  it("someone without users.manage never sees the users screen or its menu item", async () => {
    start({ ...ADMIN_ME, permissions: [], roles: [{ key: "cashier", name: "Cashier / sales", name_am: "ገንዘብ ተቀባይ / ሽያጭ" }] }, "/users");
    expect(await screen.findByText(/Signed in as/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Users" })).not.toBeInTheDocument();
    expect(screen.queryByText("Meron Haile")).not.toBeInTheDocument();
    expect(window.location.pathname).toBe("/");
  });

  it("a user who must change the password sees only that notice, not the app", async () => {
    start({ ...ADMIN_ME, must_change_password: true }, "/users");
    expect(await screen.findByText("You must choose a new password.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1, name: "Users" })).not.toBeInTheDocument();
    expect(screen.queryByText("Meron Haile")).not.toBeInTheDocument();
  });
});
