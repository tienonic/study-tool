const DAY_MS = 86_400_000;

/** Parse a YYYY-MM-DD calendar date without applying a local timezone offset. */
export function calendarDayNumber(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);
  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) return null;
  return Math.floor(timestamp / DAY_MS);
}

export function isCalendarDateKey(value: unknown): value is string {
  return typeof value === 'string' && calendarDayNumber(value) !== null;
}

export function localCalendarDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function calendarDateKeyFromDay(dayNumber: number): string {
  return new Date(dayNumber * DAY_MS).toISOString().slice(0, 10);
}

export function calendarWeekday(dayNumber: number): number {
  return new Date(dayNumber * DAY_MS).getUTCDay();
}
