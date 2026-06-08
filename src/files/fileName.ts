function previousMonth(): { year: string; month: string } {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return {
    year: String(date.getFullYear()),
    month: String(date.getMonth() + 1).padStart(2, "0"),
  };
}

export function formatFileName(template: string, index: number): string {
  const { year, month } = previousMonth();
  return template
    .replaceAll("{year}", year)
    .replaceAll("{month}", month)
    .replaceAll("{index}", String(index).padStart(2, "0"));
}
