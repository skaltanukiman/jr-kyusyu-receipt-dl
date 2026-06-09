import { describe, expect, it, vi } from "vitest";
import {
  formatReceiptFileName,
  resolveRouteNumber,
  sanitizeWindowsFileName,
} from "../src/files/fileName.js";
import { createTestConfig } from "./fixtures.js";

describe("formatReceiptFileName", () => {
  it("往路の区分番号を使って領収書PDF名を生成する", () => {
    const fileName = formatReceiptFileName(createTestConfig(), 1, {
      departureDate: { year: 2026, month: 5, day: 11 },
      route: { from: "出発駅", to: "到着駅" },
    });

    expect(fileName).toBe("20260511_1山田 太郎_通勤費 領収書_JR出発駅⇒到着駅.pdf");
  });

  it("復路の区分番号を使って領収書PDF名を生成する", () => {
    const fileName = formatReceiptFileName(createTestConfig(), 1, {
      departureDate: { year: 2026, month: 5, day: 11 },
      route: { from: "到着駅", to: "出発駅" },
    });

    expect(fileName).toBe("20260511_2山田 太郎_通勤費 領収書_JR到着駅⇒出発駅.pdf");
  });

  it("往路・復路のどちらにも一致しない区間には区分番号9を使う", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const fileName = formatReceiptFileName(createTestConfig(), 1, {
      departureDate: { year: 2026, month: 5, day: 11 },
      route: { from: "小倉", to: "博多" },
    });

    expect(fileName).toBe("20260511_9山田 太郎_通勤費 領収書_JR小倉⇒博多.pdf");
  });
});

describe("resolveRouteNumber", () => {
  it("設定された往路・復路の番号を返し、未分類なら9を返す", () => {
    const config = createTestConfig();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(resolveRouteNumber(config, { from: "出発", to: "到着" })).toBe(1);
    expect(resolveRouteNumber(config, { from: "到着", to: "出発" })).toBe(2);
    expect(resolveRouteNumber(config, { from: "別駅", to: "不明駅" })).toBe(9);
  });
});

describe("sanitizeWindowsFileName", () => {
  it("Windowsでファイル名に使えない文字をアンダースコアへ置換する", () => {
    expect(sanitizeWindowsFileName('領収書<>:"/\\|?*.pdf'))
      .toBe("領収書_________.pdf");
  });
});
