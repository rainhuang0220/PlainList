export function applyWeeklyReaderScrollReset(
  reader: { scrollTop: number } | null,
  nextWeek: string,
  prevWeek: string | undefined,
): void {
  if (!reader) return;
  if (!nextWeek || nextWeek === prevWeek) return;
  reader.scrollTop = 0;
}
