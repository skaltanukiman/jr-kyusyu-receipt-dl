// 領収書本体ページのURLかどうかを判定する。
// 例: /jr/pc/reserve/3235
export function isReceiptPageUrl(url: string): boolean {
  return /\/pc\/reserve\/\d+(?:[/?#]|$)/.test(url);
}

// 「領収書を表示」を押した直後に出る中間ページのURLかどうかを判定する。
// この画面ではさらに領収書表示操作が必要。
export function isIntermediateReceiptPageUrl(url: string): boolean {
  return /\/pc\/rereserve\/ReresvDetail\/print(?:[/?#]|$)/.test(url);
}
