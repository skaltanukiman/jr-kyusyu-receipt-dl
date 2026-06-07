import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium, type Browser, type Locator, type Page } from "playwright";

type Config = {
  listUrl: string;
  downloadDirectory: string;
  fileNameTemplate: string;
  receiptLinkPatterns: string[];
  maxReceipts: number;
};

const defaultConfig: Config = {
  listUrl: "https://train.yoyaku.jrkyushu.co.jp/jr/pc/rereserve/Reresv/list",
  downloadDirectory: "./downloads",
  fileNameTemplate: "JR九州_{year}{month}_{index}.pdf",
  receiptLinkPatterns: ["領収書", "領収書を表示", "領収書表示"],
  maxReceipts: 100,
};

const root = process.cwd();

async function loadConfig(): Promise<Config> {
  const configPath = path.resolve(root, "config.json");
  if (!existsSync(configPath)) {
    return defaultConfig;
  }

  const value = JSON.parse(await readFile(configPath, "utf8")) as Partial<Config>;
  return { ...defaultConfig, ...value };
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

function parseArgs(): { dryRun: boolean } {
  if (process.argv.includes("--setup")) {
    throw new Error("--setup は廃止しました。安全寄り運用では毎回手動ログインします。");
  }

  return {
    dryRun: process.argv.includes("--dry-run"),
  };
}

async function openBrowser(): Promise<Browser> {
  return chromium.launch({
    headless: false,
  });
}

async function findReceiptControls(page: Page, patterns: string[]): Promise<Locator> {
  const pattern = new RegExp(patterns.map(escapeRegExp).join("|"));
  return page.getByRole("link", { name: pattern }).or(
    page.getByRole("button", { name: pattern }),
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

async function main(): Promise<void> {
  const config = await loadConfig();
  const args = parseArgs();
  const downloadDirectory = path.resolve(root, config.downloadDirectory);
  const browser = await openBrowser();
  const context = await browser.newContext({
    acceptDownloads: true,
    locale: "ja-JP",
  });
  const page = await context.newPage();

  try {
    await page.goto(config.listUrl, { waitUntil: "domcontentloaded" });
    console.log("ブラウザでログインし、領収書を取得したい予約一覧を表示してください。");
    console.log("準備ができたら、このターミナルで Enter を押してください。");
    await waitForEnter();

    const controls = await findReceiptControls(page, config.receiptLinkPatterns);
    const count = Math.min(await controls.count(), config.maxReceipts);
    if (count === 0) {
      throw new Error(
        "領収書ボタンが見つかりません。対象期間、画面文言、またはログイン状態を確認してください。",
      );
    }

    await mkdir(downloadDirectory, { recursive: true });
    console.log(`${count} 件の領収書を検出しました。`);

    for (let i = 0; i < count; i += 1) {
      const targetPath = path.join(downloadDirectory, formatFileName(config.fileNameTemplate, i + 1));
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
  } finally {
    await context.close();
    await browser.close();
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
