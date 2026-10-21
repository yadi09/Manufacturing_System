// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../../App";
import i18n from "../../i18n";
import { ADMIN_ME, createFakeServer, fakeFetch, type FakeOptions } from "../users/testing/fakeServer";
import { EGG_VERSIONS } from "./testing/recipeFixtures";

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

const posts = (s: ReturnType<typeof createFakeServer>) => s.calls.filter((c) => c.method === "POST" && /\/recipe(\/versions)?$/.test(c.path));

beforeEach(async () => {
  localStorage.clear();
  await i18n.changeLanguage("en");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Recipe view", () => {
  it("shows the version in use with ingredients, regrind rules and tolerances", async () => {
    start("/colours/c1/recipe");
    expect(await screen.findByRole("heading", { level: 1, name: "Grey recipe" })).toBeInTheDocument();
    expect(screen.getByText("Version 3 · Active")).toBeInTheDocument();
    expect(screen.getByText(/set by dawit.alemu@example.com/)).toBeInTheDocument();
    expect(screen.getByText("LLDPE M500026")).toBeInTheDocument();
    expect(screen.getByText("Grey masterbatch")).toBeInTheDocument();
    expect(screen.getAllByText("g per piece").length).toBe(2);
    expect(screen.getByText("From Egg tray")).toBeInTheDocument();
    expect(screen.getByText("From Jar cover")).toBeInTheDocument();
    expect(screen.getAllByText("No maximum").length).toBe(2);
    expect(screen.getByText("Using the settings defaults")).toBeInTheDocument();
  });

  it("says plainly when regrind is not allowed and shows a recipe's own tolerances", async () => {
    start("/colours/c2/recipe");
    await screen.findByRole("heading", { level: 1, name: "Clear recipe" });
    expect(screen.getByText("Regrind is not allowed in this recipe")).toBeInTheDocument();
    expect(screen.getByText("Set for this recipe")).toBeInTheDocument();
    expect(screen.getAllByText("kg per kg").length).toBe(1);
  });

  it("links to the recipe from the product's colours", async () => {
    const { user } = start("/products/p2?tab=colours");
    await user.click(await screen.findByRole("link", { name: "Open recipe for Clear" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Clear recipe" })).toBeInTheDocument();
  });

  it("is in Amharic when the language is Amharic", async () => {
    await i18n.changeLanguage("am");
    start("/colours/c1/recipe");
    expect(await screen.findByRole("heading", { level: 1, name: "የግራጫ ቅመማ ቅመም" })).toBeInTheDocument();
    expect(screen.getByText("ግራጫ ማስተርባች")).toBeInTheDocument();
  });

  it("offers no edit button to someone who may only read", async () => {
    start("/colours/c1/recipe", { me: READER });
    await screen.findByRole("heading", { level: 1, name: "Grey recipe" });
    expect(screen.getByRole("button", { name: "History" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit as new version" })).not.toBeInTheDocument();
  });

  it("closes the page to someone without master data permission", async () => {
    start("/colours/c1/recipe", { me: { ...ADMIN_ME, permissions: [] } });
    expect(await screen.findByRole("heading", { level: 1, name: "Account" })).toBeInTheDocument();
  });
});

describe("Recipe history", () => {
  it("lists every version with reason and author, and opens an old one", async () => {
    const { user } = start("/colours/c1/recipe");
    await user.click(await screen.findByRole("button", { name: "History" }));
    expect(await screen.findByText("Masterbatch amount corrected after a weighing test.")).toBeInTheDocument();
    expect(screen.getByText("First recipe.")).toBeInTheDocument();
    expect(screen.getAllByText("Replaced").length).toBe(2);
    await user.click(screen.getByRole("button", { name: "View version 1" }));
    const dialog = await screen.findByRole("dialog", { name: "Version 1" });
    expect(await within(dialog).findByText("LLDPE M500026")).toBeInTheDocument();
    expect(within(dialog).getByText("Regrind is not allowed in this recipe")).toBeInTheDocument();
  });
});

describe("No recipe yet", () => {
  it("lets an administrator copy another colour's recipe, filled in, and save it", async () => {
    const { server, user } = start("/colours/c3/recipe");
    expect(await screen.findByText("No recipe for Blue yet")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Copy from"), "Jar cover, Clear");
    await user.click(screen.getByRole("button", { name: "Copy and edit" }));
    expect(await screen.findByRole("textbox", { name: "Quantity of LLDPE M500026" })).toHaveValue("1");
    expect(screen.getByText(/Copied from another colour/)).toBeInTheDocument();
    await user.type(screen.getByLabelText("Reason for this change"), "Same as clear.");
    await user.click(screen.getByRole("button", { name: "Save as version 1" }));
    expect(await screen.findByText("Version 1 saved and now active.")).toBeInTheDocument();
    const sent = posts(server)[0].body as { base_version: number; reason: string; lines: Array<{ item_id: string; qty: string }> };
    expect(sent.base_version).toBe(0);
    expect(sent.reason).toBe("Same as clear.");
    expect(sent.lines[0].item_id).toBe("m1");
  });

  it("starts empty and refuses to save without an ingredient or a reason", async () => {
    const { server, user } = start("/colours/c3/recipe");
    await user.click(await screen.findByRole("button", { name: "Start with an empty recipe" }));
    await user.click(await screen.findByRole("button", { name: "Save as version 1" }));
    expect(await screen.findByText("Add at least one ingredient.")).toBeInTheDocument();
    expect(screen.getByText("Say why you are changing the recipe.")).toBeInTheDocument();
    expect(posts(server)).toHaveLength(0);
  });

  it("tells a reader that an administrator has to add it", async () => {
    start("/colours/c3/recipe", { me: READER });
    expect(await screen.findByText("An administrator has to add this recipe.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start with an empty recipe" })).not.toBeInTheDocument();
  });
});

describe("Edit as new version", () => {
  async function openEditor() {
    const ctx = start("/colours/c1/recipe");
    await ctx.user.click(await screen.findByRole("button", { name: "Edit as new version" }));
    await screen.findByText("Editing · will be version 4");
    return ctx;
  }

  it("saves a changed quantity, a removed regrind rule and a maximum as version 4 with the reason", async () => {
    const { server, user } = await openEditor();
    const qty = screen.getByRole("textbox", { name: "Quantity of Grey masterbatch" });
    await user.clear(qty);
    await user.type(qty, "1.2");
    await user.click(screen.getByRole("button", { name: "Remove Jar cover" }));
    await user.type(screen.getByLabelText("Maximum blend (%)"), "20");
    await user.type(screen.getByLabelText("Reason for this change"), "More colour wanted.");
    await user.click(screen.getByRole("button", { name: "Save as version 4" }));
    expect(await screen.findByText("Version 4 saved and now active.")).toBeInTheDocument();
    expect(screen.getByText("New production uses it. Version 3 is kept in the history.")).toBeInTheDocument();
    const sent = posts(server)[0].body as { base_version: number; reason: string; lines: Array<{ item_id: string; qty: string; unit: string }>; regrind: Array<{ source_product_id: string; max_blend_pct: string | null }>; warn_pct: string | null };
    expect(sent.base_version).toBe(3);
    expect(sent.reason).toBe("More colour wanted.");
    expect(sent.lines.find((l) => l.item_id === "m2")).toMatchObject({ qty: "1.2", unit: "g" });
    expect(sent.regrind).toEqual([{ source_product_id: "p1", max_blend_pct: "20" }]);
    expect(sent.warn_pct).toBeNull(); // defaults untouched: not copied into the recipe
  });

  it("adds an ingredient from the materials not yet used", async () => {
    const { server, user } = await openEditor();
    await user.selectOptions(screen.getByRole("combobox", { name: "Add ingredient" }), "Blue masterbatch");
    await user.type(await screen.findByRole("textbox", { name: "Quantity of Blue masterbatch" }), "0.5");
    await user.type(screen.getByLabelText("Reason for this change"), "Add blue.");
    await user.click(screen.getByRole("button", { name: "Save as version 4" }));
    await screen.findByText("Version 4 saved and now active.");
    const sent = posts(server)[0].body as { lines: Array<{ item_id: string; qty: string }> };
    expect(sent.lines.map((l) => l.item_id)).toContain("m3");
  });

  it("rejects a bad quantity and a warning level above the critical level, sending nothing", async () => {
    const { server, user } = await openEditor();
    const qty = screen.getByRole("textbox", { name: "Quantity of LLDPE M500026" });
    await user.clear(qty);
    await user.type(qty, "0");
    await user.clear(screen.getByLabelText("Warning at (%)"));
    await user.type(screen.getByLabelText("Warning at (%)"), "12");
    await user.type(screen.getByLabelText("Reason for this change"), "x");
    await user.click(screen.getByRole("button", { name: "Save as version 4" }));
    expect(await screen.findByText("Enter a quantity above zero, up to 6 decimals.")).toBeInTheDocument();
    expect(screen.getByText("Warning must be lower than critical.")).toBeInTheDocument();
    expect(posts(server)).toHaveLength(0);
  });

  it("asks before throwing away changes", async () => {
    const { user } = await openEditor();
    await user.type(screen.getByLabelText("Reason for this change"), "typing");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Discard your changes?" });
    await user.click(within(dialog).getByRole("button", { name: "Keep editing" }));
    expect(screen.getByLabelText("Reason for this change")).toHaveValue("typing");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Discard changes" }));
    expect(await screen.findByText("Version 3 · Active")).toBeInTheDocument();
  });

  it("does not overwrite when someone else saved first, and offers to start from their version", async () => {
    const { server, user } = await openEditor();
    // Someone else saves version 4 while this page is open.
    const other = { ...EGG_VERSIONS[2], version: 4, created_by: "selam@example.com", reason: "Other change.", status: "active" as const };
    server.recipes.c1[2].status = "replaced";
    server.recipes.c1.push(other);
    await user.type(screen.getByLabelText("Reason for this change"), "My change.");
    await user.click(screen.getByRole("button", { name: "Save as version 4" }));
    expect(await screen.findByText(/selam@example.com saved version 4 first/)).toBeInTheDocument();
    expect(server.recipes.c1).toHaveLength(4); // nothing was added
    await user.click(screen.getByRole("button", { name: "Start again from version 4" }));
    expect(await screen.findByText("Editing · will be version 5")).toBeInTheDocument();
  });
});
