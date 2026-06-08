export type Config = {
  startUrl: string;
  downloadDirectory: string;
  fileNameTemplate: string;
  receiptLinkPatterns: string[];
  detailButtonPatterns: string[];
  printButtonPatterns: string[];
  maxReceipts: number;
  edgeExecutablePath?: string;
  startupTimeoutMs: number;
};
