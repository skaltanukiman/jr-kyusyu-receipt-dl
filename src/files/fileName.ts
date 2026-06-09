import type { Config } from "../types/config.js";
import type { DepartureDate } from "../types/targetMonth.js";
import type { ReceiptFileMetadata, RouteInfo } from "../types/route.js";
import { formatRoute, matchesRoute } from "../jrKyushu/route.js";

// 新しい命名規則で領収書PDFの保存ファイル名を作る。
// 予約一覧から日付を取れない経路では、命名規則に必要な情報が不足するため最小限のフォールバック名にする。
export function formatReceiptFileName(config: Config, index: number, metadata: ReceiptFileMetadata): string {
  if (!metadata.departureDate) {
    return sanitizeWindowsFileName(`領収書_${String(index).padStart(2, "0")}.pdf`);
  }

  const route = metadata.route ?? { from: "区間不明", to: "区間不明" };
  const routeNumber = resolveRouteNumber(config, route);
  const rawFileName = [
    formatDepartureDate(metadata.departureDate),
    "_",
    String(routeNumber),
    config.receipt.name,
    "_",
    config.receipt.expenseItem,
    " 領収書_JR",
    formatRoute(route),
    ".pdf",
  ].join("");

  return sanitizeWindowsFileName(rawFileName);
}

function formatDepartureDate(date: DepartureDate): string {
  return [
    String(date.year),
    String(date.month).padStart(2, "0"),
    String(date.day).padStart(2, "0"),
  ].join("");
}

export function resolveRouteNumber(config: Config, route: RouteInfo): number {
  if (matchesRoute(config.receipt.outboundRoute, route)) {
    return config.receipt.outboundRoute.number;
  }

  if (matchesRoute(config.receipt.returnRoute, route)) {
    return config.receipt.returnRoute.number;
  }

  console.warn("区間情報が設定ファイルと一致しないため、行き・帰りを判定できませんでした。");
  console.warn(`対象区間: ${formatRoute(route)}`);
  return 9;
}

export function sanitizeWindowsFileName(fileName: string): string {
  return fileName
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/[ .]+(?=\.pdf$)/, "");
}
