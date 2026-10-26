import { expect, test, type Page } from "@playwright/test";
import { ADMIN_ME, createFakeServer, type FakeOptions } from "../src/features/users/testing/fakeServer";

// Captures every page at the three checked sizes in both languages into
// frontend/screenshots/<page>-<lang>-<width>.png. Add new pages to PAGES.
// The API is mocked, so states such as "locked" are shown without a server.
const WIDTHS = [360, 768, 1280];
const LANGS = ["en", "am"];

const json = (status: number, body: unknown, headers: Record<string, string> = {}) => ({
  status,
  contentType: "application/json",
  headers,
  body: JSON.stringify(body),
});

async function signedOut(page: Page) {
  await page.route("**/api/auth/me", (r) => r.fulfill(json(401, { error: "unauthenticated" })));
}

/** Serves /api/* from the in-memory fake server, with the administrator signed in. */
async function signedInAdmin(page: Page, options: FakeOptions = {}, hold: string[] = []) {
  const server = createFakeServer(options);
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (hold.includes(`${req.method()} ${path}`)) return new Promise<void>(() => {}); // never answers: shows loading
    const reply = server.handle(req.method(), path, req.postData() ? JSON.parse(req.postData()!) : undefined);
    await route.fulfill({ status: reply.status, contentType: "application/json", headers: reply.headers, body: reply.body === undefined ? undefined : JSON.stringify(reply.body) });
  });
}

const ADMIN_MUST_CHANGE = { ...ADMIN_ME, must_change_password: true };

async function fillPasswords(page: Page, current: string, next: string, repeat: string) {
  await page.getByLabel(label("Current password", "የአሁኑ የይለፍ ቃል")).fill(current);
  await page.getByLabel(label("New password", "አዲስ የይለፍ ቃል")).fill(next);
  await page.getByLabel(label("Repeat the new password", "አዲሱን የይለፍ ቃል ይድገሙ")).fill(repeat);
  await page.locator("form button[type=submit]").click();
}

/** A regular expression matching the English or the Amharic label. */
const label = (en: string, am: string) => new RegExp(`^(${en}|${am})$`);

async function submitLogin(page: Page) {
  await page.getByLabel(/^(Email|ኢሜይል)$/).fill("abebe.kebede@example.com");
  await page.getByLabel(/^(Password|የይለፍ ቃል)$/).fill("factory-floor-2019");
  await page.locator("form button[type=submit]").click();
}

interface Case {
  name: string;
  path: string;
  /** Only these widths (default: all three). */
  widths?: number[];
  prepare: (page: Page) => Promise<void>;
  /** Runs after the page loads, to reach the state being captured. */
  act?: (page: Page) => Promise<void>;
}

