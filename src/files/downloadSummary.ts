import type { DownloadSummary } from "../types/downloadSummary.js";
import type { DepartureYearMonth } from "../types/targetMonth.js";

export function createDownloadSummary(): DownloadSummary {
  return {
    totalCount: 0,
    monthlyCounts: new Map<string, number>(),
  };
}

export function addDownloadedReceipt(summary: DownloadSummary, departure: DepartureYearMonth | null): void {
  summary.totalCount += 1;

  if (!departure) {
    return;
  }

  const key = formatYearMonthKey(departure);
  summary.monthlyCounts.set(key, (summary.monthlyCounts.get(key) ?? 0) + 1);
}

export function mergeDownloadSummaries(target: DownloadSummary, source: DownloadSummary): void {
  target.totalCount += source.totalCount;

  for (const [key, count] of source.monthlyCounts) {
    target.monthlyCounts.set(key, (target.monthlyCounts.get(key) ?? 0) + count);
  }
}

export function printDownloadSummary(summary: DownloadSummary): void {
  console.log("ダウンロード結果:");
  console.log(`総件数: ${summary.totalCount} 件`);
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
