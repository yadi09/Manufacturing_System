// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../../App";
import i18n from "../../i18n";
import { formatDate } from "../../lib/calendar/format";
import { getCalendar } from "../../lib/calendar/preference";
import { ADMIN_ME, createFakeServer, fakeFetch, type FakeOptions } from "../users/testing/fakeServer";
import type { User } from "../auth/api";

const CASHIER: User = {
  id: "u2",
  email: "selam.tadesse@example.com",
  full_name: "Selam Tadesse",
  must_change_password: false,
  permissions: [],
  preferences: { language: null, calendar: null },
  roles: [{ key: "cashier", name: "Cashier / sales", name_am: "ገንዘብ ተቀባይ / ሽያጭ" }],
};

function start(path: string, options: FakeOptions = {}, width = 1280) {
  vi.stubGlobal("matchMedia", (query: string) => {
    const min = /min-width:\s*(\d+)px/.exec(query);
    return { matches: min ? width >= Number(min[1]) : false, media: query, addEventListener: () => {}, removeEventListener: () => {} };
  });
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

const passwordCalls = (s: ReturnType<typeof createFakeServer>) => s.calls.filter((c) => c.path === "/api/auth/password");

async function fillPasswords(user: ReturnType<typeof userEvent.setup>, current: string, next: string, repeat: string) {
  await user.type(screen.getByLabelText("Current password"), current);
  await user.type(screen.getByLabelText("New password"), next);
  await user.type(screen.getByLabelText("Repeat the new password"), repeat);
}

beforeEach(async () => {
  localStorage.clear();
  await i18n.changeLanguage("en");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Account page", () => {
  it("shows the person's details and roles, read-only, with the way to change them", async () => {
    start("/account", { me: CASHIER });
    expect(await screen.findByRole("heading", { level: 1, name: "Account" })).toBeInTheDocument();
    const card = screen.getByRole("heading", { level: 2, name: "Your details" }).closest("section")!;
    expect(within(card).getByText("Selam Tadesse")).toBeInTheDocument();
    expect(within(card).getByText("selam.tadesse@example.com")).toBeInTheDocument();
    expect(within(card).getByText("Cashier / sales")).toBeInTheDocument();
    expect(within(card).getByText("To change your name or roles, ask an administrator.")).toBeInTheDocument();
  });

  it("role names follow the language, from the data", async () => {
    await i18n.changeLanguage("am");
    start("/account", { me: CASHIER });
    const card = (await screen.findByRole("heading", { level: 2, name: "የእርስዎ መረጃ" })).closest("section")!;
    expect(within(card).getByText("ገንዘብ ተቀባይ / ሽያጭ")).toBeInTheDocument();
  });

  it("someone without users.manage has Account as their only menu item, and /users sends them there", async () => {
    start("/users", { me: CASHIER });
    await screen.findByRole("heading", { level: 1, name: "Account" });
    expect(window.location.pathname).toBe("/account");
    expect(screen.getByRole("link", { name: "Account" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("link", { name: "Users" })).not.toBeInTheDocument();
  });

  it("an administrator sees both menu items and starts on Users", async () => {
    start("/", {});
    await screen.findByRole("heading", { level: 1, name: "Users" });
    expect(window.location.pathname).toBe("/users");
    expect(screen.getByRole("link", { name: "Account" })).toBeInTheDocument();
  });

  it("changes the language from the Display card", async () => {
    const { user } = start("/account", { me: ADMIN_ME });
    await screen.findByRole("heading", { level: 1, name: "Account" });
    await user.click(screen.getByRole("radio", { name: "አማርኛ" }));
    expect(await screen.findByRole("heading", { level: 1, name: "መለያ" })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("am");
    expect(screen.getByRole("radio", { name: "አማርኛ" })).toBeChecked();
  });

  it("the calendar choice is remembered and changes how dates are shown", async () => {
    const { user } = start("/account", { me: ADMIN_ME });
    await screen.findByRole("heading", { level: 1, name: "Account" });
    expect(getCalendar()).toBe("ethiopian");
    expect(screen.getByRole("radio", { name: /Ethiopian/ })).toBeChecked();
    // Each option shows today's date in that calendar.
    expect(screen.getByText(formatDate(i18n.t, new Date(), "ethiopian"))).toBeInTheDocument();
    expect(screen.getByText(formatDate(i18n.t, new Date(), "gregorian"))).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: /Gregorian/ }));
    expect(getCalendar()).toBe("gregorian");
    expect(localStorage.getItem("calendar")).toBe("gregorian");
    expect(screen.getByRole("radio", { name: /Gregorian/ })).toBeChecked();
  });
});

describe("Change password", () => {
  it("checks the easy mistakes without asking the server", async () => {
    const { server, user } = start("/account", {});
    await screen.findByRole("heading", { level: 1, name: "Account" });

    await fillPasswords(user, "current-password-1", "short", "short");
    await user.click(screen.getByRole("button", { name: "Change password" }));
    expect(screen.getByText("Use at least 10 characters.")).toBeInTheDocument();

    await user.clear(screen.getByLabelText("New password"));
    await user.type(screen.getByLabelText("New password"), "current-password-1");
    await user.click(screen.getByRole("button", { name: "Change password" }));
    expect(screen.getByText("Choose a password different from the current one.")).toBeInTheDocument();

    await user.clear(screen.getByLabelText("New password"));
    await user.type(screen.getByLabelText("New password"), "a brand new password");
    await user.click(screen.getByRole("button", { name: "Change password" }));
    expect(screen.getByText("The two passwords do not match.")).toBeInTheDocument();
    expect(screen.getByLabelText("Repeat the new password")).toHaveAttribute("aria-invalid", "true");

    expect(passwordCalls(server)).toHaveLength(0);
  });

  it("a wrong current password is reported on that field, and nothing typed is lost", async () => {
    const { user } = start("/account", {});
    await screen.findByRole("heading", { level: 1, name: "Account" });
    await fillPasswords(user, "not my password", "a brand new password", "a brand new password");
    await user.click(screen.getByRole("button", { name: "Change password" }));

    expect(await screen.findByText("The current password is wrong.")).toBeInTheDocument();
    expect(screen.getByLabelText("Current password")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Current password")).toHaveValue("not my password");
    expect(screen.getByLabelText("New password")).toHaveValue("a brand new password");
  });

  it("success: sends the right body, says the other devices were signed out, clears the fields, stays on the page", async () => {
    const { server, user } = start("/account", {});
    await screen.findByRole("heading", { level: 1, name: "Account" });
    await fillPasswords(user, "current-password-1", "a brand new password", "a brand new password");
    await user.click(screen.getByRole("button", { name: "Change password" }));

    const ok = await screen.findByRole("status");
    expect(ok).toHaveTextContent("Password changed.");
    expect(ok).toHaveTextContent("Your other devices were signed out.");
    expect(passwordCalls(server)[0].body).toEqual({ current_password: "current-password-1", new_password: "a brand new password" });
    expect(screen.getByLabelText("Current password")).toHaveValue("");
    expect(screen.getByLabelText("New password")).toHaveValue("");
    expect(screen.getByRole("heading", { level: 1, name: "Account" })).toBeInTheDocument();
  });

  it("shows busy state and cannot be submitted twice", async () => {
    const { server, user } = start("/account", {});
    await screen.findByRole("heading", { level: 1, name: "Account" });
    let finish: (r: Response) => void = () => {};
    const slow = new Promise<Response>((r) => (finish = r));
    const base = fakeFetch(server);
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => (String(input).endsWith("/password") ? slow : base(input, init))));
    await fillPasswords(user, "current-password-1", "a brand new password", "a brand new password");
    await user.click(screen.getByRole("button", { name: "Change password" }));
    const busy = await screen.findByRole("button", { name: "Change password", busy: true });
    expect(busy).toBeDisabled();
    finish(new Response(null, { status: 204 }));
    await screen.findByRole("status");
  });

  it("no connection: says so and keeps what was typed", async () => {
    const { user } = start("/account", {});
    await screen.findByRole("heading", { level: 1, name: "Account" });
    await fillPasswords(user, "current-password-1", "a brand new password", "a brand new password");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await user.click(screen.getByRole("button", { name: "Change password" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No connection to the server.");
    expect(screen.getByLabelText("New password")).toHaveValue("a brand new password");
  });

  it("Show reveals all three fields together", async () => {
    const { user } = start("/account", {});
    await screen.findByRole("heading", { level: 1, name: "Account" });
    const fields = ["Current password", "New password", "Repeat the new password"].map((n) => screen.getByLabelText(n));
    fields.forEach((f) => expect(f).toHaveAttribute("type", "password"));
    await user.click(screen.getByRole("button", { name: "Show passwords" }));
    fields.forEach((f) => expect(f).toHaveAttribute("type", "text"));
    await user.click(screen.getByRole("button", { name: "Hide passwords" }));
    fields.forEach((f) => expect(f).toHaveAttribute("type", "password"));
  });

  it("works in Amharic", async () => {
    await i18n.changeLanguage("am");
    const { user } = start("/account", {});
    await screen.findByRole("heading", { level: 1, name: "መለያ" });
    await user.type(screen.getByLabelText("የአሁኑ የይለፍ ቃል"), "x");
    await user.type(screen.getByLabelText("አዲስ የይለፍ ቃል"), "short");
    await user.type(screen.getByLabelText("አዲሱን የይለፍ ቃል ይድገሙ"), "short");
    await user.click(screen.getByRole("button", { name: "የይለፍ ቃል ቀይር" }));
    expect(screen.getByText("ቢያንስ 10 ቁምፊዎች ይጠቀሙ።")).toBeInTheDocument();
  });
});

describe("First sign-in: must choose a new password", () => {
  const forced = { me: { ...ADMIN_ME, must_change_password: true } };

  it("shows only the password form: no menu, no other screens, even on a deep link", async () => {
    start("/users", forced);
    expect(await screen.findByRole("heading", { level: 2, name: "Choose a new password" })).toBeInTheDocument();
    expect(screen.getByText("Your administrator set a temporary password. Choose your own to continue.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Users" })).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.queryByText("Meron Haile")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save and continue" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "English" })).toBeInTheDocument(); // the language switch stays
    expect(screen.getByRole("button", { name: "Sign out instead" })).toBeInTheDocument();
  });

  it("saving lets the person into the app", async () => {
    const { server, user } = start("/", forced);
    await screen.findByRole("heading", { level: 2, name: "Choose a new password" });
    await fillPasswords(user, "current-password-1", "my own new password", "my own new password");
    await user.click(screen.getByRole("button", { name: "Save and continue" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Users" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Choose a new password" })).not.toBeInTheDocument();
    expect(passwordCalls(server)).toHaveLength(1);
    await waitFor(() => expect(window.location.pathname).toBe("/users"));
  });

  it("a wrong temporary password keeps the person on the form", async () => {
    const { user } = start("/", forced);
    await screen.findByRole("heading", { level: 2, name: "Choose a new password" });
    await fillPasswords(user, "wrong temporary", "my own new password", "my own new password");
    await user.click(screen.getByRole("button", { name: "Save and continue" }));
    const form = screen.getByRole("heading", { level: 2, name: "Choose a new password" }).closest("section")!;
    expect(await within(form).findByText("The current password is wrong.")).toBeInTheDocument();
  });
});
