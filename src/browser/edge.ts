import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";
import { configureDownloads } from "./downloads.js";
import { findAutomationPage } from "./page.js";
import type { BrowserSession } from "../types/browser.js";
import type { Config } from "../types/config.js";

// 自動操作用のEdgeを一時プロファイルで起動し、CDP経由でPlaywrightから接続する。
// 通常のPlaywright起動ではJR九州側でHTTP/2系の問題が出たため、ユーザーが触れる通常Edgeに近い形で起動する。
export async function openBrowserSession(config: Config): Promise<BrowserSession> {
  const edgeExecutablePath = findEdgeExecutable(config);
  // セッションやダウンロードを使い捨てにするため、どちらもOSの一時フォルダに作る。
  const downloadsDirectory = await mkdtemp(path.join(tmpdir(), "jr-kyushu-downloads-"));
  const profileDirectory = await mkdtemp(path.join(tmpdir(), "jr-kyushu-edge-"));
  const port = await findFreePort();
  const endpoint = `http://127.0.0.1:${port}`;

  const edgeProcess = spawn(edgeExecutablePath, [
    // Playwrightが既存のEdgeプロセスに接続できるよう、ローカル限定のデバッグポートを開く。
    `--remote-debugging-port=${port}`,
    "--remote-debugging-address=127.0.0.1",
    `--user-data-dir=${profileDirectory}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-default-apps",
    // Microsoftアカウント同期のポップアップを避け、領収書取得用の一時ブラウザとして使う。
    "--disable-sync",
    "--disable-signin-scoped-device-id",
    "--disable-features=SigninInterception,msEdgeBrowserSignin,msImplicitSignin,EdgeSigninInterceptionEnabled",
    "--start-maximized",
    "--new-window",
    config.startUrl,
  ], {
    stdio: "ignore",
  });

  try {
    // EdgeがCDP接続を受け付けるまで待ってからPlaywrightで接続する。
    await waitForCdp(endpoint, config.startupTimeoutMs);
    const browser = await chromium.connectOverCDP(endpoint);
    const page = await findAutomationPage(browser, config.startUrl);
    await configureDownloads(page, downloadsDirectory);
    return { browser, downloadsDirectory, edgeProcess, page, profileDirectory };
  } catch (error) {
    // 起動途中で失敗した場合も、一時フォルダとEdgeプロセスを残さないようにする。
    edgeProcess.kill();
    await rm(downloadsDirectory, { recursive: true, force: true });
    await rm(profileDirectory, { recursive: true, force: true });
    throw error;
  }
}

// ブラウザと一時ファイルをまとめて片付ける。
// Edgeの子プロセスが残ることがあるため、通常終了後にプロセスツリー終了も試す。
export async function closeBrowserSession(session: BrowserSession): Promise<void> {
  await session.browser.close().catch(() => undefined);
  await stopEdgeProcess(session.edgeProcess);
  await delay(500);
  await rm(session.downloadsDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  await rm(session.profileDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}

// まず通常の kill を試し、残る場合だけ taskkill でプロセスツリーごと終了する。
async function stopEdgeProcess(edgeProcess: ChildProcess): Promise<void> {
  if (edgeProcess.exitCode !== null || edgeProcess.signalCode !== null) {
    return;
  }

  edgeProcess.kill();
  if (await waitForProcessExit(edgeProcess, 2_000)) {
    return;
  }

  if (edgeProcess.pid) {
    await forceKillProcessTree(edgeProcess.pid);
    await waitForProcessExit(edgeProcess, 2_000);
  }
}

// kill 後にプロセスが本当に終了したかを短時間だけ待つ。
// 待たないと一時プロファイル削除時にファイルロックが残ることがある。
function waitForProcessExit(edgeProcess: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (edgeProcess.exitCode !== null || edgeProcess.signalCode !== null) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      edgeProcess.off("exit", onExit);
      resolve(false);
    }, timeoutMs);

    const onExit = () => {
      clearTimeout(timer);
      resolve(true);
    };

    edgeProcess.once("exit", onExit);
  });
}

// WindowsではEdgeの子プロセスが複数残ることがあるため、PID配下をまとめて終了する。
async function forceKillProcessTree(pid: number): Promise<void> {
  await new Promise<void>((resolve) => {
    const taskkill = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    taskkill.once("exit", () => resolve());
    taskkill.once("error", () => resolve());
  });
}

// Edgeの実行ファイルはインストール場所が環境で異なるため、代表的な候補から探す。
function findEdgeExecutable(config: Config): string {
  if (config.edgeExecutablePath) {
    if (!existsSync(config.edgeExecutablePath)) {
      throw new Error(`Edge が見つかりません: ${config.edgeExecutablePath}`);
    }
    return config.edgeExecutablePath;
  }

  const candidates = [
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    path.join(process.env.LOCALAPPDATA ?? "", "Microsoft", "Edge", "Application", "msedge.exe"),
  ];

  const executablePath = candidates.find((candidate) => candidate && existsSync(candidate));
  if (!executablePath) {
    throw new Error("Microsoft Edge が見つかりません。config.json の edgeExecutablePath を指定してください。");
  }
  return executablePath;
}

// CDP用のポートが他プロセスと衝突しないよう、OSから空きポートを取得する。
async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (typeof address !== "object" || address === null) {
        server.close();
        reject(new Error("空きポートを取得できませんでした。"));
        return;
      }
      const port = address.port;
      server.close(() => resolve(port));
    });
  });
}

// Edge起動直後はCDPエンドポイントがまだ開いていないため、一定時間ポーリングする。
async function waitForCdp(endpoint: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${endpoint}/json/version`);
      if (response.ok) {
        return;
      }
    } catch (error) {
      lastError = error;
    }
    await delay(300);
  }

  throw new Error(`Edge の起動待ちがタイムアウトしました: ${String(lastError ?? "no response")}`);
}
