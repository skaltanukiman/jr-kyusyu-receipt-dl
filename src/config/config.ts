import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Config } from "../types/config.js";

// config.json がない場合に使う既定値。
// サイト上の文言が変わった場合は、各 patterns を config.json で上書きできる。
export const defaultConfig: Config = {
  startUrl: "https://train.yoyaku.jrkyushu.co.jp/jr/login",
  downloadDirectory: "./downloads",
  receipt: {
    name: "未設定",
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
  receiptLinkPatterns: ["領収書", "領収書を表示", "領収書表示"],
  detailButtonPatterns: ["詳細"],
  printButtonPatterns: ["印刷"],
  maxReceipts: 100,
  startupTimeoutMs: 30_000,
};

// config.json を読み込み、未指定の項目は defaultConfig で補う。
// BOM付きJSONでも読めるよう、先頭のBOMだけ取り除いてからJSON.parseする。
export async function loadConfig(root: string): Promise<Config> {
  const configPath = path.resolve(root, "config.json");
  if (!existsSync(configPath)) {
    return defaultConfig;
  }

  const rawConfig = await readFile(configPath, "utf8");
  const value = JSON.parse(rawConfig.replace(/^\uFEFF/, "")) as Partial<Config> & {
    browserChannel?: string;
    listUrl?: string;
  };

  return {
    ...defaultConfig,
    ...value,
    receipt: {
      ...defaultConfig.receipt,
      ...value.receipt,
      outboundRoute: {
        ...defaultConfig.receipt.outboundRoute,
        ...value.receipt?.outboundRoute,
      },
      returnRoute: {
        ...defaultConfig.receipt.returnRoute,
        ...value.receipt?.returnRoute,
      },
    },
    startUrl: value.startUrl ?? value.listUrl ?? defaultConfig.startUrl,
  };
}
