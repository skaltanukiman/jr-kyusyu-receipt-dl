import { existsSync } from "node:fs";
import path from "node:path";
import type { Locator, Page } from "playwright";
import type { RunArgs } from "../cli/args.js";
import { clickMaybeNavigates, visibleControlNames } from "../browser/page.js";
import { formatFileName } from "../files/fileName.js";
import type { Config } from "../types/config.js";
import type { TargetMonth } from "../types/targetMonth.js";
import { isAllTargetMonth, matchesTargetMonth, parseDepartureYearMonth } from "./departureDate.js";
import { findDetailControls, findReceiptControls } from "./locators.js";
import { saveReceipt } from "./receipt.js";

type ReservationProcessResult = {
  matchedRowCount: number;
  processedCount: number;
};

export async function processReceiptControls(
  page: Page,
  config: Config,
  args: RunArgs,
  downloadDirectory: string,
  downloadsDirectory: string,
  startIndex: number,
): Promise<number> {
  const controls = findReceiptControls(page, config);
  const count = Math.min(await controls.count(), config.maxReceipts - startIndex + 1);

  for (let i = 0; i < count; i += 1) {
    const receiptIndex = startIndex + i;
    const targetPath = path.join(downloadDirectory, formatFileName(config.fileNameTemplate, receiptIndex));
    if (existsSync(targetPath)) {
      console.log(`スキップ: ${path.basename(targetPath)} は既に存在します。`);
      continue;
    }
    if (args.dryRun) {
      console.log(`保存予定: ${targetPath}`);
      continue;
    }

    await saveReceipt(page, controls.nth(i), targetPath, downloadsDirectory, config);
    console.log(`保存: ${targetPath}`);
  }

  return count;
}

export async function processReservationDetails(
  page: Page,
  config: Config,
  args: RunArgs,
  downloadDirectory: string,
  downloadsDirectory: string,
  targetMonth: TargetMonth,
): Promise<ReservationProcessResult> {
  const listUrl = page.url();
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);

  const detailCount = await findDetailControls(page, config).count();
  if (detailCount === 0) {
    const visibleNames = await visibleControlNames(page);
    throw new Error(
      `詳細ボタンも領収書ボタンも見つかりません。画面上の主なボタン/リンク: ${visibleNames.join(" / ")}`,
    );
  }

  console.log(`${detailCount} 件の予約詳細を順番に確認します。`);
  let matchedRowCount = 0;
  let savedOrPlanned = 0;

  for (let detailIndex = 0; detailIndex < detailCount && savedOrPlanned < config.maxReceipts; detailIndex += 1) {
    await ensureListPage(page, listUrl);

    const details = findDetailControls(page, config);
    const currentDetailCount = await details.count();
    if (detailIndex >= currentDetailCount) {
      break;
    }

    const detail = details.nth(detailIndex);
    if (!await isTargetDetailRow(detail, targetMonth)) {
      continue;
    }

    matchedRowCount += 1;
    console.log(`${detailIndex + 1} 件目の詳細画面を確認します。`);
    const detailPage = await clickMaybeNavigates(page, detail);
    const receiptCount = await findReceiptControls(detailPage, config).count();

    if (receiptCount === 0) {
      const visibleNames = await visibleControlNames(detailPage);
      console.log(
        `スキップ: ${detailIndex + 1} 件目の詳細画面で領収書ボタンが見つかりません。主なボタン/リンク: ${visibleNames.join(" / ")}`,
      );
    } else {
      savedOrPlanned += await processReceiptControls(
        detailPage,
        config,
        args,
        downloadDirectory,
        downloadsDirectory,
        savedOrPlanned + 1,
      );
    }

    if (detailPage !== page) {
      await detailPage.close().catch(() => undefined);
    }
  }

  return {
    matchedRowCount,
    processedCount: savedOrPlanned,
  };
}

async function isTargetDetailRow(detailControl: Locator, targetMonth: TargetMonth): Promise<boolean> {
  if (isAllTargetMonth(targetMonth)) {
    return true;
  }

  const departureText = await detailControl
    .locator("xpath=ancestor::tr[1]")
    .locator("th, td")
    .first()
    .innerText()
    .catch(() => "");

  return matchesTargetMonth(parseDepartureYearMonth(departureText), targetMonth);
}

async function ensureListPage(page: Page, listUrl: string): Promise<void> {
  if (page.url() !== listUrl) {
    await page.goto(listUrl, { waitUntil: "domcontentloaded" });
  }
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
}
