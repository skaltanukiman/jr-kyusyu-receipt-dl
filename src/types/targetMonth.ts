export type TargetMonth =
  | { kind: "all" }
  | { kind: "month"; month: number }
  | { kind: "yearMonth"; year: number; month: number };

export type DepartureYearMonth = {
  year: number;
  month: number;
};

export type DepartureDate = DepartureYearMonth & {
  day: number;
};
