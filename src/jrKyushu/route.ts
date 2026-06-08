import type { RouteInfo } from "../types/route.js";

// 予約一覧や領収書に表示される区間文字列を、出発駅・到着駅に分解する。
// 画面上では「戸畑 ▶ 博多」のように表示されるため、複数の矢印表記を受け付ける。
export function parseRouteInfo(text: string): RouteInfo | null {
  const normalizedText = text.replace(/\s+/g, " ").trim();
  const match = /^(.+?)\s*(?:▶|→|⇒|>|-)\s*(.+)$/.exec(normalizedText);
  if (!match) {
    return null;
  }

  const from = normalizeStationName(match[1]);
  const to = normalizeStationName(match[2]);
  if (!from || !to) {
    return null;
  }

  return { from, to };
}

// 予約一覧では「区間」列が「出発駅」「矢印」「到着駅」の複数セルに分かれることがある。
// そのため、行全体のセル文字列から区間を復元する。
export function parseRouteInfoFromCells(cellTexts: string[]): RouteInfo | null {
  const firstRouteCellIndex = looksLikeDepartureDate(cellTexts[0] ?? "") ? 1 : 0;
  const routeCell = cellTexts[firstRouteCellIndex] ?? "";
  const routeFromSingleCell = parseRouteInfoFromSingleCell(routeCell);
  if (routeFromSingleCell) {
    return routeFromSingleCell;
  }

  for (let index = firstRouteCellIndex; index < cellTexts.length; index += 1) {
    if (!isArrowCell(cellTexts[index])) {
      continue;
    }

    const from = findNearestStationBefore(cellTexts, index, firstRouteCellIndex);
    const to = findNearestStationAfter(cellTexts, index);
    if (from && to) {
      return { from, to };
    }
  }

  for (const cell of cellTexts) {
    const route = parseRouteInfo(cell);
    if (route) {
      return route;
    }
  }

  return null;
}

export function formatRoute(route: RouteInfo): string {
  return `${route.from}⇒${route.to}`;
}

export function normalizeStationName(value: string): string {
  return value
    .replace(/\s+/g, "")
    .replace(/駅$/u, "")
    .trim();
}

function looksLikeDepartureDate(value: string): boolean {
  return /\d{4}年\s*\d{1,2}月\s*\d{1,2}日/.test(value);
}

function isArrowCell(value: string): boolean {
  return /^(?:▶|→|⇒|>|-)$/.test(value.trim());
}

function parseRouteInfoFromSingleCell(value: string): RouteInfo | null {
  const routeWithArrow = parseRouteInfo(value);
  if (routeWithArrow) {
    return routeWithArrow;
  }

  const stations = value
    .split(/\s+/)
    .map(normalizeStationName)
    .filter((station) => station && !isArrowCell(station));

  if (stations.length !== 2) {
    return null;
  }

  return {
    from: stations[0],
    to: stations[1],
  };
}

function findNearestStationBefore(cells: string[], arrowIndex: number, minIndex: number): string | null {
  for (let index = arrowIndex - 1; index >= minIndex; index -= 1) {
    const station = normalizeStationName(cells[index] ?? "");
    if (station && !isArrowCell(station)) {
      return station;
    }
  }

  return null;
}

function findNearestStationAfter(cells: string[], arrowIndex: number): string | null {
  for (let index = arrowIndex + 1; index < cells.length; index += 1) {
    const station = normalizeStationName(cells[index] ?? "");
    if (station && !isArrowCell(station)) {
      return station;
    }
  }

  return null;
}
