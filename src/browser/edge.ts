import { spawn } from "node:child_process";
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

export async function openBrowserSession(config: Config): Promise<BrowserSession> {
  const edgeExecutablePath = findEdgeExecutable(config);
  const downloadsDirectory = await mkdtemp(path.join(tmpdir(), "jr-kyushu-downloads-"));
  const profileDirectory = await mkdtemp(path.join(tmpdir(), "jr-kyushu-edge-"));
  const port = await findFreePort();
  const endpoint = `http://127.0.0.1:${port}`;

  const edgeProcess = spawn(edgeExecutablePath, [
    `--remote-debugging-port=${port}`,
    "--remote-debugging-address=127.0.0.1",
    `--user-data-dir=${profileDirectory}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-default-apps",
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
    await waitForCdp(endpoint, config.startupTimeoutMs);
    const browser = await chromium.connectOverCDP(endpoint);
    const page = await findAutomationPage(browser, config.startUrl);
    await configureDownloads(page, downloadsDirectory);
    return { browser, downloadsDirectory, edgeProcess, page, profileDirectory };
  } catch (error) {
    edgeProcess.kill();
    await rm(downloadsDirectory, { recursive: true, force: true });
    await rm(profileDirectory, { recursive: true, force: true });
    throw error;
  }
}

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
