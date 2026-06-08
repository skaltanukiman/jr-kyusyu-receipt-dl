import type { DepartureYearMonth, TargetMonth } from "../types/targetMonth.js";

export function parseDepartureYearMonth(text: string): DepartureYearMonth | null {
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

export function isAllTargetMonth(targetMonth: TargetMonth): boolean {
  return targetMonth.kind === "all";
}
