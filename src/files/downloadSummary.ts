import type { DownloadSummary } from "../types/downloadSummary.js";
import type { DepartureYearMonth } from "../types/targetMonth.js";

// ダウンロード件数の集計を初期化する。
export function createDownloadSummary(): DownloadSummary {
  return {
    totalCount: 0,
    successfulCount: 0,
    skippedExistingCount: 0,
    skippedNoReceiptCount: 0,
    plannedCount: 0,
    monthlyCounts: new Map<string, number>(),
  };
}

// 保存に成功した領収書を総件数と年月別件数へ加算する。
// 年月が取れない経路では、総件数だけを加算する。
export function addDownloadedReceipt(summary: DownloadSummary, departure: DepartureYearMonth | null): void {
  summary.successfulCount += 1;
  addProcessedReceipt(summary, departure);
}

// 同名ファイルが既に存在し、保存を行わなかった領収書をスキップ件数へ加算する。
export function addExistingFileSkip(summary: DownloadSummary, departure: DepartureYearMonth | null): void {
  summary.skippedExistingCount += 1;
  addProcessedReceipt(summary, departure);
}

// 詳細画面に領収書ボタンがなく、保存対象にできなかった予約をスキップ件数へ加算する。
export function addNoReceiptSkip(summary: DownloadSummary, departure: DepartureYearMonth | null): void {
  summary.skippedNoReceiptCount += 1;
  addProcessedReceipt(summary, departure);
}

// dry-runで保存予定として確認した領収書を加算する。
export function addPlannedReceipt(summary: DownloadSummary, departure: DepartureYearMonth | null): void {
  summary.plannedCount += 1;
  addProcessedReceipt(summary, departure);
}

// 成功、スキップ、保存予定のいずれでも、実際に確認した対象として総件数と年月別件数へ加算する。
function addProcessedReceipt(summary: DownloadSummary, departure: DepartureYearMonth | null): void {
  summary.totalCount += 1;

  if (!departure) {
    return;
  }

  const key = formatYearMonthKey(departure);
  summary.monthlyCounts.set(key, (summary.monthlyCounts.get(key) ?? 0) + 1);
}

// 詳細画面ごとの集計を、全体の集計へ合算する。
export function mergeDownloadSummaries(target: DownloadSummary, source: DownloadSummary): void {
  target.totalCount += source.totalCount;
  target.successfulCount += source.successfulCount;
  target.skippedExistingCount += source.skippedExistingCount;
  target.skippedNoReceiptCount += source.skippedNoReceiptCount;
  target.plannedCount += source.plannedCount;

  for (const [key, count] of source.monthlyCounts) {
    target.monthlyCounts.set(key, (target.monthlyCounts.get(key) ?? 0) + count);
  }
}

// 全処理完了後に、ユーザーが確認しやすい形で件数を表示する。
export function printDownloadSummary(summary: DownloadSummary): void {
  const skippedCount = summary.skippedExistingCount + summary.skippedNoReceiptCount;

  console.log("ダウンロード結果:");
  console.log(`総件数: ${summary.totalCount} 件`);
  console.log(`成功: ${summary.successfulCount} 件`);
  console.log(`スキップ: ${skippedCount} 件`);
  console.log(`  既存ファイル: ${summary.skippedExistingCount} 件`);
  console.log(`  領収書なし: ${summary.skippedNoReceiptCount} 件`);
  if (summary.plannedCount > 0) {
    console.log(`保存予定（dry-run）: ${summary.plannedCount} 件`);
  }
  console.log("YYYY/MM毎の件数:");

  if (summary.monthlyCounts.size === 0) {
    console.log("  取得できた年月情報はありません。");
    return;
  }

  for (const [key, count] of [...summary.monthlyCounts.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    console.log(`  ${key}: ${count} 件`);
  }
}

function formatYearMonthKey(departure: DepartureYearMonth): string {
  return `${departure.year}/${String(departure.month).padStart(2, "0")}`;
}
