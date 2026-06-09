export type DownloadSummary = {
  totalCount: number;
  successfulCount: number;
  skippedExistingCount: number;
  skippedNoReceiptCount: number;
  plannedCount: number;
  monthlyCounts: Map<string, number>;
};
