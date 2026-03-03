const DEFAULT_ORIGIN = 'http://localhost:3000';

function normalizeOrigin(origin: string): string | null {
  try {
    return new URL(origin).origin;
  } catch {
    return null;
  }
}

export function getAllowedOrigins(): string[] {
  const rawOrigins = process.env.FRONTEND_URL;

  if (!rawOrigins) {
    return [DEFAULT_ORIGIN];
  }

  const parsedOrigins = rawOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  const normalizedOrigins = parsedOrigins
    .map(normalizeOrigin)
    .filter((origin): origin is string => origin !== null);

  if (normalizedOrigins.length === 0) {
    return [DEFAULT_ORIGIN];
  }

  return Array.from(new Set(normalizedOrigins));
}

export function isAllowedOrigin(
  origin: string | undefined,
  allowedOrigins: readonly string[],
): boolean {
  if (!origin) {
    return true;
  }

  const normalizedOrigin = normalizeOrigin(origin);
  if (!normalizedOrigin) {
    return false;
  }

  return allowedOrigins.includes(normalizedOrigin);
}
