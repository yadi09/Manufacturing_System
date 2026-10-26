import { expect, test, type Page } from "@playwright/test";

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

async function submitLogin(page: Page) {
  await page.getByLabel(/^(Email|ኢሜይል)$/).fill("abebe.kebede@example.com");
  await page.getByLabel(/^(Password|የይለፍ ቃል)$/).fill("factory-floor-2019");
  await page.locator("form button[type=submit]").click();
}

interface Case {
  name: string;
  path: string;
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
];

for (const c of PAGES) {
  for (const lang of LANGS) {
    for (const width of WIDTHS) {
      test(`${c.name} ${lang} ${width}px`, async ({ browser }) => {
        const context = await browser.newContext({ viewport: { width, height: 800 } });
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
