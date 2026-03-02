import { Availability, AvailabilityType } from '@prisma/client';
import {
  ConstraintIssue,
  ConstraintRuleCode,
  ConstraintSeverity,
} from '@shiftsync/shared-types';
import { RuleEvaluationContext, RuleValidator } from '../constraint.types';
import {
  getMinutesSinceMidnight,
  listCoveredLocalDateKeys,
  parseHHmmToMinutes,
  toLocalDateKey,
  toProxyUtcMidnight,
} from '../timezone.utils';

function isoWeekdayFromLocalDateKey(localDateKey: string): number {
  const day = toProxyUtcMidnight(localDateKey).getUTCDay();
  return day === 0 ? 7 : day;
}

function pickWindowsForLocalDate(
  availabilities: Availability[],
  localDateKey: string,
  isoWeekday: number,
  shiftTimezone: string,
): Availability[] {
  const exceptionWindows = availabilities.filter((availability) => {
    if (
      availability.type !== AvailabilityType.EXCEPTION ||
      !availability.date
    ) {
      return false;
    }

    return toLocalDateKey(availability.date, shiftTimezone) === localDateKey;
  });

  if (exceptionWindows.length > 0) {
    return exceptionWindows;
  }

  return availabilities.filter(
    (availability) =>
      availability.type === AvailabilityType.RECURRING &&
      availability.dayOfWeek === isoWeekday,
  );
}

function windowCoversSegment(
  windowStart: number,
  windowEnd: number,
  segmentStart: number,
  segmentEnd: number,
): boolean {
  const normalizedSegmentEnd =
    segmentEnd === 24 * 60 ? 24 * 60 - 1 : segmentEnd;

  // Overnight window like 22:00-06:00 is represented as two ranges.
  if (windowEnd <= windowStart) {
    const coversLateNight =
      segmentStart >= windowStart && normalizedSegmentEnd <= 24 * 60 - 1;
    const coversEarlyMorning =
      segmentStart >= 0 && normalizedSegmentEnd <= windowEnd;
    return coversLateNight || coversEarlyMorning;
  }

  return segmentStart >= windowStart && normalizedSegmentEnd <= windowEnd;
}

export class AvailabilityRule implements RuleValidator {
  evaluate(context: RuleEvaluationContext): ConstraintIssue[] {
    const shiftTimezone = context.shift.location.timezone;
    const shiftStart = context.shift.startTime;
    const shiftEnd = context.shift.endTime;
    const coveredKeys = listCoveredLocalDateKeys(
      shiftStart,
      shiftEnd,
      shiftTimezone,
    );
    const shiftStartMinutes = getMinutesSinceMidnight(
      shiftStart,
      shiftTimezone,
    );
    const shiftEndMinutes = getMinutesSinceMidnight(shiftEnd, shiftTimezone);

    for (let index = 0; index < coveredKeys.length; index += 1) {
      const localDateKey = coveredKeys[index];
      const weekday = isoWeekdayFromLocalDateKey(localDateKey);
      const windows = pickWindowsForLocalDate(
        context.availabilities,
        localDateKey,
        weekday,
        shiftTimezone,
      );

      if (windows.length === 0) {
        return [
          {
            rule: ConstraintRuleCode.AVAILABILITY_VIOLATION,
            severity: ConstraintSeverity.BLOCK,
            message: `${context.user.name} has no configured availability for this shift.`,
            meta: {
              startTime: shiftStart.toISOString(),
              endTime: shiftEnd.toISOString(),
              localDate: localDateKey,
            },
          },
        ];
      }

      const segmentStart = index === 0 ? shiftStartMinutes : 0;
      const segmentEnd =
        index === coveredKeys.length - 1 ? shiftEndMinutes : 24 * 60;
      const isSegmentCovered = windows.some((window) => {
        if (!window.startTime || !window.endTime) {
          return false;
        }

        const windowStart = parseHHmmToMinutes(window.startTime);
        const windowEnd = parseHHmmToMinutes(window.endTime);
        return windowCoversSegment(
          windowStart,
          windowEnd,
          segmentStart,
          segmentEnd,
        );
      });

      if (!isSegmentCovered) {
        return [
          {
            rule: ConstraintRuleCode.AVAILABILITY_VIOLATION,
            severity: ConstraintSeverity.BLOCK,
            message: `${context.user.name} is unavailable during this shift.`,
            meta: {
              startTime: shiftStart.toISOString(),
              endTime: shiftEnd.toISOString(),
              localDate: localDateKey,
            },
          },
        ];
      }
    }

    return [];
  }
}
