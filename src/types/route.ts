import type { DepartureDate } from "./targetMonth.js";

export type RouteInfo = {
  from: string;
  to: string;
};

export type ReceiptFileMetadata = {
  departureDate: DepartureDate | null;
  route: RouteInfo | null;
};
