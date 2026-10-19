// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../../i18n";
import { UsersPage } from "./UsersPage";
import { ADMIN_ME, createFakeServer, fakeFetch, USERS, type FakeOptions } from "./testing/fakeServer";

/** Pretends the window is `width` px wide: matchMedia("(min-width: N px)") follows it. */
function setWidth(width: number) {
  vi.stubGlobal("matchMedia", (query: string) => {
    const min = /min-width:\s*(\d+)px/.exec(query);
    return { matches: min ? width >= Number(min[1]) : false, media: query, addEventListener: () => {}, removeEventListener: () => {} };
  });
}

function setup(options: FakeOptions = {}, width = 1280) {
  setWidth(width);
  const server = createFakeServer(options);
  vi.stubGlobal("fetch", vi.fn(fakeFetch(server)));
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/users"]}>
        <UsersPage me={ADMIN_ME} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { server, user: userEvent.setup() };
}

const row = (name: string) => screen.getByRole("row", { name: new RegExp(name) });
const patches = (s: ReturnType<typeof createFakeServer>) => s.calls.filter((c) => c.method === "PATCH");

beforeEach(async () => {
  await i18n.changeLanguage("en");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("users list", () => {
  it("shows names, emails, role names and status, with the count", async () => {
    setup();
    expect(await screen.findByText("Meron Haile")).toBeInTheDocument();
    expect(screen.getByText("10 people · 9 active")).toBeInTheDocument();
    const meron = row("Meron Haile");
    expect(within(meron).getByText("meron.haile@example.com")).toBeInTheDocument();
    expect(within(meron).getByText("Shift supervisor")).toBeInTheDocument();
    expect(within(meron).getByText("QC inspector")).toBeInTheDocument();
    expect(within(meron).getByText("Active")).toBeInTheDocument();
    expect(within(row("Tesfaye Worku")).getByText("Deactivated")).toBeInTheDocument();
  });

  it("role names come from the server data, in the chosen language", async () => {
    await i18n.changeLanguage("am");
    setup();
    expect(await screen.findByText("ሠላም ታደሰ")).toBeInTheDocument();
    expect(within(row("Abebe Kebede")).getByText("አስተዳዳሪ")).toBeInTheDocument();
    expect(within(row("Abebe Kebede")).getByText("ንቁ")).toBeInTheDocument();
    expect(screen.getByText("10 ሰዎች · 9 ንቁ")).toBeInTheDocument();
  });

  it("searches by name or email, and says when nobody matches", async () => {
    const { user } = setup();
    await screen.findByText("Meron Haile");
    await user.type(screen.getByLabelText("Search users"), "yonas");
    expect(screen.getByText("Yonas Bekele")).toBeInTheDocument();
    expect(screen.queryByText("Meron Haile")).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText("Search users"));
    await user.type(screen.getByLabelText("Search users"), "nobody-here");
    expect(screen.getByText("No one matches “nobody-here”.")).toBeInTheDocument();
  });

  it("long names and emails stay in their cells", async () => {
    setup();
    const long = await screen.findByText("Tigist Wolde-Michael Gebreselassie");
    expect(long).toBeInTheDocument();
    expect(screen.getByText(/tigist\.wolde-michael\.gebreselassie@/)).toBeInTheDocument();
  });

  it("uses cards on a phone and a table from 768px", async () => {
    setup({}, 360);
    expect(await screen.findByText("Meron Haile")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(10);
    expect(screen.getByRole("button", { name: "Edit Meron Haile" })).toBeInTheDocument();
  });

  it("empty, loading and failing states", async () => {
    const empty = setup({ users: [] });
    expect(await screen.findByText("No users yet")).toBeInTheDocument();
    expect(empty.server.calls.some((c) => c.path === "/api/users")).toBe(true);
    cleanup();

    setup({ failing: { "GET /api/users": 500 } });
    expect(screen.getByRole("status", { name: "Loading users" })).toBeInTheDocument();
    expect(await screen.findByText("Could not load users.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});

describe("editing a user", () => {
  it("shows the email read-only, the roles with descriptions, and saves only what changed", async () => {
    const { server, user } = setup();
    await user.click(await screen.findByRole("button", { name: "Edit Meron Haile" }));

    const panel = await screen.findByRole("dialog");
    expect(within(panel).getByLabelText("Email")).toHaveAttribute("readonly");
    expect(within(panel).getByText("The email cannot be changed after the user is created.")).toBeInTheDocument();
    expect(within(panel).getByRole("checkbox", { name: /Shift supervisor/ })).toBeChecked();
    expect(within(panel).getByRole("checkbox", { name: /Purchaser/ })).not.toBeChecked();
    expect(within(panel).getByText("Edits and approves purchase orders and records receiving.")).toBeInTheDocument();
    expect(within(panel).getAllByRole("checkbox")).toHaveLength(10);

    const save = within(panel).getByRole("button", { name: "Save changes" });
    expect(save).toBeDisabled(); // nothing changed yet
    await user.click(within(panel).getByRole("checkbox", { name: /Purchaser/ }));
    await user.click(within(panel).getByRole("checkbox", { name: /QC inspector/ }));
    expect(save).toBeEnabled();
    await user.click(save);

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(patches(server)).toHaveLength(1);
    expect(patches(server)[0].body).toEqual({ full_name: "Meron Haile", roles: ["shift_supervisor", "purchaser"] });
    // The list refreshes with the new roles.
    expect(await within(row("Meron Haile")).findByText("Purchaser")).toBeInTheDocument();
  });

  it("deactivating needs a confirmation, then shows the status and a Reactivate button", async () => {
    const { server, user } = setup();
    await user.click(await screen.findByRole("button", { name: "Edit Yonas Bekele" }));
    await user.click(screen.getByRole("button", { name: "Deactivate" }));

    const confirm = await screen.findByRole("alertdialog");
    expect(within(confirm).getByText("Deactivate Yonas Bekele?")).toBeInTheDocument();
    expect(within(confirm).getByText(/any open sessions end now/)).toBeInTheDocument();
    expect(within(confirm).getByRole("button", { name: "Cancel" })).toHaveFocus(); // the safe choice is the default
    expect(patches(server)).toHaveLength(0);

    await user.click(within(confirm).getByRole("button", { name: "Deactivate" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(patches(server)[0].body).toEqual({ active: false });
    expect(await screen.findByRole("button", { name: "Reactivate" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Deactivate" })).not.toBeInTheDocument();
  });

  it("Cancel in the confirmation changes nothing", async () => {
    const { server, user } = setup();
    await user.click(await screen.findByRole("button", { name: "Edit Yonas Bekele" }));
    await user.click(screen.getByRole("button", { name: "Deactivate" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument(); // the panel is still open
    expect(patches(server)).toHaveLength(0);
  });

  it("Reactivate is a plain button with no dialog", async () => {
    const { server, user } = setup();
    await user.click(await screen.findByRole("button", { name: "Edit Tesfaye Worku" }));
    await user.click(screen.getByRole("button", { name: "Reactivate" }));
    await waitFor(() => expect(patches(server)).toHaveLength(1));
    expect(patches(server)[0].body).toEqual({ active: true });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Deactivate" })).toBeInTheDocument();
  });

  it("the last administrator cannot be deactivated: the panel shows the message", async () => {
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: "Edit Abebe Kebede" }));
    await user.click(screen.getByRole("button", { name: "Deactivate" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Deactivate" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("You cannot remove the last administrator.");
    expect(alert).toHaveTextContent("Make someone else an administrator first, then try again.");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Deactivate" })).toBeInTheDocument(); // still active
  });

  it("the last administrator cannot lose the role either", async () => {
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: "Edit Abebe Kebede" }));
    const panel = await screen.findByRole("dialog");
    await user.click(within(panel).getByRole("checkbox", { name: /Administrator/ }));
    await user.click(within(panel).getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You cannot remove the last administrator.");
  });

  it("Escape closes the top-most dialog only, and focus returns to the Edit button", async () => {
    const { user } = setup();
    const edit = await screen.findByRole("button", { name: "Edit Yonas Bekele" });
    await user.click(edit);
    await user.click(screen.getByRole("button", { name: "Deactivate" }));
    await screen.findByRole("alertdialog");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(edit).toHaveFocus();
  });

  it("keeps Tab inside an open dialog", async () => {
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: "Edit Yonas Bekele" }));
    const panel = await screen.findByRole("dialog");
    const inside = () => panel.contains(document.activeElement);
    for (let i = 0; i < 40; i++) {
      await user.tab();
      expect(inside()).toBe(true);
    }
    for (let i = 0; i < 40; i++) {
      await user.tab({ shift: true });
      expect(inside()).toBe(true);
    }
  });
});

describe("resetting a password", () => {
  it("rejects a short password without asking the server, then shows the new one once", async () => {
    const { server, user } = setup();
    await user.click(await screen.findByRole("button", { name: "Edit Meron Haile" }));
    await user.click(screen.getByRole("button", { name: "Reset password…" }));
    const dialog = await screen.findByRole("dialog", { name: "Reset password for Meron Haile" });
    expect(within(dialog).getByText(/All of Meron Haile's open sessions end/)).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText("New password"), "short");
    await user.click(within(dialog).getByRole("button", { name: "Reset password" }));
    expect(within(dialog).getByText("Use at least 10 characters.")).toBeInTheDocument();
    expect(server.calls.some((c) => c.path.endsWith("/password"))).toBe(false);

    await user.click(within(dialog).getByRole("button", { name: "Generate" }));
    const generated = (within(dialog).getByLabelText("New password") as HTMLInputElement).value;
    expect(generated).toMatch(/^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/);
    await user.click(within(dialog).getByRole("button", { name: "Reset password" }));

    const result = await screen.findByRole("dialog", { name: "Password reset for Meron Haile" });
    expect(server.calls.find((c) => c.path === "/api/users/u4/password")?.body).toEqual({ password: generated });
    expect(within(result).getByLabelText("Password")).toHaveTextContent(generated);
    expect(within(result).getByText("They must choose a new password the first time they sign in.")).toBeInTheDocument();

    await user.click(within(result).getByRole("button", { name: "Done" }));
    expect(screen.queryByText(generated)).not.toBeInTheDocument(); // never shown again
    expect(document.body.textContent).not.toContain(generated);
  });
});

describe("adding a user", () => {
  it("creates the user with the chosen roles and shows the password once", async () => {
    const { server, user } = setup();
    await screen.findByText("Meron Haile");
    await user.click(screen.getByRole("button", { name: "Add user" }));
    const panel = await screen.findByRole("dialog");

    expect(within(panel).getByLabelText("Email")).not.toHaveAttribute("readonly");
    await user.type(within(panel).getByLabelText("Full name"), "Liya Mekonnen");
    await user.type(within(panel).getByLabelText("Email"), "Liya.Mekonnen@example.com");
    await user.click(within(panel).getByRole("button", { name: "Generate" }));
    const generated = (within(panel).getByLabelText("Temporary password") as HTMLInputElement).value;
    await user.click(within(panel).getByRole("checkbox", { name: /Cashier/ }));
    await user.click(within(panel).getByRole("button", { name: "Add user" }));

    const result = await screen.findByRole("dialog", { name: "Liya Mekonnen was added" });
    const post = server.calls.find((c) => c.method === "POST" && c.path === "/api/users");
    expect(post?.body).toEqual({ email: "Liya.Mekonnen@example.com", full_name: "Liya Mekonnen", password: generated, roles: ["cashier"] });
    expect(within(result).getByLabelText("Password")).toHaveTextContent(generated);

    await user.click(within(result).getByRole("button", { name: "Done" }));
    expect(document.body.textContent).not.toContain(generated);
    expect(await screen.findByText("Liya Mekonnen")).toBeInTheDocument(); // the list refreshed
    expect(screen.getByText("11 people · 10 active")).toBeInTheDocument();
  });

  it("explains a short password and an email already in use", async () => {
    const { server, user } = setup();
    await screen.findByText("Meron Haile");
    await user.click(screen.getByRole("button", { name: "Add user" }));
    const panel = await screen.findByRole("dialog");
    await user.type(within(panel).getByLabelText("Full name"), "Someone New");
    await user.type(within(panel).getByLabelText("Email"), "dawit.alemu@example.com");
    await user.type(within(panel).getByLabelText("Temporary password"), "abc123");
    await user.click(within(panel).getByRole("button", { name: "Add user" }));
    expect(within(panel).getByText("Use at least 10 characters.")).toBeInTheDocument();
    expect(server.calls.some((c) => c.method === "POST")).toBe(false);

    await user.clear(within(panel).getByLabelText("Temporary password"));
    await user.type(within(panel).getByLabelText("Temporary password"), "a long enough one");
    await user.click(within(panel).getByRole("button", { name: "Add user" }));
    expect(await within(panel).findByText("This email is already in use.")).toBeInTheDocument();
    expect(within(panel).getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
  });

  it("no connection: says so and keeps what was typed", async () => {
    const { user } = setup();
    await screen.findByText("Meron Haile");
    await user.click(screen.getByRole("button", { name: "Add user" }));
    const panel = await screen.findByRole("dialog");
    await user.type(within(panel).getByLabelText("Full name"), "Someone New");
    await user.type(within(panel).getByLabelText("Email"), "new@example.com");
    await user.type(within(panel).getByLabelText("Temporary password"), "a long enough one");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await user.click(within(panel).getByRole("button", { name: "Add user" }));
    expect(await within(panel).findByRole("alert")).toHaveTextContent("No connection to the server.");
    expect(within(panel).getByLabelText("Full name")).toHaveValue("Someone New");
  });
});

it("the fixtures hold what the tests assume", () => {
  expect(USERS).toHaveLength(10);
  expect(USERS.filter((u) => u.active)).toHaveLength(9);
});