const PAGES: Case[] = [
  { name: "login", path: "/", prepare: signedOut },
  {
    name: "login-invalid",
    path: "/",
    prepare: async (p) => {
      await signedOut(p);
      await p.route("**/api/auth/login", (r) => r.fulfill(json(401, { error: "invalid_credentials" })));
    },
    act: async (p) => {
      await submitLogin(p);
      await p.getByRole("alert").waitFor();
    },
  },
  {
    name: "login-locked",
    path: "/",
    prepare: async (p) => {
      await signedOut(p);
      await p.route("**/api/auth/login", (r) => r.fulfill(json(429, { error: "too_many_attempts" }, { "Retry-After": "840" })));
    },
    act: async (p) => {
      await submitLogin(p);
      await p.getByRole("alert").waitFor();
    },
  },
  {
    name: "login-offline",
    path: "/",
    prepare: async (p) => {
      await signedOut(p);
      await p.route("**/api/auth/login", (r) => r.abort("connectionrefused"));
    },
    act: async (p) => {
      await submitLogin(p);
      await p.getByRole("alert").waitFor();
    },
  },
  {
    name: "login-loading",
    path: "/",
    prepare: async (p) => {
      await signedOut(p);
      await p.route("**/api/auth/login", () => new Promise(() => {})); // never answers
    },
    act: async (p) => {
      await submitLogin(p);
      await p.locator("form button[aria-busy=true]").waitFor();
    },
  },
  // The users screens (administrator signed in; the API is the in-memory fake).
  { name: "users", path: "/users", prepare: (p) => signedInAdmin(p), act: (p) => p.getByRole("button", { name: /Meron Haile/ }).waitFor() },
  {
    name: "users-edit",
    path: "/users",
    prepare: (p) => signedInAdmin(p),
    act: async (p) => {
      await p.getByRole("button", { name: /Meron Haile/ }).click();
      await p.getByRole("dialog").waitFor();
    },
  },
  {
    name: "users-add",
    path: "/users",
    prepare: (p) => signedInAdmin(p),
    act: async (p) => {
      await p.getByRole("button", { name: /Meron Haile/ }).waitFor();
      await p.getByRole("button", { name: label("Add user", "ተጠቃሚ ጨምር") }).first().click();
      await p.getByRole("dialog").waitFor();
    },
  },
  {
    name: "users-deactivate",
    path: "/users",
    prepare: (p) => signedInAdmin(p),
    act: async (p) => {
      await p.getByRole("button", { name: /Yonas Bekele|ዮናስ/ }).click();
      await p.getByRole("button", { name: label("Deactivate", "አግድ") }).click();
      await p.getByRole("alertdialog").waitFor();
    },
  },
  {
    name: "users-last-admin",
    path: "/users",
    prepare: (p) => signedInAdmin(p),
    act: async (p) => {
      await p.getByRole("button", { name: /Abebe Kebede/ }).click();
      await p.getByRole("button", { name: label("Deactivate", "አግድ") }).click();
      await p.getByRole("alertdialog").getByRole("button", { name: label("Deactivate", "አግድ") }).click();
      await p.getByRole("alert").waitFor();
    },
  },
  {
    name: "users-password-shown-once",
    path: "/users",
    prepare: (p) => signedInAdmin(p),
    act: async (p) => {
      await p.getByRole("button", { name: /Meron Haile/ }).click();
      await p.getByRole("button", { name: label("Reset password…", "የይለፍ ቃል ዳግም አስጀምር…") }).click();
      await p.getByRole("button", { name: label("Generate", "አመንጭ") }).click();
      await p.getByRole("dialog").last().getByRole("button", { name: label("Reset password", "የይለፍ ቃል ዳግም አስጀምር") }).click();
      await p.getByRole("button", { name: label("Done", "ተጠናቀቀ") }).waitFor();
    },
  },
  { name: "users-empty", path: "/users", prepare: (p) => signedInAdmin(p, { users: [] }), act: (p) => p.getByRole("heading", { level: 2 }).waitFor() },
  { name: "users-loading", path: "/users", prepare: (p) => signedInAdmin(p, {}, ["GET /api/users"]), act: (p) => p.getByRole("status").waitFor() },
  { name: "users-error", path: "/users", prepare: (p) => signedInAdmin(p, { failing: { "GET /api/users": 500 } }), act: (p) => p.getByRole("alert").waitFor() },
  // The Account page and the first sign-in screen.
  { name: "account", path: "/account", prepare: (p) => signedInAdmin(p), act: (p) => p.getByRole("heading", { level: 2 }).first().waitFor() },
  {
    name: "account-wrong-password",
    path: "/account",
    prepare: (p) => signedInAdmin(p),
    act: async (p) => {
      await fillPasswords(p, "not my password", "a brand new password", "a brand new password");
      await p.locator("[aria-invalid=true]").first().waitFor();
    },
  },
  {
    name: "account-changed",
    path: "/account",
    prepare: (p) => signedInAdmin(p),
    act: async (p) => {
      await fillPasswords(p, "current-password-1", "a brand new password", "a brand new password");
      await p.getByRole("status").waitFor();
    },
  },
  { name: "first-sign-in", path: "/", prepare: (p) => signedInAdmin(p, { me: ADMIN_MUST_CHANGE }), act: (p) => p.getByRole("heading", { level: 2 }).first().waitFor() },
  {
    name: "first-sign-in-mismatch",
    path: "/",
    prepare: (p) => signedInAdmin(p, { me: ADMIN_MUST_CHANGE }),
    act: async (p) => {
      await fillPasswords(p, "current-password-1", "a brand new password", "a different password");
      await p.locator("[aria-invalid=true]").first().waitFor();
    },
  },
  // Master data: products, colours and materials.
  { name: "products", path: "/products", prepare: (p) => signedInAdmin(p), act: (p) => p.getByRole("button", { name: /Egg tray|የእንቁላል ትሪ/ }).waitFor() },
  {
    name: "products-add",
    path: "/products",
    prepare: (p) => signedInAdmin(p),
    act: async (p) => {
      await p.getByRole("button", { name: /Egg tray|የእንቁላል ትሪ/ }).waitFor();
      await p.getByRole("button", { name: label("Add product", "ምርት ጨምር") }).first().click();
      await p.getByRole("dialog").waitFor();
      await p.getByRole("button", { name: label("Add product", "ምርት ጨምር") }).last().click(); // shows the required-field messages
    },
  },
  { name: "product-details", path: "/products/p1", prepare: (p) => signedInAdmin(p), act: (p) => p.getByRole("tabpanel").waitFor() },
  { name: "product-colours", path: "/products/p2?tab=colours", prepare: (p) => signedInAdmin(p), act: (p) => p.getByRole("tabpanel").getByText(/Version 2|ስሪት 2/).waitFor() },
  {
    name: "colour-add",
    path: "/products/p2?tab=colours",
    prepare: (p) => signedInAdmin(p),
    act: async (p) => {
      await p.getByRole("tabpanel").getByText(/Version 2|ስሪት 2/).waitFor();
      await p.getByRole("button", { name: label("Add colour", "ቀለም ጨምር") }).first().click();
      await p.getByRole("dialog").waitFor();
    },
  },
  {
    name: "product-retire",
    path: "/products/p1",
    prepare: (p) => signedInAdmin(p),
    act: async (p) => {
      await p.getByRole("tabpanel").waitFor();
      await p.getByRole("button", { name: label("Retire product", "ምርቱን አቋርጥ") }).click();
      await p.getByRole("alertdialog").waitFor();
    },
  },
  { name: "products-empty", path: "/products", prepare: (p) => signedInAdmin(p, { products: [] }), act: (p) => p.getByRole("heading", { level: 2 }).waitFor() },
  { name: "materials", path: "/materials", prepare: (p) => signedInAdmin(p), act: (p) => p.getByRole("button", { name: /LLDPE M500026/ }).waitFor() },
  {
    name: "materials-add",
    path: "/materials",
    prepare: (p) => signedInAdmin(p),
    act: async (p) => {
      await p.getByRole("button", { name: /LLDPE M500026/ }).waitFor();
      await p.getByRole("button", { name: label("Add material", "ቁሳቁስ ጨምር") }).first().click();
      await p.getByRole("dialog").waitFor();
    },
  },
  {
    name: "materials-edit",
    path: "/materials",
    prepare: (p) => signedInAdmin(p),
    act: async (p) => {
      await p.getByRole("button", { name: /Blue masterbatch|ሰማያዊ ማስተርባች/ }).click();
      await p.getByRole("dialog").waitFor();
    },
  },
  { name: "materials-error", path: "/materials", prepare: (p) => signedInAdmin(p, { failing: { "GET /api/materials": 500 } }), act: (p) => p.getByRole("alert").waitFor() },
  // Recipes.
  { name: "recipe-view", path: "/colours/c1/recipe", prepare: (p) => signedInAdmin(p), act: (p) => p.getByText("LLDPE M500026").first().waitFor() },
  { name: "recipe-view-no-regrind", path: "/colours/c2/recipe", prepare: (p) => signedInAdmin(p), act: (p) => p.getByText("LLDPE M500026").first().waitFor() },
  { name: "recipe-empty", path: "/colours/c3/recipe", prepare: (p) => signedInAdmin(p), act: (p) => p.getByRole("button", { name: label("Start with an empty recipe", "በባዶ ቅመማ ቅመም ጀምር") }).waitFor() },
  {
    name: "recipe-edit",
    path: "/colours/c1/recipe?mode=edit",
    prepare: (p) => signedInAdmin(p),
    act: (p) => p.getByRole("button", { name: label("Save as version 4", "እንደ ስሪት 4 አስቀምጥ") }).waitFor(),
  },
  {
    name: "recipe-edit-errors",
    path: "/colours/c1/recipe?mode=edit",
    prepare: (p) => signedInAdmin(p),
    act: async (p) => {
      await p.getByRole("button", { name: label("Remove LLDPE M500026", "LLDPE M500026ን አስወግድ") }).click();
      await p.getByRole("button", { name: label("Remove Grey masterbatch", "ግራጫ ማስተርባችን አስወግድ") }).click();
      await p.getByRole("button", { name: label("Save as version 4", "እንደ ስሪት 4 አስቀምጥ") }).click();
      await p.getByText(label("Add at least one ingredient.", "ቢያንስ አንድ ንጥረ ነገር ጨምሩ።")).first().waitFor();
    },
  },
  {
    name: "recipe-history",
    path: "/colours/c1/recipe?mode=history",
    prepare: (p) => signedInAdmin(p),
    act: (p) => p.getByText("Masterbatch amount corrected after a weighing test.").waitFor(),
  },
  {
    name: "recipe-version",
    path: "/colours/c1/recipe?mode=history",
    prepare: (p) => signedInAdmin(p),
    act: async (p) => {
      await p.getByRole("button", { name: label("View version 1", "ስሪት 1 ይመልከቱ") }).click();
      await p.getByRole("dialog").getByText("LLDPE M500026").waitFor();
    },
  },
  {
    name: "users-menu",
    path: "/users",
    widths: [360, 768],
    prepare: (p) => signedInAdmin(p),
    act: async (p) => {
      await p.getByRole("button", { name: /Meron Haile/ }).waitFor();
      await p.getByRole("button", { name: label("Menu", "ማውጫ") }).click();
      await p.getByRole("dialog").waitFor();
    },
  },
];

