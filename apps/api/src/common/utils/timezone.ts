function getFormatter(timezone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function getPart(parts: Intl.DateTimeFormatPart[], type: string): string {
  return parts.find((part) => part.type === type)?.value ?? '';
}

function getOffsetMinutes(date: Date, timezone: string): number {
  const parts = getFormatter(timezone).formatToParts(date);
  const localAsUtc = Date.UTC(
    Number(getPart(parts, 'year')),
    Number(getPart(parts, 'month')) - 1,
    Number(getPart(parts, 'day')),
    Number(getPart(parts, 'hour')),
    Number(getPart(parts, 'minute')),
    Number(getPart(parts, 'second')),
  );
  return (localAsUtc - date.getTime()) / (1000 * 60);
}

function zonedDateTimeToUtc(
  timezone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second = 0,
): Date {
  let utcMillis = Date.UTC(year, month - 1, day, hour, minute, second, 0);
  for (let index = 0; index < 3; index += 1) {
    const offsetMinutes = getOffsetMinutes(new Date(utcMillis), timezone);
    utcMillis =
      Date.UTC(year, month - 1, day, hour, minute, second, 0) -
      offsetMinutes * 60 * 1000;
  }
  return new Date(utcMillis);
}

export function parseShiftInputToUtc(
  rawValue: string,
  timezone: string,
): Date | null {
  // If timezone is explicitly present, parse directly.
  if (
    /[zZ]$/.test(rawValue) ||
    /[+-]\d{2}:\d{2}$/.test(rawValue) ||
    /[+-]\d{4}$/.test(rawValue)
  ) {
    const date = new Date(rawValue);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const match = rawValue.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/,
  );
  if (!match) {
    return null;
  }

  const [, year, month, day, hour, minute, second] = match;
  return zonedDateTimeToUtc(
    timezone,
    Number(year),
    Number(month),
    Number(day),
    Number(hour),
    Number(minute),
    Number(second ?? '0'),
  );
}
