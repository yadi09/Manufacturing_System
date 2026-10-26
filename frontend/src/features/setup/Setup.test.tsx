// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../../App";
import i18n from "../../i18n";
import { ADMIN_ME, createFakeServer, fakeFetch, type FakeOptions } from "../users/testing/fakeServer";
import { targetPieces } from "./MachinesPage";
import { shiftMinutes } from "./ShiftsPage";

const READER = { ...ADMIN_ME, permissions: ["masterdata.read"], roles: [{ key: "production_manager", name: "Production manager", name_am: "የምርት ሥራ አስኪያጅ" }] };

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

const sent = (s: ReturnType<typeof createFakeServer>, method: string, prefix: string) => s.calls.filter((c) => c.method === method && c.path.startsWith(prefix));

beforeEach(async () => {
  localStorage.clear();
  await i18n.changeLanguage("en");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("rules", () => {
  it("computes Crown's targets from cycle time and cavities", () => {
    // Crown's weekly report: 14 planned hours, 11 cavities, 31.7 s and 30.7 s.
    expect(targetPieces(14, 31.7, 11)).toBe(17489);
    expect(targetPieces(14, 30.7, 11)).toBe(18059);
  });
  it("measures a shift across midnight", () => {
    expect(shiftMinutes("18:00", "08:00")).toBe(14 * 60);
    expect(shiftMinutes("08:00", "18:00")).toBe(10 * 60);
  });
});

describe("menu", () => {
  it("shows the new master data screens, and Settings only to administrators", async () => {
    start("/machines");
    await screen.findByRole("heading", { level: 1, name: "Machines and areas" });
    for (const name of ["Machines", "Shifts", "Employees", "Reasons", "Stores", "Settings"]) expect(screen.getByRole("link", { name })).toBeInTheDocument();
    expect(screen.getByText("Administration")).toBeInTheDocument();
    cleanup();

    start("/settings", { me: READER });
    expect(await screen.findByRole("heading", { level: 1, name: "Account" })).toBeInTheDocument(); // sent away
    expect(screen.queryByRole("link", { name: "Settings" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Shifts" })).toBeInTheDocument();
  });
});

describe("Machines", () => {
  it("lists machines and areas with their moulds and cycle times", async () => {
    start("/machines");
    const m2 = await screen.findByRole("button", { name: "Open Machine 2" });
    expect(within(m2).getByText("Clear jar cap mould · 11 cavities")).toBeInTheDocument();
    expect(within(m2).getByText("Standard cycle time 31.7 s")).toBeInTheDocument();
    expect(within(screen.getByRole("button", { name: "Open Machine 1" })).getByText("Cycle time not set yet")).toBeInTheDocument();
    expect(within(screen.getByRole("button", { name: "Open QC area" })).getByText("Output is inspected here; operators rotate here to rest")).toBeInTheDocument();
  });

  it("shows what a cycle time means in pieces, and saves a new standard", async () => {
    const { server, user } = start("/machines");
    await user.click(await screen.findByRole("button", { name: "Open Machine 2" }));
    const panel = await screen.findByRole("dialog", { name: "Machine 2" });
    expect(await within(panel).findByText(/the Night shift \(14 hours\) targets 17,489 pieces/)).toBeInTheDocument();
    const cycle = within(panel).getByLabelText("Standard cycle time");
    await user.clear(cycle);
    await user.type(cycle, "30.7");
    expect(within(panel).getByText(/targets 18,059 pieces/)).toBeInTheDocument();
    expect(within(panel).getByLabelText("Cycle time for Blue (optional)")).toHaveValue("30.7");
    await user.click(within(panel).getByRole("button", { name: "Save changes" }));
    await vi.waitFor(() => expect(sent(server, "PUT", "/api/workspaces/w2/moulds/mo1")).toHaveLength(1));
    expect(sent(server, "PUT", "/api/workspaces/w2/moulds/mo1")[0].body).toEqual({ standard_cycle_s: "30.7", active: true, colours: [{ colour_id: "c3", cycle_s: "30.7" }] });
    expect(sent(server, "PATCH", "/api/workspaces")).toHaveLength(0); // the machine itself did not change
  });

  it("refuses a cycle time of zero and sends nothing", async () => {
    const { server, user } = start("/machines");
    await user.click(await screen.findByRole("button", { name: "Open Machine 2" }));
    const panel = await screen.findByRole("dialog", { name: "Machine 2" });
    const cycle = within(panel).getByLabelText("Standard cycle time");
    await user.clear(cycle);
    await user.type(cycle, "0");
    await user.click(within(panel).getByRole("button", { name: "Save changes" }));
    expect(await within(panel).findAllByText("Enter seconds above 0, up to 3600, with at most 2 decimals.")).not.toHaveLength(0);
    expect(sent(server, "PUT", "/api/workspaces")).toHaveLength(0);
  });

  it("puts a mould on a machine and takes one off", async () => {
    const { server, user } = start("/machines", { setup: { workspaces: [{ id: "w1", kind: "machine", name: "Machine 1", name_am: "ማሽን 1", runs_24h: true, active: true, setups: [] }] } });
    await user.click(await screen.findByRole("button", { name: "Open Machine 1" }));
    const panel = await screen.findByRole("dialog", { name: "Machine 1" });
    await user.selectOptions(within(panel).getByRole("combobox", { name: "Put a mould on this machine" }), "Egg tray mould");
    expect(within(panel).getByText("Egg tray · Cavities not set yet")).toBeInTheDocument();
    await user.click(within(panel).getByRole("button", { name: "Save changes" }));
    await vi.waitFor(() => expect(sent(server, "PUT", "/api/workspaces/w1/moulds/mo2")).toHaveLength(1));
    expect(sent(server, "PUT", "/api/workspaces/w1/moulds/mo2")[0].body).toEqual({ standard_cycle_s: null, active: true, colours: [] });
  });

  it("adds a mould, checking the cavities", async () => {
    const { server, user } = start("/machines?tab=moulds");
    await screen.findByRole("button", { name: "Open Clear jar cap mould" });
    expect(within(screen.getByRole("button", { name: "Open Egg tray mould" })).getByText("Cavities not set yet")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add mould" }));
    const panel = await screen.findByRole("dialog", { name: "Add mould" });
    await user.type(within(panel).getByLabelText("Name in English"), "Blue cap mould");
    await user.type(within(panel).getByLabelText("Name in Amharic"), "ሰማያዊ ክዳን ሻጋታ");
    await user.type(within(panel).getByLabelText("Number of cavities"), "0");
    await user.click(within(panel).getByRole("button", { name: "Add mould" }));
    expect(await within(panel).findByText("Enter a whole number from 1 to 1000, or leave empty.")).toBeInTheDocument();
    await user.clear(within(panel).getByLabelText("Number of cavities"));
    await user.type(within(panel).getByLabelText("Number of cavities"), "11");
    await user.click(within(panel).getByRole("button", { name: "Add mould" }));
    await vi.waitFor(() => expect(sent(server, "POST", "/api/moulds")).toHaveLength(1));
    expect(sent(server, "POST", "/api/moulds")[0].body).toMatchObject({ name: "Blue cap mould", cavities: 11, product_id: "p1" });
  });

  it("is read-only for someone who may only read", async () => {
    start("/machines", { me: READER });
    await screen.findByText("Machine 2");
    expect(screen.queryByRole("button", { name: "Open Machine 2" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add machine or area" })).not.toBeInTheDocument();
  });

  it("is in Amharic when the language is Amharic", async () => {
    await i18n.changeLanguage("am");
    start("/machines");
    expect(await screen.findByRole("heading", { level: 1, name: "ማሽኖች እና ቦታዎች" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "ማሽን 2ን ክፈት" })).toBeInTheDocument();
  });
});

describe("Shifts", () => {
  it("shows that the night shift crosses midnight and belongs to the day it started", async () => {
    start("/shifts");
    const night = await screen.findByRole("region", { name: "Night" });
    expect(within(night).getByText("14 hours")).toBeInTheDocument();
    expect(within(night).getByText("Crosses midnight")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Day" })).queryByText("Crosses midnight")).not.toBeInTheDocument();
  });

  it("asks for a reason when the times change, and sends it", async () => {
    const { server, user } = start("/shifts");
    await user.click(await screen.findByRole("button", { name: "Edit Night" }));
    const panel = await screen.findByRole("dialog", { name: "Edit shift" });
    expect(within(panel).queryByLabelText("Reason for the new times")).not.toBeInTheDocument();
    const startField = within(panel).getByLabelText("Starts at");
    await user.clear(startField);
    await user.type(startField, "19:00");
    await user.click(within(panel).getByRole("button", { name: "Save changes" }));
    expect(await within(panel).findByText("Say why the times change.")).toBeInTheDocument();
    expect(sent(server, "PATCH", "/api/shifts")).toHaveLength(0);
    await user.type(within(panel).getByLabelText("Reason for the new times"), "Power schedule changed.");
    await user.click(within(panel).getByRole("button", { name: "Save changes" }));
    await vi.waitFor(() => expect(sent(server, "PATCH", "/api/shifts/s2")).toHaveLength(1));
    expect(sent(server, "PATCH", "/api/shifts/s2")[0].body).toMatchObject({ start_time: "19:00", end_time: "08:00", reason: "Power schedule changed." });
  });

  it("renames without a reason", async () => {
    const { server, user } = start("/shifts");
    await user.click(await screen.findByRole("button", { name: "Edit Day" }));
    const panel = await screen.findByRole("dialog", { name: "Edit shift" });
    await user.type(within(panel).getByLabelText("Name in English"), " shift");
    await user.click(within(panel).getByRole("button", { name: "Save changes" }));
    await vi.waitFor(() => expect(sent(server, "PATCH", "/api/shifts/s1")).toHaveLength(1));
    expect(sent(server, "PATCH", "/api/shifts/s1")[0].body).toMatchObject({ name: "Day shift", start_time: "08:00" });
    expect(sent(server, "PATCH", "/api/shifts/s1")[0].body).not.toHaveProperty("reason");
  });
});

describe("Reasons", () => {
  it("keeps damage and downtime reasons apart and adds to the open tab", async () => {
    const { server, user } = start("/reasons");
    expect(await screen.findByRole("tab", { name: "Damage (3)" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Splitting")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Downtime (1)" }));
    expect(await screen.findByText("Power off")).toBeInTheDocument();
    expect(screen.queryByText("Splitting")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add downtime reason" }));
    const panel = await screen.findByRole("dialog", { name: "Add downtime reason" });
    await user.type(within(panel).getByLabelText("Name in English"), "power off");
    await user.type(within(panel).getByLabelText("Name in Amharic"), "የኃይል መቋረጥ");
    await user.click(within(panel).getByRole("button", { name: "Add downtime reason" }));
    expect(await within(panel).findByText("This name is already in use.")).toBeInTheDocument();
    await user.clear(within(panel).getByLabelText("Name in English"));
    await user.type(within(panel).getByLabelText("Name in English"), "Mould change");
    await user.click(within(panel).getByRole("button", { name: "Add downtime reason" }));
    await vi.waitFor(() => expect(sent(server, "POST", "/api/reasons")).toHaveLength(2));
    expect(sent(server, "POST", "/api/reasons")[1].body).toEqual({ kind: "downtime", name: "Mould change", name_am: "የኃይል መቋረጥ" });
  });

  it("retires a reason after a confirmation", async () => {
    const { server, user } = start("/reasons");
    await user.click(await screen.findByRole("button", { name: "Rename Splitting" }));
    const panel = await screen.findByRole("dialog");
    await user.click(within(panel).getByRole("button", { name: "Retire" }));
    const confirm = await screen.findByRole("alertdialog", { name: "Retire Splitting?" });
    await user.click(within(confirm).getByRole("button", { name: "Retire" }));
    await vi.waitFor(() => expect(sent(server, "PATCH", "/api/reasons/r3")).toHaveLength(1));
    expect(sent(server, "PATCH", "/api/reasons/r3")[0].body).toMatchObject({ active: false });
  });
});

describe("Stores", () => {
  it("lists the five fixed places and only renames them", async () => {
    const { server, user } = start("/stores");
    const raw = await screen.findByRole("button", { name: "Rename Raw material store" });
    expect(within(raw).getByText("Holds stock")).toBeInTheDocument();
    expect(within(screen.getByRole("button", { name: "Rename QC area" })).getByText("Not stock")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Add/ })).not.toBeInTheDocument();
    await user.click(raw);
    const panel = await screen.findByRole("dialog", { name: "Rename store" });
    expect(within(panel).queryByRole("button", { name: "Retire" })).not.toBeInTheDocument();
    await user.clear(within(panel).getByLabelText("Name in English"));
    await user.type(within(panel).getByLabelText("Name in English"), "Main raw material store");
    await user.click(within(panel).getByRole("button", { name: "Save changes" }));
    await vi.waitFor(() => expect(sent(server, "PATCH", "/api/locations/raw_store")).toHaveLength(1));
  });
});

describe("Employees", () => {
  it("lists people with their profession and account, and filters operators", async () => {
    const { user } = start("/employees");
    const dawit = await screen.findByRole("button", { name: "Open Dawit Alemu" });
    expect(within(dawit).getByText("dawit.alemu@example.com")).toBeInTheDocument();
    expect(within(screen.getByRole("button", { name: "Open Tesfaye Girma" })).getByText("No account")).toBeInTheDocument();
    expect(screen.queryByText("Kebede Ayele")).not.toBeInTheDocument(); // retired
    await user.click(screen.getByRole("button", { name: "No account" }));
    expect(screen.queryByRole("button", { name: "Open Dawit Alemu" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Hana Bekele" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retired" }));
    expect(screen.getByRole("button", { name: "Open Kebede Ayele" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "All" }));
    await user.type(screen.getByLabelText("Search by name or email"), "meron");
    expect(screen.getByRole("button", { name: "Open Meron Haile" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open Hana Bekele" })).not.toBeInTheDocument();
  });

  it("adds an operator without an account, and offers only free accounts", async () => {
    const { server, user } = start("/employees");
    await user.click(await screen.findByRole("button", { name: "Add employee" }));
    const panel = await screen.findByRole("dialog", { name: "Add employee" });
    const accounts = within(panel).getByLabelText("Sign-in account");
    await vi.waitFor(() => expect(within(accounts).getAllByRole("option").length).toBeGreaterThan(1));
    expect(within(accounts).queryByRole("option", { name: /dawit.alemu/ })).not.toBeInTheDocument(); // already linked
    expect(within(accounts).getByRole("option", { name: /rahel.teshome/ })).toBeInTheDocument();
    await user.type(within(panel).getByLabelText("Full name"), "Tigist Worku");
    await user.type(within(panel).getByLabelText("Name in Amharic script (optional)"), "ትዕግሥት ወርቁ");
    await user.click(within(panel).getByRole("button", { name: "Add employee" }));
    await vi.waitFor(() => expect(sent(server, "POST", "/api/employees")).toHaveLength(1));
    expect(sent(server, "POST", "/api/employees")[0].body).toEqual({ full_name: "Tigist Worku", name_am: "ትዕግሥት ወርቁ", profession_id: "pr1", user_id: null });
  });

  it("with no professions yet, Add employee leads to adding the first profession", async () => {
    const { server, user } = start("/employees", { setup: { professions: [], employees: [] } });
    expect(await screen.findByText("Add a profession first")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add employee" }));
    const panel = await screen.findByRole("dialog", { name: "Add profession" });
    await user.type(within(panel).getByLabelText("Name in English"), "Machine operator");
    await user.type(within(panel).getByLabelText("Name in Amharic"), "የማሽን ኦፕሬተር");
    await user.click(within(panel).getByRole("button", { name: "Add profession" }));
    await vi.waitFor(() => expect(sent(server, "POST", "/api/professions")).toHaveLength(1));
    await user.click(await screen.findByRole("tab", { name: /Employees/ }));
    await user.click(screen.getByRole("button", { name: "Add employee" }));
    expect(await screen.findByRole("dialog", { name: "Add employee" })).toBeInTheDocument();
  });

  it("adds a profession on its tab", async () => {
    const { server, user } = start("/employees?tab=professions");
    expect(await screen.findByText("3 employees")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add profession" }));
    const panel = await screen.findByRole("dialog", { name: "Add profession" });
    await user.type(within(panel).getByLabelText("Name in English"), "Recycling operator");
    await user.type(within(panel).getByLabelText("Name in Amharic"), "የመልሶ መጠቀሚያ ኦፕሬተር");
    await user.click(within(panel).getByRole("button", { name: "Add profession" }));
    await vi.waitFor(() => expect(sent(server, "POST", "/api/professions")).toHaveLength(1));
  });
});

describe("Settings", () => {
  it("shows the current values, checks them, and sends only what changed", async () => {
    const { server, user } = start("/settings");
    const rest = await screen.findByLabelText("Rest rotation interval");
    expect(rest).toHaveValue("60");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    const warn = screen.getByLabelText("Recipe warning tolerance");
    await user.clear(warn);
    await user.type(warn, "10");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("The warning tolerance must be lower than the critical one.")).toBeInTheDocument();
    expect(sent(server, "PATCH", "/api/settings")).toHaveLength(0);
    await user.clear(warn);
    await user.type(warn, "5");
    await user.clear(rest);
    await user.type(rest, "45");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Settings saved.")).toBeInTheDocument();
    expect(sent(server, "PATCH", "/api/settings")[0].body).toEqual({ rest_rotation_minutes: 45 });
  });

  it("refuses a value outside its range", async () => {
    const { server, user } = start("/settings");
    const attempts = await screen.findByLabelText("Failed attempts before a pause");
    await user.clear(attempts);
    await user.type(attempts, "0");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Enter a whole number from 1 to 50.")).toBeInTheDocument();
    expect(sent(server, "PATCH", "/api/settings")).toHaveLength(0);
  });
});
