import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { Locator, Page } from "playwright";
import { visibleControlNames } from "../browser/page.js";
import {
  downloadableFileSet,
  moveDownloadedFile,
  waitForDownloadedFile,
} from "../files/fileSystem.js";
import type { Config } from "../types/config.js";
import type { ReceiptClickResult } from "../types/receipt.js";
import { findPrintControls, findReceiptControls } from "./locators.js";
import { isIntermediateReceiptPageUrl, isReceiptPageUrl } from "./urls.js";

export async function saveReceipt(
  page: Page,
  control: Locator,
  targetPath: string,
  downloadsDirectory: string,
  config: Config,
): Promise<void> {
  await mkdir(path.dirname(targetPath), { recursive: true });

  let currentPage = page;
  let currentControl = control;
  let result: ReceiptClickResult | null = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    result = await clickReceiptControlAndWait(currentPage, currentControl, downloadsDirectory);
    if (!result || result.type !== "intermediatePage") {
      break;
    }

    currentPage = result.page;
    const followUpControls = findReceiptControls(currentPage, config);
    if (await followUpControls.count() === 0) {
      break;
    }

    currentControl = followUpControls.first();
  }

  if (!result || result.type === "intermediatePage") {
    const currentUrl = currentPage.url();
    const visibleNames = await visibleControlNames(currentPage).catch(() => []);
    throw new Error(
      `領収書クリック後の変化を検出できませんでした。URL: ${page.url()} -> ${currentUrl} / 主なボタン: ${visibleNames.join(" / ")}`,
    );
  }

  if (result.type === "download") {
    await result.download.saveAs(targetPath);
    return;
  }

  if (result.type === "file") {
    await moveDownloadedFile(result.filePath, targetPath);
    return;
  }

  await saveReceiptPageAsPrintedPdf(result.receiptPage, targetPath, config);
  if (result.receiptPage !== page) {
    await result.receiptPage.close().catch(() => undefined);
  }
}

async function clickReceiptControlAndWait(
  page: Page,
  control: Locator,
  downloadsDirectory: string,
): Promise<ReceiptClickResult | null> {
  const beforeFiles = await downloadableFileSet(downloadsDirectory);
  const beforeUrl = page.url();
  const beforePages = new Set(page.context().pages());
  const downloadPromise = page.waitForEvent("download", { timeout: 20_000 })
    .then((download) => ({ type: "download" as const, download }));
  const receiptPagePromise = waitForReceiptPageAfterClick(page, beforeUrl, beforePages, 15_000)
    .then((receiptPage) => ({ type: "receiptPage" as const, receiptPage }));
  const intermediatePagePromise = waitForIntermediateReceiptPageAfterClick(page, beforeUrl, 7_000)
    .then((intermediatePage) => ({ type: "intermediatePage" as const, page: intermediatePage }));
  const filePromise = waitForDownloadedFile(downloadsDirectory, beforeFiles, 25_000)
    .then((filePath) => ({ type: "file" as const, filePath }));

  await control.click();

  return firstSuccessful<ReceiptClickResult>([
    downloadPromise,
    receiptPagePromise,
    intermediatePagePromise,
    filePromise,
  ]).catch(() => null);
}

async function firstSuccessful<T>(promises: Array<Promise<T>>): Promise<T> {
  return Promise.any(promises);
}

async function waitForReceiptPageAfterClick(
  sourcePage: Page,
  beforeUrl: string,
  beforePages: Set<Page>,
  timeoutMs: number,
): Promise<Page> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const receiptPage = sourcePage.context().pages()
      .filter((candidate) => !candidate.isClosed())
      .find((candidate) => {
        const isNewPage = !beforePages.has(candidate);
        const isSourcePageAfterNavigation = candidate === sourcePage && candidate.url() !== beforeUrl;
        return (isNewPage || isSourcePageAfterNavigation) && isReceiptPageUrl(candidate.url());
      });

    if (receiptPage) {
      await receiptPage.waitForLoadState("domcontentloaded").catch(() => undefined);
      return receiptPage;
    }

    await delay(250);
  }

  throw new Error("領収書ページが開かれませんでした。");
}

async function waitForIntermediateReceiptPageAfterClick(
  page: Page,
  beforeUrl: string,
  timeoutMs: number,
): Promise<Page> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (!page.isClosed() && page.url() !== beforeUrl && isIntermediateReceiptPageUrl(page.url())) {
      await page.waitForLoadState("domcontentloaded").catch(() => undefined);
      return page;
    }

    await delay(250);
  }

  throw new Error("領収書の中間ページが開かれませんでした。");
}

async function saveReceiptPageAsPrintedPdf(page: Page, targetPath: string, config: Config): Promise<void> {
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
  await runPrintButtonHandlers(page, config);

  await page.emulateMedia({ media: "print" });
  const cdpSession = await page.context().newCDPSession(page);
  try {
    const result = await cdpSession.send("Page.printToPDF", {
      displayHeaderFooter: true,
      landscape: false,
      marginBottom: 0.4,
      marginLeft: 0.35,
      marginRight: 0.35,
      marginTop: 0.4,
      paperHeight: 11.69,
      paperWidth: 8.27,
      preferCSSPageSize: false,
      printBackground: false,
    });
    await writeFile(targetPath, Buffer.from(result.data, "base64"));
  } finally {
    await cdpSession.detach().catch(() => undefined);
    await page.emulateMedia({ media: null }).catch(() => undefined);
    await page.evaluate(() => window.dispatchEvent(new Event("afterprint"))).catch(() => undefined);
  }
}

async function runPrintButtonHandlers(page: Page, config: Config): Promise<void> {
  const printControls = findPrintControls(page, config);
  if (await printControls.count() === 0) {
    const visibleNames = await visibleControlNames(page).catch(() => []);
    console.log(`印刷ボタンが見つかりません。印刷用PDF化だけ実行します。主なボタン/リンク: ${visibleNames.join(" / ")}`);
    return;
  }

  await page.evaluate(() => {
    const windowWithPrintFlag = window as Window & { __jrKyushuPrintCalled?: boolean };
    windowWithPrintFlag.__jrKyushuPrintCalled = false;
    window.print = () => {
      windowWithPrintFlag.__jrKyushuPrintCalled = true;
      window.dispatchEvent(new Event("beforeprint"));
    };
  });

  await printControls.first().click({ timeout: 5_000 }).catch(() => undefined);
  await page.waitForTimeout(500);
}

async function savePopupAsReceipt(popup: Page, targetPath: string): Promise<void> {
  await popup.waitForLoadState("domcontentloaded");
  const response = await popup.request.get(popup.url());
  if (!response.ok()) {
    throw new Error(`領収書画面の取得に失敗しました: ${response.status()}`);
  }

  const contentType = response.headers()["content-type"] ?? "";
  if (contentType.includes("application/pdf")) {
    await writeFile(targetPath, await response.body());
  } else {
    await popup.pdf({ path: targetPath, format: "A4", printBackground: false });
  }
  await popup.close();
}
