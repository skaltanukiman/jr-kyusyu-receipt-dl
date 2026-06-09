import type { DepartureYearMonth, TargetMonth } from "../types/targetMonth.js";
import { matchesTargetMonth } from "./departureDate.js";

// 予約状態は前後に空白や改行を含むことがあるため、trim後の完全一致で判定する。
export function isUsedReservationStatus(statusText: string): boolean {
  return statusText.trim() === "利用済み";
}

// テーブルヘッダーから「予約状態」列を探し、同じ位置にある行のセル文字列を返す。
// ヘッダーを取得できない画面構造では、詳細ボタン直前のセルを予約状態として扱う。
export function findReservationStatusText(headerTexts: string[], cellTexts: string[]): string {
  const statusColumnIndex = headerTexts.findIndex(
    (headerText) => normalizeHeaderText(headerText) === "予約状態",
  );

  if (statusColumnIndex >= 0) {
    return cellTexts[statusColumnIndex] ?? "";
  }

  return cellTexts.at(-2) ?? "";
}

// 詳細ボタンを押す前に、予約状態と対象月の両方を満たす行だけを処理対象にする。
export function isTargetReservationRow(
  statusText: string,
  departure: DepartureYearMonth | null,
  targetMonth: TargetMonth,
): boolean {
  return isUsedReservationStatus(statusText) && matchesTargetMonth(departure, targetMonth);
}

function normalizeHeaderText(headerText: string): string {
  return headerText.replace(/\s+/g, "").trim();
}
