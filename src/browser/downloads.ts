import type { Page } from "playwright";

// CDP経由でEdgeのダウンロード保存先を一時フォルダに固定する。
// ユーザーの通常ダウンロードフォルダを汚さず、検出後に正式な保存先へ移動するため。
export async function configureDownloads(page: Page, downloadsDirectory: string): Promise<void> {
  const cdpSession = await page.context().newCDPSession(page);
  try {
    await cdpSession.send("Page.setDownloadBehavior" as never, {
      behavior: "allow",
      downloadPath: downloadsDirectory,
    } as never);
  } finally {
    await cdpSession.detach().catch(() => undefined);
  }
}
