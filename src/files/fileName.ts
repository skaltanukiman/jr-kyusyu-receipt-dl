// 保存ファイル名に使う年月は、現在日の前月を既定にしている。
// 毎月前月分の交通費を処理する運用に合わせたもの。
function previousMonth(): { year: string; month: string } {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return {
    year: String(date.getFullYear()),
    month: String(date.getMonth() + 1).padStart(2, "0"),
  };
}

// 設定ファイルのテンプレートから保存ファイル名を作る。
// index は同じ月に複数領収書がある前提で2桁連番にする。
export function formatFileName(template: string, index: number): string {
  const { year, month } = previousMonth();
  return template
    .replaceAll("{year}", year)
    .replaceAll("{month}", month)
    .replaceAll("{index}", String(index).padStart(2, "0"));
}
