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

// 領収書ボタンを押して、最終的なPDFファイルを保存する。
// JR九州は「詳細画面 → 領収書中間画面 → 領収書表示タブ」のように段階を踏むため、
// intermediatePage が返った場合は、同じ処理を最大3回まで辿る。
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
    // 中間ページに到達したら、そのページ上の「領収書を表示」ボタンを次のクリック対象にする。
    const followUpControls = findReceiptControls(currentPage, config);
    if (await followUpControls.count() === 0) {
      break;
    }

    currentControl = followUpControls.first();
  }

  if (!result || result.type === "intermediatePage") {
    // どの画面で止まったか分かるように、URLと主なボタン名をエラーに含める。
    const currentUrl = currentPage.url();
    const visibleNames = await visibleControlNames(currentPage).catch(() => []);
    throw new Error(
      `領収書クリック後の変化を検出できませんでした。URL: ${page.url()} -> ${currentUrl} / 主なボタン: ${visibleNames.join(" / ")}`,
    );
  }

  if (result.type === "download") {
    // サイト側が直接ファイルダウンロードを発生させた場合の経路。
    await result.download.saveAs(targetPath);
    return;
  }

  if (result.type === "file") {
    // Edgeの一時ダウンロードディレクトリにファイルが落ちた場合の経路。
    await moveDownloadedFile(result.filePath, targetPath);
    return;
  }

  // 最終的に領収書ページが開いた場合は、印刷用PDFとして保存する。
  await saveReceiptPageAsPrintedPdf(result.receiptPage, targetPath, config);
  if (result.receiptPage !== page) {
    await result.receiptPage.close().catch(() => undefined);
  }
}

// 1回のクリックで起こり得る結果を並行して待つ。
// ダウンロード、別タブ、同一タブ遷移、一時ファイル生成のどれが起きても拾えるようにしている。
async function clickReceiptControlAndWait(
  page: Page,
  control: Locator,
  downloadsDirectory: string,
): Promise<ReceiptClickResult | null> {
  const beforeFiles = await downloadableFileSet(downloadsDirectory);
  const beforeUrl = page.url();
  const beforePages = new Set(page.context().pages());
  // クリック前の状態を覚えておき、クリック後に増えたファイルやタブだけを対象にする。
  const downloadPromise = page.waitForEvent("download", { timeout: 20_000 })
    .then((download) => ({ type: "download" as const, download }));
  const receiptPagePromise = waitForReceiptPageAfterClick(page, beforeUrl, beforePages, 15_000)
    .then((receiptPage) => ({ type: "receiptPage" as const, receiptPage }));
  const intermediatePagePromise = waitForIntermediateReceiptPageAfterClick(page, beforeUrl, 7_000)
    .then((intermediatePage) => ({ type: "intermediatePage" as const, page: intermediatePage }));
  const filePromise = waitForDownloadedFile(downloadsDirectory, beforeFiles, 25_000)
    .then((filePath) => ({ type: "file" as const, filePath }));

  await control.click();

  // 先に成功した経路を採用する。
  // どれも起きなかった場合は null にして、呼び出し元で画面状態付きのエラーにする。
  return firstSuccessful<ReceiptClickResult>([
    downloadPromise,
    receiptPagePromise,
    intermediatePagePromise,
    filePromise,
  ]).catch(() => null);
}

// Promise.any を薄く包んで、呼び出し側で「最初に成功した経路」を読みやすくする。
async function firstSuccessful<T>(promises: Array<Promise<T>>): Promise<T> {
  return Promise.any(promises);
}

// 領収書の本体ページが開くまで待つ。
// 新規タブで開く場合と、同一タブが /pc/reserve/{id} に遷移する場合の両方を扱う。
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
        // クリック前から存在していた別タブを誤検出しないよう、新規ページか同一ページのURL変化だけを見る。
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

// 領収書本体へ行く前の中間ページを待つ。
// このページに着いた場合は、さらに「領収書を表示」を押す必要がある。
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

// ChromiumのCDP経由で、現在表示中の領収書ページをPDF化する。
// Edgeの印刷プレビュー操作を自動化するより安定するため、この方式を採用している。
async function saveReceiptPageAsPrintedPdf(page: Page, targetPath: string, config: Config): Promise<void> {
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
  await runPrintButtonHandlers(page, config);

  await page.emulateMedia({ media: "print" });
  const cdpSession = await page.context().newCDPSession(page);
  try {
    // 手動で「Microsoft Print to PDF」を選んだPDFの見た目に寄せるため、
    // 背景印刷は無効にし、A4縦・標準的な余白で出力する。
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
    // CDPセッションや印刷メディア設定を残さないように戻す。
    await cdpSession.detach().catch(() => undefined);
    await page.emulateMedia({ media: null }).catch(() => undefined);
    await page.evaluate(() => window.dispatchEvent(new Event("afterprint"))).catch(() => undefined);
  }
}

// ページ側に印刷ボタン用のJavaScript処理がある場合に備え、一度クリックしておく。
// window.print はブラウザの印刷UIを開かないように差し替え、beforeprint だけ発火させる。
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

// 直接PDFやHTMLが別画面で開いた場合に備えた予備経路。
// 現在の主経路ではCDPの printToPDF を使うが、古い挙動の受け皿として残している。
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
