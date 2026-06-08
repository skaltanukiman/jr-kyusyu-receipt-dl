import type { Locator, Page } from "playwright";
import type { Config } from "../types/config.js";

// 設定された文言に一致するリンクまたはボタンを探す共通処理。
// JR九州側のHTMLが a/button のどちらでも拾えるようにしている。
function findControls(page: Page, patterns: string[]): Locator {
  const pattern = new RegExp(patterns.map(escapeRegExp).join("|"));
  return page.getByRole("link", { name: pattern }).or(
    page.getByRole("button", { name: pattern }),
  );
}

// 詳細画面や中間画面に出る領収書表示用の操作要素を探す。
export function findReceiptControls(page: Page, config: Config): Locator {
  return findControls(page, config.receiptLinkPatterns);
}

// 予約一覧テーブルの各行にある「詳細」ボタンを探す。
export function findDetailControls(page: Page, config: Config): Locator {
  return findControls(page, config.detailButtonPatterns);
}

// 領収書ページ上の「印刷」操作を探す。
// roleで取れない場合があるため、表示テキストでも拾う。
export function findPrintControls(page: Page, config: Config): Locator {
  const pattern = new RegExp(config.printButtonPatterns.map(escapeRegExp).join("|"));
  return findControls(page, config.printButtonPatterns).or(page.getByText(pattern));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
