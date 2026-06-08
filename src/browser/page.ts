import type { Browser, Locator, Page } from "playwright";

export async function findAutomationPage(browser: Browser, startUrl: string): Promise<Page> {
  const existingPages = browser.contexts()
    .flatMap((context) => context.pages())
    .filter((candidate) => !candidate.isClosed());
  const jrKyushuPages = existingPages.filter((candidate) => candidate.url().startsWith("https://train.yoyaku.jrkyushu.co.jp/"));
  const page = jrKyushuPages.find((candidate) => candidate.url().includes("/rereserve/Reresv/list"))
    ?? jrKyushuPages.at(-1)
    ?? existingPages.at(-1)
    ?? await browser.contexts()[0].newPage();

  if (page.url() === "about:blank") {
    await page.goto(startUrl, { waitUntil: "domcontentloaded" });
  }
  return page;
}

export async function visibleControlNames(page: Page): Promise<string[]> {
  return page.locator('a, button, input[type="button"], input[type="submit"]').evaluateAll((elements) => {
    const names = elements
      .map((element) => {
        const input = element as HTMLInputElement;
        return input.value || element.textContent || element.getAttribute("aria-label") || "";
      })
      .map((name) => name.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    return [...new Set(names)].slice(0, 30);
  });
}

export async function clickMaybeNavigates(page: Page, control: Locator): Promise<Page> {
  const popupPromise = page.waitForEvent("popup", { timeout: 5_000 });
  const navigationPromise = page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 15_000 });

  await control.click();
  const popup = await popupPromise.catch(() => null);
  await navigationPromise.catch(() => null);

  if (popup) {
    await popup.waitForLoadState("domcontentloaded").catch(() => undefined);
    return popup;
  }
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
  return page;
}