for (const c of PAGES) {
  for (const lang of LANGS) {
    for (const width of c.widths ?? WIDTHS) {
      test(`${c.name} ${lang} ${width}px`, async ({ browser }) => {
        // A tall window, so overlays (panels, dialogs) cover the whole page like they do for a person scrolling.
        const height = /^(users|account|first-sign-in|products|product|colour|materials|recipe)/.test(c.name) ? 1100 : 800;
        const context = await browser.newContext({ viewport: { width, height } });
        await context.addInitScript((l) => localStorage.setItem("lang", l), lang);
        const page = await context.newPage();
        await c.prepare(page);
        await page.goto(c.path);
        await page.locator("form, main").first().waitFor();
        await page.evaluate(() => document.fonts.ready);
        await c.act?.(page);

        // Quality gate: nothing may scroll sideways.
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        // When it fails, name the elements that stick out, so the fix is quick.
        const culprits =
          overflow > 0
            ? await page.evaluate(() =>
                Array.from(document.querySelectorAll("body *"))
                  .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 0.5 && getComputedStyle(el).position !== "fixed")
                  .slice(0, 5)
                  .map((el) => `<${el.tagName.toLowerCase()} class="${String(el.getAttribute("class")).slice(0, 80)}"> right=${Math.round(el.getBoundingClientRect().right)}`),
              )
            : [];
        expect(overflow, `horizontal overflow in px; sticking out: ${culprits.join(" | ")}`).toBeLessThanOrEqual(0);

        await page.screenshot({ path: `screenshots/${c.name}-${lang}-${width}.png`, fullPage: true });
        await context.close();
      });
    }
  }
}
