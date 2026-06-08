export type RouteConfig = {
  from: string;
  to: string;
  number: number;
};

export type ReceiptConfig = {
  name: string;
  expenseItem: string;
  outboundRoute: RouteConfig;
  returnRoute: RouteConfig;
};

export type Config = {
  startUrl: string;
  downloadDirectory: string;
  receipt: ReceiptConfig;
  receiptLinkPatterns: string[];
  detailButtonPatterns: string[];
  printButtonPatterns: string[];
  maxReceipts: number;
  edgeExecutablePath?: string;
  startupTimeoutMs: number;
};
