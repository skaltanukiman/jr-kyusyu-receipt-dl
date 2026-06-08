import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { configureDownloads } from "./browser/downloads.js";
import { openBrowserSession } from "./browser/edge.js";
import { findAutomationPage } from "./browser/page.js";
import { parseArgs } from "./cli/args.js";
import { waitForEnter } from "./cli/prompt.js";
import { loadConfig } from "./config/config.js";
import { findReceiptControls } from "./jrKyushu/locators.js";
import {
  processReceiptControls,
  processReservationDetails,
} from "./jrKyushu/reservation.js";

const root = process.cwd();

export async function main(): Promise<void> {
  const config = await loadConfig(root);
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
