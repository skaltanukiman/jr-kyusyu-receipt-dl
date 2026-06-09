import { describe, expect, it } from "vitest";
import {
  formatTargetMonthLog,
  normalizeTargetMonthInput,
} from "../src/cli/targetMonth.js";
import { matchesTargetMonth } from "../src/jrKyushu/departureDate.js";

describe("normalizeTargetMonthInput", () => {
  it.each([
    ["5", { kind: "month", month: 5 }],
    ["05", { kind: "month", month: 5 }],
    ["2026-05", { kind: "yearMonth", year: 2026, month: 5 }],
    ["00", { kind: "all" }],
    ["all", { kind: "all" }],
    ["ALL", { kind: "all" }],
  ])("%s を対象月指定として正規化する", (input, expected) => {
    expect(normalizeTargetMonthInput(input)).toEqual(expected);
  });

  it.each(["", "0", "13", "2026-00", "2026-13", "May"])(
    "不正な入力 %s を拒否する",
    (input) => {
      expect(() => normalizeTargetMonthInput(input)).toThrow("入力値が不正です。");
    },
  );
});

describe("matchesTargetMonth", () => {
  const departure = { year: 2026, month: 5 };

  it("月のみ指定では年に関係なく月が一致すれば対象にする", () => {
    expect(matchesTargetMonth(departure, { kind: "month", month: 5 })).toBe(true);
    expect(matchesTargetMonth({ year: 2025, month: 5 }, { kind: "month", month: 5 })).toBe(true);
    expect(matchesTargetMonth(departure, { kind: "month", month: 6 })).toBe(false);
  });

  it("年月指定では年と月の両方が一致した場合だけ対象にする", () => {
    expect(matchesTargetMonth(departure, { kind: "yearMonth", year: 2026, month: 5 })).toBe(true);
    expect(matchesTargetMonth(departure, { kind: "yearMonth", year: 2025, month: 5 })).toBe(false);
  });

  it("全件指定では日付を取得できない行も対象にする", () => {
    expect(matchesTargetMonth(null, { kind: "all" })).toBe(true);
  });
});

describe("formatTargetMonthLog", () => {
  it("正規化した対象条件を表示用文言へ変換する", () => {
    expect(formatTargetMonthLog({ kind: "month", month: 5 })).toBe("対象月: 5月");
    expect(formatTargetMonthLog({ kind: "yearMonth", year: 2026, month: 5 })).toBe("対象月: 2026年5月");
    expect(formatTargetMonthLog({ kind: "all" })).toBe("対象: 画面上の全件");
  });
});
