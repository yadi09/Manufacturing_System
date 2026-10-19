import { expect, test, type Page } from "@playwright/test";
import { createFakeServer, type FakeOptions } from "../src/features/users/testing/fakeServer";

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
        const height = c.name.startsWith("users") ? 1100 : 800;
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
        expect(overflow, "horizontal overflow in px").toBeLessThanOrEqual(0);

        await page.screenshot({ path: `screenshots/${c.name}-${lang}-${width}.png`, fullPage: true });
        await context.close();
      });
    }
  }
}
