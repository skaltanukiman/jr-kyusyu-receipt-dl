import type { Config } from "../src/types/config.js";

export function createTestConfig(): Config {
  return {
    startUrl: "https://example.com/login",
    downloadDirectory: "./downloads",
    receipt: {
      name: "山田 太郎",
      expenseItem: "通勤費",
      outboundRoute: {
        from: "出発駅",
        to: "到着駅",
        number: 1,
      },
      returnRoute: {
        from: "到着駅",
        to: "出発駅",
        number: 2,
      },
    },
    receiptLinkPatterns: ["領収書"],
    detailButtonPatterns: ["詳細"],
    printButtonPatterns: ["印刷"],
    maxReceipts: 100,
    startupTimeoutMs: 30_000,
  };
}
