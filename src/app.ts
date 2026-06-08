import { mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { configureDownloads } from "./browser/downloads.js";
import { closeBrowserSession, openBrowserSession } from "./browser/edge.js";
import { findAutomationPage } from "./browser/page.js";
import { parseArgs } from "./cli/args.js";
import { waitForEnter } from "./cli/prompt.js";
import { formatTargetMonthLog, promptTargetMonth } from "./cli/targetMonth.js";
import { loadConfig } from "./config/config.js";
import { printDownloadSummary } from "./files/downloadSummary.js";
import { isAllTargetMonth } from "./jrKyushu/departureDate.js";
import { findReceiptControls } from "./jrKyushu/locators.js";
import {
  processReceiptControls,
  processReservationDetails,
} from "./jrKyushu/reservation.js";

const root = process.cwd();

// アプリ全体の流れをまとめる入口。
// 設定読み込み、Edge起動、ユーザー操作待ち、領収書取得、集計表示、後始末を順番に行う。
export async function main(): Promise<void> {
  const config = await loadConfig(root);
  const args = parseArgs();
  const downloadDirectory = path.resolve(root, config.downloadDirectory);
  const session = await openBrowserSession(config);

  try {
    // 対象月は、ユーザーが予約一覧を表示して Enter を押す前に決めておく。
    // 実際のフィルタは、一覧画面の出発日時セルを読んでから行う。
    const targetMonth = await promptTargetMonth();
    console.log(formatTargetMonthLog(targetMonth));

    // ログインと予約一覧への移動は手動にしている。
    // セッション情報を保存しない安全寄りの運用にするため、準備完了を Enter で受け取る。
    console.log("Edge でログインし、領収書を取得したい予約一覧を表示してください。");
    console.log("準備ができたら、このターミナルで Enter を押してください。");
    await waitForEnter();

    await mkdir(downloadDirectory, { recursive: true });

    const activePage = await findAutomationPage(session.browser, config.startUrl);
    await configureDownloads(activePage, session.downloadsDirectory);
    console.log(`対象ページ: ${activePage.url()}`);

    // 通常は予約一覧から詳細画面を辿る。
    // すでに領収書ボタンがある画面で開始された場合だけ、その画面上の領収書を直接処理する。
    const directReceiptCount = await findReceiptControls(activePage, config).count();
    const directReceiptResult = directReceiptCount > 0
      ? await processReceiptControls(activePage, config, args, downloadDirectory, session.downloadsDirectory, 1, {
        departureDate: null,
        route: null,
      })
      : null;
    const result = directReceiptCount > 0
      ? {
        matchedRowCount: directReceiptCount,
        summary: directReceiptResult!.summary,
      }
      : await processReservationDetails(activePage, config, args, downloadDirectory, session.downloadsDirectory, targetMonth);

    if (!isAllTargetMonth(targetMonth) && result.matchedRowCount === 0) {
      console.log("指定された月の領収書は画面上に見つかりませんでした。");
      return;
    }

    // totalCount は実際に保存した件数。
    // 既存ファイルをスキップしたものは「ダウンロードした件数」には含めない。
    if (result.summary.totalCount === 0) {
      throw new Error("領収書を1件もダウンロードできませんでした。詳細画面の表示内容を確認してください。");
    }

    printDownloadSummary(result.summary);
  } finally {
    // 正常終了・エラー終了のどちらでも、一時プロファイルとEdgeプロセスを片付ける。
    await closeBrowserSession(session);
  }
}
