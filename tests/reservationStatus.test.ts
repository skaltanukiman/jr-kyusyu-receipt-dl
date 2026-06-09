import { describe, expect, it } from "vitest";
import {
  findReservationStatusText,
  isTargetReservationRow,
  isUsedReservationStatus,
} from "../src/jrKyushu/reservationStatus.js";

describe("isUsedReservationStatus", () => {
  it("利用済みの場合はtrueを返す", () => {
    expect(isUsedReservationStatus("利用済み")).toBe(true);
  });

  it("払戻済みの場合はfalseを返す", () => {
    expect(isUsedReservationStatus("払戻済み")).toBe(false);
  });

  it("空文字の場合はfalseを返す", () => {
    expect(isUsedReservationStatus("")).toBe(false);
  });

  it("前後に空白や改行があっても利用済みと判定する", () => {
    expect(isUsedReservationStatus(" \n 利用済み \r\n ")).toBe(true);
  });
});

describe("findReservationStatusText", () => {
  it("予約状態ヘッダーと同じ位置にあるセル文字列を取得する", () => {
    const headerTexts = ["出発日時", "区間", "きっぷ", "予約番号", "決済方法", "乗車方法", "予約状態", ""];
    const cellTexts = ["2026年 6月 5日", "博多 戸畑", "九州ネットきっぷ", "64677", "クレジットカード", "QRチケット", "利用済み", "詳細"];

    expect(findReservationStatusText(headerTexts, cellTexts)).toBe("利用済み");
  });

  it("ヘッダーが取得できない場合は詳細ボタン直前のセルを取得する", () => {
    expect(findReservationStatusText([], ["予約情報", "払戻済み", "詳細"])).toBe("払戻済み");
  });
});

describe("isTargetReservationRow", () => {
  it("予約一覧から利用済みかつ対象月の行だけを処理対象にする", () => {
    const rows = [
      { statusText: "利用済み", departure: { year: 2026, month: 6 }, id: "used-june" },
      { statusText: "払戻済み", departure: { year: 2026, month: 6 }, id: "refunded-june" },
      { statusText: "利用済み", departure: { year: 2026, month: 5 }, id: "used-may" },
    ];

    const targetRows = rows.filter((row) => isTargetReservationRow(
      row.statusText,
      row.departure,
      { kind: "month", month: 6 },
    ));

    expect(targetRows.map((row) => row.id)).toEqual(["used-june"]);
  });
});
