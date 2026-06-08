import type { Locator, Page } from "playwright";
import type { Config } from "../types/config.js";

function findControls(page: Page, patterns: string[]): Locator {
  const pattern = new RegExp(patterns.map(escapeRegExp).join("|"));
  return page.getByRole("link", { name: pattern }).or(
    page.getByRole("button", { name: pattern }),
  );
}

export function findReceiptControls(page: Page, config: Config): Locator {
  return findControls(page, config.receiptLinkPatterns);
}

export function findDetailControls(page: Page, config: Config): Locator {
  return findControls(page, config.detailButtonPatterns);
}

export function findPrintControls(page: Page, config: Config): Locator {
  const pattern = new RegExp(config.printButtonPatterns.map(escapeRegExp).join("|"));
  return findControls(page, config.printButtonPatterns).or(page.getByText(pattern));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
