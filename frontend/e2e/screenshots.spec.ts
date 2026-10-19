import { test } from "@playwright/test";

// Captures every page at the three checked sizes in both languages into
// frontend/screenshots/<page>-<lang>-<width>.png. Add new pages to PAGES.
const PAGES = [{ name: "home", path: "/" }];
const WIDTHS = [360, 768, 1280];
const LANGS = ["en", "am"];

for (const page of PAGES) {
  for (const lang of LANGS) {
    for (const width of WIDTHS) {
      test(`${page.name} ${lang} ${width}px`, async ({ browser }) => {
        const context = await browser.newContext({ viewport: { width, height: 800 } });
        await context.addInitScript((l) => localStorage.setItem("lang", l), lang);
        const p = await context.newPage();
        await p.goto(page.path);
        await p.evaluate(() => document.fonts.ready);
        await p.screenshot({ path: `screenshots/${page.name}-${lang}-${width}.png`, fullPage: true });
        await context.close();
      });
    }
  }
}
