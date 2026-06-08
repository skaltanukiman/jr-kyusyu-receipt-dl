import type { Download, Page } from "playwright";

export type ReceiptClickResult =
  | { type: "download"; download: Download }
  | { type: "file"; filePath: string }
  | { type: "receiptPage"; receiptPage: Page }
  | { type: "intermediatePage"; page: Page };
