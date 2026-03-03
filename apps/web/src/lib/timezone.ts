export function toDateTimeLocalInTimeZone(
  value: Date | string,
  timeZone: string,
): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export function formatTimeInTimeZone(
  value: Date | string,
  timeZone: string,
): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function getTimeZoneLabel(timeZone: string): string {
  const value = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "short",
  }).format(new Date());
  return value.split(" ").pop() ?? timeZone;
}

export function toDateKeyInTimeZone(
  value: Date | string,
  timeZone: string,
): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
}
