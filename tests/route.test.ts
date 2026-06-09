import { describe, expect, it } from "vitest";
import {
  matchesRoute,
  normalizeStationName,
  parseRouteInfo,
  parseRouteInfoFromCells,
} from "../src/jrKyushu/route.js";
import { createTestConfig } from "./fixtures.js";

describe("matchesRoute", () => {
  it("設定された往路・復路と予約一覧の区間を比較できる", () => {
    const config = createTestConfig();

    expect(matchesRoute(config.receipt.outboundRoute, { from: "出発", to: "到着" })).toBe(true);
    expect(matchesRoute(config.receipt.returnRoute, { from: "到着", to: "出発" })).toBe(true);
  });

  it("駅名末尾の「駅」と空白を無視して比較する", () => {
    expect(matchesRoute(
      { from: " 戸畑駅 ", to: "博多駅", number: 1 },
      { from: "戸畑", to: "博多" },
    )).toBe(true);
  });

  it("往路・復路に一致しない区間は未分類扱いにする", () => {
    const config = createTestConfig();
    const unknownRoute = { from: "小倉", to: "博多" };

    expect(matchesRoute(config.receipt.outboundRoute, unknownRoute)).toBe(false);
    expect(matchesRoute(config.receipt.returnRoute, unknownRoute)).toBe(false);
  });
});

describe("区間文字列の解析", () => {
  it("矢印を含む区間文字列を解析する", () => {
    expect(parseRouteInfo("戸畑駅 ▶ 博多駅")).toEqual({ from: "戸畑", to: "博多" });
  });

  it("予約一覧の単一区間セルから出発駅・到着駅を解析する", () => {
    expect(parseRouteInfoFromCells([
      "2026年 6月 5日\n(金) 23:10",
      "博多\n戸畑",
      "九州ネットきっぷ",
    ])).toEqual({ from: "博多", to: "戸畑" });
  });

  it("駅名を比較用の形式へ正規化する", () => {
    expect(normalizeStationName(" 戸 畑 駅 ")).toBe("戸畑");
  });
});
