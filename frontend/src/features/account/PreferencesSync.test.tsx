// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../../App";
import i18n from "../../i18n";
import { getCalendar } from "../../lib/calendar/preference";
import { ADMIN_ME, createFakeServer, fakeFetch, type FakeOptions } from "../users/testing/fakeServer";

function start(path: string, options: FakeOptions = {}) {
  window.history.pushState({}, "", path);
  const server = createFakeServer(options);
  vi.stubGlobal("fetch", vi.fn(fakeFetch(server)));
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <App />
    </QueryClientProvider>,
  );
  return { server, user: userEvent.setup() };
}

const saves = (s: ReturnType<typeof createFakeServer>) => s.calls.filter((c) => c.method === "PATCH" && c.path === "/api/auth/preferences");
const withPrefs = (language: "en" | "am" | null, calendar: "ethiopian" | "gregorian" | null) => ({ me: { ...ADMIN_ME, preferences: { language, calendar } } });

beforeEach(async () => {
  localStorage.clear();
  await i18n.changeLanguage("en");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("saved language and calendar", () => {
  it("applies the saved choices when the person signs in, on a device that had other values", async () => {
    const { server } = start("/account", withPrefs("am", "gregorian"));
    expect(await screen.findByRole("heading", { level: 1, name: "መለያ" })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("am");
    expect(getCalendar()).toBe("gregorian");
    // Applying what the server already holds must not be sent back.
    await new Promise((r) => setTimeout(r, 50));
    expect(saves(server)).toHaveLength(0);
  });

  it("nothing chosen yet: the device value stays and nothing is saved until the person chooses", async () => {
    await i18n.changeLanguage("am");
    const { server } = start("/account", withPrefs(null, null));
    expect(await screen.findByRole("heading", { level: 1, name: "መለያ" })).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 50));
    expect(saves(server)).toHaveLength(0);
  });

  it("choosing a language on the Account page saves it", async () => {
    const { server, user } = start("/account", withPrefs(null, null));
    await screen.findByRole("heading", { level: 1, name: "Account" });
    await user.click(screen.getByRole("radio", { name: "አማርኛ" }));
    await waitFor(() => expect(saves(server)).toHaveLength(1));
    expect(saves(server)[0].body).toEqual({ language: "am" });
    // Choosing the same value again sends nothing more.
    await user.click(screen.getByRole("radio", { name: "አማርኛ" }));
    expect(saves(server)).toHaveLength(1);
  });

  it("choosing a calendar saves it, and only the calendar", async () => {
    const { server, user } = start("/account", withPrefs("en", null));
    await screen.findByRole("heading", { level: 1, name: "Account" });
    await user.click(screen.getByRole("radio", { name: /Gregorian/ }));
    await waitFor(() => expect(saves(server)).toHaveLength(1));
    expect(saves(server)[0].body).toEqual({ calendar: "gregorian" });
  });

  it("the language switch in the top bar saves too", async () => {
    const { server, user } = start("/account", withPrefs("en", "ethiopian"));
    await screen.findByRole("heading", { level: 1, name: "Account" });
    await user.click(screen.getByRole("button", { name: "አማርኛ" }));
    await waitFor(() => expect(saves(server)).toHaveLength(1));
    expect(saves(server)[0].body).toEqual({ language: "am" });
  });

  it("a person who must change the password can still choose and save their language", async () => {
    const { server, user } = start("/", { me: { ...ADMIN_ME, must_change_password: true } });
    await screen.findByRole("heading", { level: 2, name: "Choose a new password" });
    await user.click(screen.getByRole("button", { name: "አማርኛ" }));
    await waitFor(() => expect(saves(server)).toHaveLength(1));
    expect(await screen.findByRole("heading", { level: 2, name: "አዲስ የይለፍ ቃል ይምረጡ" })).toBeInTheDocument();
  });

  it("before sign-in the device value is used and nothing is sent", async () => {
    await i18n.changeLanguage("am");
    const { server } = start("/", { me: null });
    expect(await screen.findByRole("heading", { level: 1, name: "ይግቡ" })).toBeInTheDocument();
    expect(saves(server)).toHaveLength(0);
  });
});
