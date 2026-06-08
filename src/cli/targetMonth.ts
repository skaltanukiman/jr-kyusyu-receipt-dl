import { readLine } from "./prompt.js";
import type { TargetMonth } from "../types/targetMonth.js";

const invalidTargetMonthMessage = "入力値が不正です。5, 05, 2026-05, 00, all のいずれかで入力してください。";

// ダウンロード開始前に、予約一覧のどの月を対象にするかユーザーへ確認する。
export async function promptTargetMonth(): Promise<TargetMonth> {
  console.log("ダウンロード対象月を入力してください。");
  console.log("例: 5, 05, 2026-05");
  console.log("全件ダウンロードする場合は 00 または all を入力してください:");

  return normalizeTargetMonthInput(await readLine());
}

// 入力値を処理しやすい内部形式へ変換する。
// 00/all は全件、5/05 は月のみ、2026-05 は年月指定として扱う。
export function normalizeTargetMonthInput(input: string): TargetMonth {
  const value = input.trim();

  if (value === "00" || value.toLowerCase() === "all") {
    return { kind: "all" };
  }

  const yearMonthMatch = /^(\d{4})-(\d{1,2})$/.exec(value);
  if (yearMonthMatch) {
    const year = Number(yearMonthMatch[1]);
    const month = Number(yearMonthMatch[2]);
    if (isValidMonth(month)) {
      return { kind: "yearMonth", year, month };
    }
  }

  if (/^\d{1,2}$/.test(value)) {
    const month = Number(value);
    if (isValidMonth(month)) {
      return { kind: "month", month };
    }
  }

  throw new Error(invalidTargetMonthMessage);
}

// 処理開始時に、今回の対象条件が分かるように表示用文言へ変換する。
export function formatTargetMonthLog(targetMonth: TargetMonth): string {
  if (targetMonth.kind === "all") {
    return "対象: 画面上の全件";
  }

  if (targetMonth.kind === "yearMonth") {
    return `対象月: ${targetMonth.year}年${targetMonth.month}月`;
  }

  return `対象月: ${targetMonth.month}月`;
}

function isValidMonth(month: number): boolean {
  return Number.isInteger(month) && month >= 1 && month <= 12;
}
