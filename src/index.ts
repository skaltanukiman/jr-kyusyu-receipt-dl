import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, type Browser, type Download, type Locator, type Page } from "playwright";

type Config = {
  startUrl: string;
  downloadDirectory: string;
  fileNameTemplate: string;
  receiptLinkPatterns: string[];
  detailButtonPatterns: string[];
  printButtonPatterns: string[];
  maxReceipts: number;
  edgeExecutablePath?: string;
  startupTimeoutMs: number;
};

type BrowserSession = {
  browser: Browser;
  downloadsDirectory: string;
  edgeProcess: ChildProcess;
  page: Page;
  profileDirectory: string;
};

type RunArgs = {
  dryRun: boolean;
};

type ReceiptClickResult =
  | { type: "download"; download: Download }
  | { type: "file"; filePath: string }
  | { type: "receiptPage"; receiptPage: Page }
  | { type: "intermediatePage"; page: Page };

const defaultConfig: Config = {
  startUrl: "https://train.yoyaku.jrkyushu.co.jp/jr/login",
  downloadDirectory: "./downloads",
  fileNameTemplate: "JR九州_{year}{month}_{index}.pdf",
  receiptLinkPatterns: ["領収書", "領収書を表示", "領収書表示"],
  detailButtonPatterns: ["詳細"],
  printButtonPatterns: ["印刷"],
  maxReceipts: 100,
  startupTimeoutMs: 30_000,
};

const root = process.cwd();

async function loadConfig(): Promise<Config> {
  const configPath = path.resolve(root, "config.json");
  if (!existsSync(configPath)) {
    return defaultConfig;
  }

  const rawConfig = await readFile(configPath, "utf8");
  const value = JSON.parse(rawConfig.replace(/^\uFEFF/, "")) as Partial<Config> & {
    browserChannel?: string;
    listUrl?: string;
  };

  return {
    ...defaultConfig,
    ...value,
    startUrl: value.startUrl ?? value.listUrl ?? defaultConfig.startUrl,
  };
}

function previousMonth(): { year: string; month: string } {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return {
    year: String(date.getFullYear()),
    month: String(date.getMonth() + 1).padStart(2, "0"),
  };
}

function formatFileName(template: string, index: number): string {
  const { year, month } = previousMonth();
  return template
    .replaceAll("{year}", year)
    .replaceAll("{month}", month)
    .replaceAll("{index}", String(index).padStart(2, "0"));
}

function parseArgs(): RunArgs {
  if (process.argv.includes("--setup")) {
    throw new Error("--setup は廃止しました。安全寄り運用では毎回手動ログインします。");
  }

  return {
    dryRun: process.argv.includes("--dry-run"),
  };
}

async function openBrowserSession(config: Config): Promise<BrowserSession> {
  const edgeExecutablePath = findEdgeExecutable(config);
  const downloadsDirectory = await mkdtemp(path.join(tmpdir(), "jr-kyushu-downloads-"));
  const profileDirectory = await mkdtemp(path.join(tmpdir(), "jr-kyushu-edge-"));
  const port = await findFreePort();
  const endpoint = `http://127.0.0.1:${port}`;

  const edgeProcess = spawn(edgeExecutablePath, [
    `--remote-debugging-port=${port}`,
    "--remote-debugging-address=127.0.0.1",
    `--user-data-dir=${profileDirectory}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-default-apps",
    "--start-maximized",
    "--new-window",
    config.startUrl,
  ], {
    stdio: "ignore",
  });

  try {
    await waitForCdp(endpoint, config.startupTimeoutMs);
    const browser = await chromium.connectOverCDP(endpoint);
    const page = await findAutomationPage(browser, config.startUrl);
    await configureDownloads(page, downloadsDirectory);
    return { browser, downloadsDirectory, edgeProcess, page, profileDirectory };
  } catch (error) {
    edgeProcess.kill();
    await rm(downloadsDirectory, { recursive: true, force: true });
    await rm(profileDirectory, { recursive: true, force: true });
    throw error;
  }
}

function findEdgeExecutable(config: Config): string {
  if (config.edgeExecutablePath) {
    if (!existsSync(config.edgeExecutablePath)) {
      throw new Error(`Edge が見つかりません: ${config.edgeExecutablePath}`);
    }
    return config.edgeExecutablePath;
  }

  const candidates = [
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    path.join(process.env.LOCALAPPDATA ?? "", "Microsoft", "Edge", "Application", "msedge.exe"),
  ];

  const executablePath = candidates.find((candidate) => candidate && existsSync(candidate));
  if (!executablePath) {
    throw new Error("Microsoft Edge が見つかりません。config.json の edgeExecutablePath を指定してください。");
  }
  return executablePath;
}

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (typeof address !== "object" || address === null) {
        server.close();
        reject(new Error("空きポートを取得できませんでした。"));
        return;
      }
      const port = address.port;
      server.close(() => resolve(port));
    });
  });
}

async function waitForCdp(endpoint: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${endpoint}/json/version`);
      if (response.ok) {
        return;
      }
    } catch (error) {
      lastError = error;
    }
    await delay(300);
  }

  throw new Error(`Edge の起動待ちがタイムアウトしました: ${String(lastError ?? "no response")}`);
}

