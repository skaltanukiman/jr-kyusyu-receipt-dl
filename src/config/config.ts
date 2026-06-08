import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Config } from "../types/config.js";

export const defaultConfig: Config = {
  startUrl: "https://train.yoyaku.jrkyushu.co.jp/jr/login",
  downloadDirectory: "./downloads",
  fileNameTemplate: "JR九州_{year}{month}_{index}.pdf",
  receiptLinkPatterns: ["領収書", "領収書を表示", "領収書表示"],
  detailButtonPatterns: ["詳細"],
  printButtonPatterns: ["印刷"],
  maxReceipts: 100,
  startupTimeoutMs: 30_000,
};

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
    startUrl: value.startUrl ?? value.listUrl ?? defaultConfig.startUrl,
  };
}
