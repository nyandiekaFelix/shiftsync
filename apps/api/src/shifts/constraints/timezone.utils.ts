const weekdayToIsoMap: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  isoWeekday: number;
};

function parsePart(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): string {
  return parts.find((part) => part.type === type)?.value ?? '';
}

export function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hour12: false,
  });
  const parts = formatter.formatToParts(date);

  const weekday = parsePart(parts, 'weekday');
  return {
    year: Number(parsePart(parts, 'year')),
    month: Number(parsePart(parts, 'month')),
    day: Number(parsePart(parts, 'day')),
    hour: Number(parsePart(parts, 'hour')),
    minute: Number(parsePart(parts, 'minute')),
    isoWeekday: weekdayToIsoMap[weekday] ?? 1,
  };
}

export function toLocalDateKey(date: Date, timeZone: string): string {
  const parts = getZonedParts(date, timeZone);
  const month = String(parts.month).padStart(2, '0');
  const day = String(parts.day).padStart(2, '0');
  return `${parts.year}-${month}-${day}`;
}

export function toProxyUtcMidnight(localDateKey: string): Date {
  const [year, month, day] = localDateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

export function getMinutesSinceMidnight(date: Date, timeZone: string): number {
  const parts = getZonedParts(date, timeZone);
  return parts.hour * 60 + parts.minute;
}

export function parseHHmmToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

export function getShiftDurationHours(start: Date, end: Date): number {
  return (end.getTime() - start.getTime()) / (1000 * 60 * 60);
}

export function listCoveredLocalDateKeys(
  start: Date,
  end: Date,
  timeZone: string,
): string[] {
  const startKey = toLocalDateKey(start, timeZone);
  const endKey = toLocalDateKey(end, timeZone);
  const startDate = toProxyUtcMidnight(startKey);
  const endDate = toProxyUtcMidnight(endKey);

  const keys: string[] = [];
  for (
    let current = startDate;
    current.getTime() <= endDate.getTime();
    current = new Date(current.getTime() + 24 * 60 * 60 * 1000)
  ) {
    const year = current.getUTCFullYear();
    const month = String(current.getUTCMonth() + 1).padStart(2, '0');
    const day = String(current.getUTCDate()).padStart(2, '0');
    keys.push(`${year}-${month}-${day}`);
  }

  return keys;
}

export function isIntervalOverlap(
  startA: Date,
  endA: Date,
  startB: Date,
  endB: Date,
): boolean {
  return startA < endB && startB < endA;
}

export function getWeekStartFromLocalDateKey(localDateKey: string): string {
  const localMidnight = toProxyUtcMidnight(localDateKey);
  const day = localMidnight.getUTCDay();
  const dayOffset = day === 0 ? 6 : day - 1;
  const weekStart = new Date(
    localMidnight.getTime() - dayOffset * 24 * 60 * 60 * 1000,
  );

  const year = weekStart.getUTCFullYear();
  const month = String(weekStart.getUTCMonth() + 1).padStart(2, '0');
  const dayOfMonth = String(weekStart.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${dayOfMonth}`;
}

export function addDaysToLocalDateKey(
  localDateKey: string,
  days: number,
): string {
  const date = toProxyUtcMidnight(localDateKey);
  const next = new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
  const year = next.getUTCFullYear();
  const month = String(next.getUTCMonth() + 1).padStart(2, '0');
  const day = String(next.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
