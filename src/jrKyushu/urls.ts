export function isReceiptPageUrl(url: string): boolean {
  return /\/pc\/reserve\/\d+(?:[/?#]|$)/.test(url);
}

export function isIntermediateReceiptPageUrl(url: string): boolean {
  return /\/pc\/rereserve\/ReresvDetail\/print(?:[/?#]|$)/.test(url);
}
