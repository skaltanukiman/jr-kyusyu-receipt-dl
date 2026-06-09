import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { defaultConfig, loadConfig } from "../src/config/config.js";

const temporaryDirectories: string[] = [];

async function createTemporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "jr-kyushu-config-test-"));
  temporaryDirectories.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(
    (directory) => rm(directory, { recursive: true, force: true }),
  ));
});

describe("loadConfig", () => {
  it("config.jsonが存在する場合は設定を読み込み、未指定項目をデフォルト設定で補う", async () => {
    const root = await createTemporaryRoot();
    await writeFile(path.join(root, "config.json"), JSON.stringify({
      downloadDirectory: "./receipts",
      receipt: {
        name: "テスト利用者",
        outboundRoute: {
          from: "戸畑",
          to: "博多",
        },
      },
    }), "utf8");

    const config = await loadConfig(root);

    expect(config.downloadDirectory).toBe("./receipts");
    expect(config.receipt.name).toBe("テスト利用者");
    expect(config.receipt.outboundRoute).toEqual({ from: "戸畑", to: "博多", number: 1 });
    expect(config.receipt.returnRoute).toEqual(defaultConfig.receipt.returnRoute);
  });

  it("config.jsonが存在しない場合はデフォルト設定を使用する", async () => {
    const root = await createTemporaryRoot();

    await expect(loadConfig(root)).resolves.toEqual(defaultConfig);
  });

  it("config.jsonがGit管理対象外として設定されている", async () => {
    const gitignore = await readFile(path.resolve(".gitignore"), "utf8");

    expect(gitignore.split(/\r?\n/)).toContain("config.json");
  });
});
