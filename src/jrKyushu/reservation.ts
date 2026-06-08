import { existsSync } from "node:fs";
import path from "node:path";
import type { Locator, Page } from "playwright";
import type { RunArgs } from "../cli/args.js";
import { clickMaybeNavigates, visibleControlNames } from "../browser/page.js";
import {
  addDownloadedReceipt,
  createDownloadSummary,
  mergeDownloadSummaries,
} from "../files/downloadSummary.js";
import { formatReceiptFileName } from "../files/fileName.js";
import type { Config } from "../types/config.js";
import type { DownloadSummary } from "../types/downloadSummary.js";
import type { ReceiptFileMetadata } from "../types/route.js";
import type { TargetMonth } from "../types/targetMonth.js";
import { matchesTargetMonth, parseDepartureDate } from "./departureDate.js";
import { findDetailControls, findReceiptControls } from "./locators.js";
import { saveReceipt } from "./receipt.js";
import { normalizeStationName, parseRouteInfoFromCells } from "./route.js";

export type ReservationProcessResult = {
  matchedRowCount: number;
  summary: DownloadSummary;
};

export type ReceiptControlsProcessResult = {
  handledCount: number;
  summary: DownloadSummary;
};

// 1つの画面内にある領収書ボタンを順番に処理する。
// 保存済みファイルは上書きせずスキップし、保存に成功したものだけを集計に加える。
export async function processReceiptControls(
  page: Page,
  config: Config,
  args: RunArgs,
  downloadDirectory: string,
  downloadsDirectory: string,
  startIndex: number,
  metadata: ReceiptFileMetadata,
): Promise<ReceiptControlsProcessResult> {
  const summary = createDownloadSummary();
  const controls = findReceiptControls(page, config);
  const count = Math.min(await controls.count(), config.maxReceipts - startIndex + 1);

  for (let i = 0; i < count; i += 1) {
    // ファイル名の連番は既存仕様を維持するため、画面上の処理順を基準にする。
    const receiptIndex = startIndex + i;
    const targetPath = path.join(downloadDirectory, formatReceiptFileName(config, receiptIndex, metadata));
    if (existsSync(targetPath)) {
      console.log(`スキップ: ${path.basename(targetPath)} は既に存在します。`);
      continue;
    }
    if (args.dryRun) {
      console.log(`保存予定: ${targetPath}`);
      // dry-runでは実ファイルは保存しないが、処理対象として集計結果を確認できるようにする。
      addDownloadedReceipt(summary, metadata.departureDate);
      continue;
    }

    // saveReceipt が正常に戻った時点で、PDF保存まで完了したものとして件数に加える。
    await saveReceipt(page, controls.nth(i), targetPath, downloadsDirectory, config);
    addDownloadedReceipt(summary, metadata.departureDate);
    console.log(`保存: ${targetPath}`);
  }

  return {
    handledCount: count,
    summary,
  };
}

// 予約一覧の「詳細」ボタンを行単位で確認し、対象月に一致する行だけを開く。
// 対象外の行は詳細画面に遷移しないため、余計な画面操作を避けられる。
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
  let nextReceiptIndex = 1;
  const summary = createDownloadSummary();

  for (let detailIndex = 0; detailIndex < detailCount && nextReceiptIndex <= config.maxReceipts; detailIndex += 1) {
    // JR九州の画面はブラウザの戻る操作に弱いため、毎回一覧URLへ戻してから次の行を探す。
    await ensureListPage(page, listUrl);

    // 一覧へ戻るたびにDOMが作り直される可能性があるので、Locatorはループ内で取り直す。
    const details = findDetailControls(page, config);
    const currentDetailCount = await details.count();
    if (detailIndex >= currentDetailCount) {
      break;
    }

    const detail = details.nth(detailIndex);
    // 詳細ボタンを押す前に、同じ行の出発日時を読んで対象月か判定する。
    const metadata = await getDetailRowMetadata(detail, config);
    if (!matchesTargetMonth(metadata.departureDate, targetMonth)) {
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
      // 1つの詳細画面に複数の領収書ボタンがある場合もあるため、
      // 詳細画面単位ではなく領収書ボタン単位で集計する。
      const receiptResult = await processReceiptControls(
        detailPage,
        config,
        args,
        downloadDirectory,
        downloadsDirectory,
        nextReceiptIndex,
        metadata,
      );
      nextReceiptIndex += receiptResult.handledCount;
      mergeDownloadSummaries(summary, receiptResult.summary);
    }

    // 詳細画面が別タブで開いた場合は、処理後に閉じて一覧側の操作へ戻る。
    if (detailPage !== page) {
      await detailPage.close().catch(() => undefined);
    }
  }

  return {
    matchedRowCount,
    summary,
  };
}

// 詳細ボタンのある行から、ファイル名に使う出発日と区間を取り出す。
// 画面表示は改行を含むため、具体的な整形は parseDepartureDate / parseRouteInfoFromCells 側に寄せている。
async function getDetailRowMetadata(detailControl: Locator, config: Config): Promise<ReceiptFileMetadata> {
  const cells = detailControl
    .locator("xpath=ancestor::tr[1]")
    .locator("th, td");
  const cellTexts = await cells.allInnerTexts().catch(() => []);
  const departureText = await cells.nth(0).innerText().catch(() => "");
  const parsedRoute = parseRouteInfoFromCells(cellTexts);

  return {
    departureDate: parseDepartureDate(departureText),
    route: parsedRoute ?? findConfiguredRouteInCells(cellTexts, config),
  };
}

// 区間セル内の駅名が区切りなしで連結されていた場合は、設定済みルートとの完全一致で復元する。
// 商品名など別セルは判定に使わず、日付の次にある区間セルだけを見る。
function findConfiguredRouteInCells(cellTexts: string[], config: Config): ReceiptFileMetadata["route"] {
  const routeCell = compactRouteText(cellTexts[1] ?? "");
  const configuredRoutes = [config.receipt.outboundRoute, config.receipt.returnRoute];

  for (const route of configuredRoutes) {
    const from = normalizeStationName(route.from);
    const to = normalizeStationName(route.to);
    if (routeCell === compactRouteText(`${from}${to}`)) {
      return { from, to };
    }
  }

  return null;
}

function compactRouteText(value: string): string {
  return value.replace(/\s+/g, "").replaceAll("駅", "").trim();
}

// 一覧へ戻るために page.goto を使う。
// ブラウザバックではJR九州側が操作継続不可の画面を出すことがあるため。
async function ensureListPage(page: Page, listUrl: string): Promise<void> {
  if (page.url() !== listUrl) {
    await page.goto(listUrl, { waitUntil: "domcontentloaded" });
  }
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
}
