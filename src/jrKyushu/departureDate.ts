import type { DepartureDate, DepartureYearMonth, TargetMonth } from "../types/targetMonth.js";

// 予約一覧の出発日時セルから「年」と「月」だけを抜き出す。
// セル内に曜日や時刻、改行が含まれるため、空白をならしてから判定する。
export function parseDepartureYearMonth(text: string): DepartureYearMonth | null {
  const departureDate = parseDepartureDate(text);
  if (departureDate) {
    return {
      year: departureDate.year,
      month: departureDate.month,
    };
  }

  const normalizedText = text.replace(/\s+/g, " ");
  const match = /(\d{4})年\s*(\d{1,2})月/.exec(normalizedText);
  if (!match) {
    return null;
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
  };
}

// ファイル名に使うため、予約一覧や領収書上の日付から年月日を抜き出す。
export function parseDepartureDate(text: string): DepartureDate | null {
  const normalizedText = text.replace(/\s+/g, " ");
  const match = /(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/.exec(normalizedText);
  if (!match) {
    return null;
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

// ユーザーが指定した対象月に、予約行の出発年月が一致するか判定する。
// 年指定なしの入力では月だけを見る。
export function matchesTargetMonth(departure: DepartureYearMonth | null, targetMonth: TargetMonth): boolean {
  if (targetMonth.kind === "all") {
    return true;
  }

  if (!departure) {
    return false;
  }

  if (targetMonth.kind === "yearMonth") {
    return departure.year === targetMonth.year && departure.month === targetMonth.month;
  }

  return departure.month === targetMonth.month;
}

// 呼び出し側で全件指定かどうかを読みやすくするための小さな判定関数。
export function isAllTargetMonth(targetMonth: TargetMonth): boolean {
  return targetMonth.kind === "all";
}
