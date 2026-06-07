import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, type Browser, type Locator, type Page } from "playwright";

type Config = {
  startUrl: string;
  downloadDirectory: string;
  fileNameTemplate: string;
  receiptLinkPatterns: string[];
  detailButtonPatterns: string[];
  maxReceipts: number;
  edgeExecutablePath?: string;
  startupTimeoutMs: number;
};

type BrowserSession = {
  browser: Browser;
  edgeProcess: ChildProcess;
  page: Page;
  profileDirectory: string;
};

type RunArgs = {
  dryRun: boolean;
};

const defaultConfig: Config = {
  startUrl: "https://train.yoyaku.jrkyushu.co.jp/jr/login",
  downloadDirectory: "./downloads",
  fileNameTemplate: "JR九州_{year}{month}_{index}.pdf",
  receiptLinkPatterns: ["領収書", "領収書を表示", "領収書表示"],
  detailButtonPatterns: ["詳細"],
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
    return { browser, edgeProcess, page, profileDirectory };
  } catch (error) {
    edgeProcess.kill();
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
  const existingPages = browser.contexts().flatMap((context) => context.pages());
  const page = existingPages.find((candidate) => candidate.url().startsWith("https://train.yoyaku.jrkyushu.co.jp/"))
    ?? existingPages[0]
    ?? await browser.contexts()[0].newPage();

  if (page.url() === "about:blank") {
    await page.goto(startUrl, { waitUntil: "domcontentloaded" });
  }
  return page;
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
  const popupPromise = page.waitForEvent("popup", { timeout: 5_000 }).catch(() => null);
  const navigationPromise = page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 15_000 }).catch(() => null);

  await control.click();
  const popup = await popupPromise;
  await navigationPromise;

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
): Promise<void> {
  const downloadPromise = page.waitForEvent("download", { timeout: 15_000 })
    .then((download) => ({ type: "download" as const, download }))
    .catch(() => null);
  const popupPromise = page.waitForEvent("popup", { timeout: 15_000 })
    .then((popup) => ({ type: "popup" as const, popup }))
    .catch(() => null);

  await control.click();
  const result = await Promise.race([downloadPromise, popupPromise]);

  if (!result) {
    throw new Error("ダウンロードまたは領収書の別画面を検出できませんでした。");
  }

  if (result.type === "download") {
    await result.download.saveAs(targetPath);
    return;
  }

  const popup = result.popup;
  await popup.waitForLoadState("domcontentloaded");
  const response = await popup.request.get(popup.url());
  if (!response.ok()) {
    throw new Error(`領収書画面の取得に失敗しました: ${response.status()}`);
  }

  await mkdir(path.dirname(targetPath), { recursive: true });
  const contentType = response.headers()["content-type"] ?? "";
  if (contentType.includes("application/pdf")) {
    await writeFile(targetPath, await response.body());
  } else {
    await popup.pdf({ path: targetPath, format: "A4", printBackground: true });
  }
  await popup.close();
}

async function processReceiptControls(
  page: Page,
  config: Config,
  args: RunArgs,
  downloadDirectory: string,
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

    await saveReceipt(page, controls.nth(i), targetPath);
    console.log(`保存: ${targetPath}`);
  }

  return count;
}

async function processReservationDetails(
  page: Page,
  config: Config,
  args: RunArgs,
  downloadDirectory: string,
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

    const directReceiptCount = await findReceiptControls(session.page, config).count();
    const processedCount = directReceiptCount > 0
      ? await processReceiptControls(session.page, config, args, downloadDirectory, 1)
      : await processReservationDetails(session.page, config, args, downloadDirectory);

    if (processedCount === 0) {
      throw new Error("領収書を1件も検出できませんでした。詳細画面の表示内容を確認してください。");
    }

    console.log(`${processedCount} 件の領収書を処理しました。`);
  } finally {
    await session.browser.close().catch(() => undefined);
    session.edgeProcess.kill();
    await delay(500);
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