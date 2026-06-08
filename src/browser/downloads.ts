import type { Page } from "playwright";

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
