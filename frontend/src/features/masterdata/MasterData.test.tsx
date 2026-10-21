// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../../App";
import i18n from "../../i18n";
import { ADMIN_ME, createFakeServer, fakeFetch, type FakeOptions } from "../users/testing/fakeServer";
import { PRODUCTS } from "./testing/masterFixtures";
import type { Product } from "./api";

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

const writes = (s: ReturnType<typeof createFakeServer>, method: string, prefix: string) => s.calls.filter((c) => c.method === method && c.path.startsWith(prefix));

beforeEach(async () => {
  localStorage.clear();
  await i18n.changeLanguage("en");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("menu", () => {
  it("shows Master data with Products and Materials to people who may read it, and not to others", async () => {
    start("/account");
    await screen.findByRole("heading", { level: 1, name: "Account" });
    expect(screen.getByText("Master data")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Products" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Materials" })).toBeInTheDocument();
    cleanup();

    start("/products", { me: { ...ADMIN_ME, permissions: [] } });
    await screen.findByRole("heading", { level: 1, name: "Account" }); // sent away: no permission
    expect(screen.queryByRole("link", { name: "Products" })).not.toBeInTheDocument();
    expect(screen.queryByText("Master data")).not.toBeInTheDocument();
  });
});

describe("Materials", () => {
  it("lists every material with its kind, bag size and use, in both languages", async () => {
    start("/materials");
    expect(await screen.findByRole("heading", { level: 1, name: "Materials" })).toBeInTheDocument();
    expect(await screen.findByText("4 materials")).toBeInTheDocument();
    const lldpe = screen.getByRole("button", { name: "Open LLDPE M500026" });
    expect(within(lldpe).getByText("Raw material")).toBeInTheDocument();
    expect(within(lldpe).getByText("25 kg")).toBeInTheDocument();
    expect(within(lldpe).getByText("Used in 3 recipes")).toBeInTheDocument();
    expect(within(screen.getByRole("button", { name: "Open Grey masterbatch" })).getByText("ግራጫ ማስተርባች")).toBeInTheDocument(); // the other language is always visible
    expect(within(screen.getByRole("button", { name: "Open LLDPE M500040" })).getByText("Not used in any recipe")).toBeInTheDocument();
    expect(screen.getByText(/created automatically for every product, colour and regrind source/)).toBeInTheDocument();
  });

  it("shows the Amharic name first when the language is Amharic", async () => {
    await i18n.changeLanguage("am");
    start("/materials");
    expect(await screen.findByRole("heading", { level: 1, name: "ቁሳቁሶች" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "ግራጫ ማስተርባችን ክፈት" })).toBeInTheDocument();
  });

  it("adds a material, checking the form first", async () => {
    const { server, user } = start("/materials");
    await screen.findByText("4 materials");
    await user.click(screen.getByRole("button", { name: "Add material" }));
    const panel = await screen.findByRole("dialog");

    await user.click(within(panel).getByRole("button", { name: "Add material" }));
    expect(within(panel).getByText("Enter the name in English.")).toBeInTheDocument();
    expect(within(panel).getByText("Enter the name in Amharic.")).toBeInTheDocument();
    expect(writes(server, "POST", "/api/materials")).toHaveLength(0);

    await user.type(within(panel).getByLabelText("Name in English"), "Black masterbatch");
    await user.type(within(panel).getByLabelText("Name in Amharic"), "ጥቁር ማስተርባች");
    await user.click(within(panel).getByRole("radio", { name: "Additive" }));
    await user.type(within(panel).getByLabelText("Bag size"), "-5");
    await user.click(within(panel).getByRole("button", { name: "Add material" }));
    expect(within(panel).getByText("Enter a number above zero, such as 25 or 0.5.")).toBeInTheDocument();
    expect(writes(server, "POST", "/api/materials")).toHaveLength(0);

    await user.clear(within(panel).getByLabelText("Bag size"));
    await user.type(within(panel).getByLabelText("Bag size"), "25");
    await user.click(within(panel).getByRole("button", { name: "Add material" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(writes(server, "POST", "/api/materials")[0].body).toEqual({ name: "Black masterbatch", name_am: "ጥቁር ማስተርባች", bag_qty: "25", kind: "additive", unit: "kg" });
    expect(await screen.findByText("5 materials")).toBeInTheDocument();
  });

  it("refuses a name that is already used", async () => {
    const { user } = start("/materials");
    await screen.findByText("4 materials");
    await user.click(screen.getByRole("button", { name: "Add material" }));
    const panel = await screen.findByRole("dialog");
    await user.type(within(panel).getByLabelText("Name in English"), "lldpe m500026");
    await user.type(within(panel).getByLabelText("Name in Amharic"), "x");
    await user.click(within(panel).getByRole("button", { name: "Add material" }));
    expect(await within(panel).findByText("This name is already in use.")).toBeInTheDocument();
    expect(within(panel).getByLabelText("Name in English")).toHaveAttribute("aria-invalid", "true");
  });

  it("edits a material: the kind is locked and Save waits for a change", async () => {
    const { server, user } = start("/materials");
    await user.click(await screen.findByRole("button", { name: "Open Blue masterbatch" }));
    const panel = await screen.findByRole("dialog");
    expect(within(panel).getByRole("radio", { name: "Additive" })).toBeDisabled();
    expect(within(panel).getByText("The kind cannot be changed after the material is added.")).toBeInTheDocument();
    const save = within(panel).getByRole("button", { name: "Save changes" });
    expect(save).toBeDisabled();
    await user.clear(within(panel).getByLabelText("Bag size"));
    await user.type(within(panel).getByLabelText("Bag size"), "20");
    await user.click(save);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(writes(server, "PATCH", "/api/materials/m3")[0].body).toMatchObject({ name: "Blue masterbatch", bag_qty: "20" });
    expect(within(await screen.findByRole("button", { name: "Open Blue masterbatch" })).getByText("20 kg")).toBeInTheDocument();
  });

  it("retiring asks first, keeps the material in the list and offers to bring it back", async () => {
    const { server, user } = start("/materials");
    await user.click(await screen.findByRole("button", { name: "Open LLDPE M500040" }));
    await user.click(await screen.findByRole("button", { name: "Retire" }));
    const confirm = await screen.findByRole("alertdialog");
    expect(within(confirm).getByText("Retire LLDPE M500040?")).toBeInTheDocument();
    expect(within(confirm).getByRole("button", { name: "Cancel" })).toHaveFocus();
    expect(writes(server, "PATCH", "/api/materials")).toHaveLength(0);
    await user.click(within(confirm).getByRole("button", { name: "Retire" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(writes(server, "PATCH", "/api/materials/m4")[0].body).toMatchObject({ active: false });
    const row = await screen.findByRole("button", { name: "Open LLDPE M500040" });
    expect(within(row).getByText("Retired")).toBeInTheDocument();

    await user.click(row);
    await user.click(await screen.findByRole("button", { name: "Reactivate" })); // no dialog needed
    await waitFor(() => expect(writes(server, "PATCH", "/api/materials/m4")).toHaveLength(2));
    expect(writes(server, "PATCH", "/api/materials/m4")[1].body).toMatchObject({ active: true });
  });

  it("someone who may only read sees the list but cannot change it", async () => {
    start("/materials", { me: READER });
    await screen.findByText("4 materials");
    expect(screen.queryByRole("button", { name: "Add material" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open LLDPE M500026" })).not.toBeInTheDocument();
    expect(screen.getAllByText("LLDPE M500026").length).toBeGreaterThan(0);
  });

  it("empty and failing lists", async () => {
    start("/materials", { materials: [] });
    expect(await screen.findByText("No materials yet")).toBeInTheDocument();
    cleanup();
    start("/materials", { failing: { "GET /api/materials": 500 } });
    expect(await screen.findByText("Could not load the list.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});

describe("Products", () => {
  it("lists products with unit, package, colours and the count", async () => {
    start("/products");
    expect(await screen.findByRole("heading", { level: 1, name: "Products" })).toBeInTheDocument();
    expect(await screen.findByText("2 products · 3 colours")).toBeInTheDocument();
    const egg = screen.getByRole("button", { name: "Open Egg tray" });
    expect(within(egg).getByText("30 pieces")).toBeInTheDocument();
    expect(within(egg).getByText("Grey")).toBeInTheDocument();
    const jar = screen.getByRole("button", { name: "Open Jar cover" });
    expect(within(jar).getByText("20 kg bag")).toBeInTheDocument();
    expect(within(jar).getByText("Clear")).toBeInTheDocument();
    expect(within(jar).getByText("Blue")).toBeInTheDocument();
    expect(within(jar).getByText("የጀሪካን ክዳን")).toBeInTheDocument();
  });

  it("adds a product: both names, the unit and the package are required, then it opens on its Colours tab", async () => {
    const { server, user } = start("/products");
    await screen.findByText("2 products · 3 colours");
    await user.click(screen.getByRole("button", { name: "Add product" }));
    const panel = await screen.findByRole("dialog");

    await user.click(within(panel).getByRole("button", { name: "Add product" }));
    expect(within(panel).getByText("Enter the name in English.")).toBeInTheDocument();
    expect(within(panel).getByText("Enter how many pieces are in one package.")).toBeInTheDocument();
    await user.click(within(panel).getByRole("radio", { name: "Kilogram" }));
    await user.click(within(panel).getByRole("button", { name: "Add product" }));
    expect(within(panel).getByText("Enter how many kg are in one bag.")).toBeInTheDocument(); // the message follows the unit
    expect(writes(server, "POST", "/api/products")).toHaveLength(0);

    await user.type(within(panel).getByLabelText("Name in English"), "Bucket lid");
    await user.type(within(panel).getByLabelText("Name in Amharic"), "የባልዲ ክዳን");
    await user.type(within(panel).getByLabelText("One package holds"), "10");
    await user.click(within(panel).getByRole("button", { name: "Add product" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Bucket lid" })).toBeInTheDocument();
    expect(writes(server, "POST", "/api/products")[0].body).toEqual({ name: "Bucket lid", name_am: "የባልዲ ክዳን", sale_unit: "kg", package_qty: "10", weight_per_piece_g: null });
    expect(screen.getByRole("tab", { name: "Colours and recipes · 0" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("No colours yet")).toBeInTheDocument();
  });

  it("refuses a product name that is already used", async () => {
    const { user } = start("/products");
    await screen.findByText("2 products · 3 colours");
    await user.click(screen.getByRole("button", { name: "Add product" }));
    const panel = await screen.findByRole("dialog");
    await user.type(within(panel).getByLabelText("Name in English"), "EGG TRAY");
    await user.type(within(panel).getByLabelText("Name in Amharic"), "x");
    await user.type(within(panel).getByLabelText("One package holds"), "30");
    await user.click(within(panel).getByRole("button", { name: "Add product" }));
    expect(await within(panel).findByText("This name is already in use.")).toBeInTheDocument();
  });

  it("product details: the unit is locked once a recipe exists, and saving changes only what changed", async () => {
    const { server, user } = start("/products/p2");
    expect(await screen.findByRole("heading", { level: 1, name: "Jar cover" })).toBeInTheDocument();
    expect(screen.getByText("20 kg bag · Kilogram")).toBeInTheDocument();
    expect(screen.getByText("Fixed once a recipe exists, so quantities can never be mixed up.")).toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Weight of one piece/)).toHaveValue("8");

    const save = screen.getByRole("button", { name: "Save changes" });
    expect(save).toBeDisabled();
    await user.clear(screen.getByLabelText("One package holds"));
    await user.type(screen.getByLabelText("One package holds"), "25");
    await user.click(save);
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
    expect(writes(server, "PATCH", "/api/products/p2")[0].body).toEqual({ name: "Jar cover", name_am: "የጀሪካን ክዳን", sale_unit: "kg", package_qty: "25", weight_per_piece_g: "8", active: true });
  });

  it("while no recipe exists the unit can still be chosen", async () => {
    const fresh: Product[] = [{ ...PRODUCTS[0], colours: [{ ...PRODUCTS[0].colours[0], active_version: null }] }];
    const { server, user } = start("/products/p1", { products: fresh });
    await screen.findByRole("heading", { level: 1, name: "Egg tray" });
    await user.click(screen.getByRole("radio", { name: "Kilogram" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(writes(server, "PATCH", "/api/products/p1")).toHaveLength(1));
    expect(writes(server, "PATCH", "/api/products/p1")[0].body).toMatchObject({ sale_unit: "kg" });
  });

  it("checks quantities and duplicate names on the details form", async () => {
    const { server, user } = start("/products/p1");
    await screen.findByRole("heading", { level: 1, name: "Egg tray" });
    await user.clear(screen.getByLabelText("One package holds"));
    await user.type(screen.getByLabelText("One package holds"), "0");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(screen.getByText("Enter how many pieces are in one package.")).toBeInTheDocument();
    expect(writes(server, "PATCH", "/api/products")).toHaveLength(0);

    await user.clear(screen.getByLabelText("One package holds"));
    await user.type(screen.getByLabelText("One package holds"), "30");
    await user.clear(screen.getByLabelText("Name in English"));
    await user.type(screen.getByLabelText("Name in English"), "jar cover");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("This name is already in use.")).toBeInTheDocument();
  });

  it("Cancel puts back what was there", async () => {
    const { user } = start("/products/p1");
    await screen.findByRole("heading", { level: 1, name: "Egg tray" });
    await user.clear(screen.getByLabelText("Name in English"));
    await user.type(screen.getByLabelText("Name in English"), "Something else");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByLabelText("Name in English")).toHaveValue("Egg tray");
  });

  it("retiring a product asks first", async () => {
    const { server, user } = start("/products/p1");
    await screen.findByRole("heading", { level: 1, name: "Egg tray" });
    await user.click(screen.getByRole("button", { name: "Retire product" }));
    const confirm = await screen.findByRole("alertdialog");
    expect(within(confirm).getByRole("button", { name: "Cancel" })).toHaveFocus();
    await user.click(within(confirm).getByRole("button", { name: "Retire product" }));
    await waitFor(() => expect(writes(server, "PATCH", "/api/products/p1")[0].body).toMatchObject({ active: false }));
    expect(await screen.findByText("This product is retired.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reactivate" })).toBeInTheDocument();
  });

  it("an unknown product says so and offers the way back", async () => {
    start("/products/nope");
    expect(await screen.findByText("This product no longer exists.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to products" })).toHaveAttribute("href", "/products");
  });

  it("someone who may only read cannot edit anything", async () => {
    start("/products/p1", { me: READER });
    await screen.findByRole("heading", { level: 1, name: "Egg tray" });
    expect(screen.getByLabelText("Name in English")).toHaveAttribute("readonly");
    expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retire product" })).not.toBeInTheDocument();
    cleanup();
    start("/products", { me: READER });
    await screen.findByText("2 products · 3 colours");
    expect(screen.queryByRole("button", { name: "Add product" })).not.toBeInTheDocument();
  });
});

describe("Colours", () => {
  it("shows each colour with whether it has a recipe", async () => {
    const { user } = start("/products/p2");
    await screen.findByRole("heading", { level: 1, name: "Jar cover" });
    await user.click(screen.getByRole("tab", { name: "Colours and recipes · 2" }));
    expect(screen.getByText("Version 2 · in use")).toBeInTheDocument();
    expect(screen.getByText("No recipe yet")).toBeInTheDocument();
    expect(window.location.search).toBe("?tab=colours");
  });

  it("tabs follow the keyboard", async () => {
    const { user } = start("/products/p2");
    await screen.findByRole("heading", { level: 1, name: "Jar cover" });
    screen.getByRole("tab", { name: "Details" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Colours and recipes · 2" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Colours and recipes · 2" })).toHaveFocus();
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "Details" })).toHaveAttribute("aria-selected", "true");
  });

  it("adds, renames and retires a colour", async () => {
    const { server, user } = start("/products/p2?tab=colours");
    await screen.findByRole("heading", { level: 1, name: "Jar cover" });

    await user.click(screen.getByRole("button", { name: "Add colour" }));
    let panel = await screen.findByRole("dialog");
    await user.type(within(panel).getByLabelText("Name in English"), "Green");
    await user.type(within(panel).getByLabelText("Name in Amharic"), "አረንጓዴ");
    await user.click(within(panel).getByRole("button", { name: "Add colour" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(writes(server, "POST", "/api/products/p2/colours")[0].body).toEqual({ name: "Green", name_am: "አረንጓዴ" });
    expect(await screen.findByText("Green")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Rename Blue" }));
    panel = await screen.findByRole("dialog");
    await user.clear(within(panel).getByLabelText("Name in English"));
    await user.type(within(panel).getByLabelText("Name in English"), "Dark blue");
    await user.click(within(panel).getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Dark blue")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Rename Green" }));
    panel = await screen.findByRole("dialog");
    await user.click(within(panel).getByRole("button", { name: "Retire" }));
    const confirm = await screen.findByRole("alertdialog");
    expect(within(confirm).getByText("Retire Green?")).toBeInTheDocument();
    expect(within(confirm).getByText(/Existing orders, stock and history keep it/)).toBeInTheDocument();
    await user.click(within(confirm).getByRole("button", { name: "Retire" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await screen.findAllByText("Retired")).not.toHaveLength(0);
  });

  it("refuses a colour name already used on this product", async () => {
    const { user } = start("/products/p2?tab=colours");
    await screen.findByRole("heading", { level: 1, name: "Jar cover" });
    await user.click(screen.getByRole("button", { name: "Add colour" }));
    const panel = await screen.findByRole("dialog");
    await user.type(within(panel).getByLabelText("Name in English"), "clear");
    await user.type(within(panel).getByLabelText("Name in Amharic"), "ግልጽ");
    await user.click(within(panel).getByRole("button", { name: "Add colour" }));
    expect(await within(panel).findByText("This name is already in use.")).toBeInTheDocument();
  });
});

describe("Amharic", () => {
  it("the product list and details read in Amharic", async () => {
    await i18n.changeLanguage("am");
    start("/products");
    expect(await screen.findByRole("heading", { level: 1, name: "ምርቶች" })).toBeInTheDocument();
    expect(await screen.findByText("2 ምርቶች · 3 ቀለሞች")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "የጀሪካን ክዳንን ክፈት" })).toBeInTheDocument();
  });
});