async function findAutomationPage(browser: Browser, startUrl: string): Promise<Page> {
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

async function configureDownloads(page: Page, downloadsDirectory: string): Promise<void> {
  const cdpSession = await page.context().newCDPSession(page);
  try {
    await cdpSession.send("Page.setDownloadBehavior" as never, {
      behavior: "allow",
      downloadPath: downloadsDirectory,
    } as never);
  } finally {
    await cdpSession.detach().catch(() => undefined);
  }
}

function findControls(page: Page, patterns: string[]): Locator {
  const pattern = new RegExp(patterns.map(escapeRegExp).join("|"));
  return page.getByRole("link", { name: pattern }).or(
    page.getByRole("button", { name: pattern }),
  );
}

function findReceiptControls(page: Page, config: Config): Locator {
  return findControls(page, config.receiptLinkPatterns);
}

function findDetailControls(page: Page, config: Config): Locator {
  return findControls(page, config.detailButtonPatterns);
}

function findPrintControls(page: Page, config: Config): Locator {
  const pattern = new RegExp(config.printButtonPatterns.map(escapeRegExp).join("|"));
  return findControls(page, config.printButtonPatterns).or(page.getByText(pattern));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function visibleControlNames(page: Page): Promise<string[]> {
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

async function clickMaybeNavigates(page: Page, control: Locator): Promise<Page> {
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

async function saveReceipt(
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

function isReceiptPageUrl(url: string): boolean {
  return /\/pc\/reserve\/\d+(?:[/?#]|$)/.test(url);
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

function isIntermediateReceiptPageUrl(url: string): boolean {
  return /\/pc\/rereserve\/ReresvDetail\/print(?:[/?#]|$)/.test(url);
}

async function downloadableFileSet(downloadsDirectory: string): Promise<Set<string>> {
  await mkdir(downloadsDirectory, { recursive: true });
  return new Set(await readdir(downloadsDirectory));
}

async function waitForDownloadedFile(
  downloadsDirectory: string,
  beforeFiles: Set<string>,
  timeoutMs: number,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const files = await readdir(downloadsDirectory).catch(() => []);
    for (const file of files) {
      if (beforeFiles.has(file) || isTemporaryDownload(file)) {
        continue;
      }

      const filePath = path.join(downloadsDirectory, file);
      if (await isStableFile(filePath)) {
        return filePath;
      }
    }
    await delay(300);
  }

  throw new Error("ダウンロードファイルを検出できませんでした。");
}

function isTemporaryDownload(fileName: string): boolean {
  return fileName.endsWith(".crdownload") || fileName.endsWith(".tmp") || fileName.endsWith(".download");
}

async function isStableFile(filePath: string): Promise<boolean> {
  const first = await stat(filePath).catch(() => null);
  if (!first || !first.isFile()) {
    return false;
  }

  await delay(500);
  const second = await stat(filePath).catch(() => null);
  return Boolean(second?.isFile() && second.size === first.size && second.size > 0);
}

async function moveDownloadedFile(sourcePath: string, targetPath: string): Promise<void> {
  await rm(targetPath, { force: true });
  await rename(sourcePath, targetPath);
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

async function processReceiptControls(
  page: Page,
  config: Config,
  args: RunArgs,
  downloadDirectory: string,
  downloadsDirectory: string,
  startIndex: number,
): Promise<number> {
  const controls = findReceiptControls(page, config);
  const count = Math.min(await controls.count(), config.maxReceipts - startIndex + 1);

  for (let i = 0; i < count; i += 1) {
    const receiptIndex = startIndex + i;
    const targetPath = path.join(downloadDirectory, formatFileName(config.fileNameTemplate, receiptIndex));
    if (existsSync(targetPath)) {
      console.log(`スキップ: ${path.basename(targetPath)} は既に存在します。`);
      continue;
    }
    if (args.dryRun) {
      console.log(`保存予定: ${targetPath}`);
      continue;
    }

    await saveReceipt(page, controls.nth(i), targetPath, downloadsDirectory, config);
    console.log(`保存: ${targetPath}`);
  }

  return count;
}

async function processReservationDetails(
  page: Page,
  config: Config,
  args: RunArgs,
  downloadDirectory: string,
  downloadsDirectory: string,
): Promise<number> {
  const listUrl = page.url();
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);

  const detailCount = await findDetailControls(page, config).count();
  if (detailCount === 0) {
    const visibleNames = await visibleControlNames(page);
    throw new Error(
      `詳細ボタンも領収書ボタンも見つかりません。画面上の主なボタン/リンク: ${visibleNames.join(" / ")}`,
    );
  }

  console.log(`${detailCount} 件の予約詳細を順番に確認します。`);
  let savedOrPlanned = 0;

  for (let detailIndex = 0; detailIndex < detailCount && savedOrPlanned < config.maxReceipts; detailIndex += 1) {
    await ensureListPage(page, listUrl);

    const details = findDetailControls(page, config);
    const currentDetailCount = await details.count();
    if (detailIndex >= currentDetailCount) {
      break;
    }

    console.log(`${detailIndex + 1} 件目の詳細画面を確認します。`);
    const detailPage = await clickMaybeNavigates(page, details.nth(detailIndex));
    const receiptCount = await findReceiptControls(detailPage, config).count();

    if (receiptCount === 0) {
      const visibleNames = await visibleControlNames(detailPage);
      console.log(
        `スキップ: ${detailIndex + 1} 件目の詳細画面で領収書ボタンが見つかりません。主なボタン/リンク: ${visibleNames.join(" / ")}`,
      );
    } else {
      savedOrPlanned += await processReceiptControls(
        detailPage,
        config,
        args,
        downloadDirectory,
        downloadsDirectory,
        savedOrPlanned + 1,
      );
    }

    if (detailPage !== page) {
      await detailPage.close().catch(() => undefined);
    }
  }

  return savedOrPlanned;
}

async function ensureListPage(page: Page, listUrl: string): Promise<void> {
  if (page.url() !== listUrl) {
    await page.goto(listUrl, { waitUntil: "domcontentloaded" });
  }
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
}

async function main(): Promise<void> {
  const config = await loadConfig();
  const args = parseArgs();
  const downloadDirectory = path.resolve(root, config.downloadDirectory);
  const session = await openBrowserSession(config);

  try {
    console.log("Edge でログインし、領収書を取得したい予約一覧を表示してください。");
    console.log("準備ができたら、このターミナルで Enter を押してください。");
    await waitForEnter();

    await mkdir(downloadDirectory, { recursive: true });

    const activePage = await findAutomationPage(session.browser, config.startUrl);
    await configureDownloads(activePage, session.downloadsDirectory);
    console.log(`対象ページ: ${activePage.url()}`);

    const directReceiptCount = await findReceiptControls(activePage, config).count();
    const processedCount = directReceiptCount > 0
      ? await processReceiptControls(activePage, config, args, downloadDirectory, session.downloadsDirectory, 1)
      : await processReservationDetails(activePage, config, args, downloadDirectory, session.downloadsDirectory);

    if (processedCount === 0) {
      throw new Error("領収書を1件も検出できませんでした。詳細画面の表示内容を確認してください。");
    }

    console.log(`${processedCount} 件の領収書を処理しました。`);
  } finally {
    await session.browser.close().catch(() => undefined);
    session.edgeProcess.kill();
    await delay(500);
    await rm(session.downloadsDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
    await rm(session.profileDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  }
}

async function waitForEnter(): Promise<void> {
  process.stdin.resume();
  await new Promise<void>((resolve) => process.stdin.once("data", () => resolve()));
  process.stdin.pause();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
