import {
  ConstraintIssue,
  ConstraintRuleCode,
  ConstraintSeverity,
} from '@shiftsync/shared-types';
import { RuleEvaluationContext, RuleValidator } from '../constraint.types';
import {
  listCoveredLocalDateKeys,
  toProxyUtcMidnight,
} from '../timezone.utils';

function longestStreakContainingTarget(
  allKeys: string[],
  targetKeys: string[],
): number {
  const unique = new Set(allKeys);
  const dayNumbers = [...unique]
    .map((key) =>
      Math.floor(toProxyUtcMidnight(key).getTime() / (1000 * 60 * 60 * 24)),
    )
    .sort((a, b) => a - b);
  const targetDayNumbers = new Set(
    targetKeys.map((key) =>
      Math.floor(toProxyUtcMidnight(key).getTime() / (1000 * 60 * 60 * 24)),
    ),
  );

  let maxContainingStreak = 0;
  let streakStart = 0;

  for (let index = 0; index < dayNumbers.length; index += 1) {
    if (index === 0 || dayNumbers[index] !== dayNumbers[index - 1] + 1) {
      streakStart = index;
    }

    const streakEnd = index;
    const streakLength = streakEnd - streakStart + 1;
    const containsTarget = dayNumbers
      .slice(streakStart, streakEnd + 1)
      .some((day) => targetDayNumbers.has(day));

    if (containsTarget) {
      maxContainingStreak = Math.max(maxContainingStreak, streakLength);
    }
  }

  return maxContainingStreak;
}

export class ConsecutiveDaysRule implements RuleValidator {
  evaluate(context: RuleEvaluationContext): ConstraintIssue[] {
    const timezone = context.shift.location.timezone;
    const existingWorkDays = context.assignments.flatMap((assignment) =>
      listCoveredLocalDateKeys(
        assignment.shift.startTime,
        assignment.shift.endTime,
        timezone,
      ),
    );
    const newShiftDays = listCoveredLocalDateKeys(
      context.shift.startTime,
      context.shift.endTime,
      timezone,
    );

    const streak = longestStreakContainingTarget(
      [...existingWorkDays, ...newShiftDays],
      newShiftDays,
    );

    if (streak >= 7) {
      if (!context.managerOverrideReason?.trim()) {
        return [
          {
            rule: ConstraintRuleCode.CONSECUTIVE_DAY_7_OVERRIDE_REQUIRED,
            severity: ConstraintSeverity.BLOCK,
            message:
              'Assigning this shift creates a 7th consecutive work day and requires manager override notes.',
            meta: { consecutiveDays: streak, overrideRequired: true },
          },
        ];
      }

      return [];
    }

    if (streak >= 6) {
      return [
        {
          rule: ConstraintRuleCode.CONSECUTIVE_DAY_6,
          severity: ConstraintSeverity.WARN,
          message: 'Assigning this shift creates a 6th consecutive work day.',
          meta: { consecutiveDays: streak },
        },
      ];
    }

    return [];
  }
}
