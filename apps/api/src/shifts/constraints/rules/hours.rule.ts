import {
  ConstraintIssue,
  ConstraintRuleCode,
  ConstraintSeverity,
} from '@shiftsync/shared-types';
import { RuleEvaluationContext, RuleValidator } from '../constraint.types';
import {
  addDaysToLocalDateKey,
  getShiftDurationHours,
  getWeekStartFromLocalDateKey,
  toLocalDateKey,
} from '../timezone.utils';

function sumHoursForLocalDate(
  context: RuleEvaluationContext,
  targetDateKey: string,
  timezone: string,
): number {
  return context.assignments.reduce((total, assignment) => {
    const dateKey = toLocalDateKey(assignment.shift.startTime, timezone);
    return dateKey === targetDateKey
      ? total +
          getShiftDurationHours(
            assignment.shift.startTime,
            assignment.shift.endTime,
          )
      : total;
  }, 0);
}

function sumHoursForWeek(
  context: RuleEvaluationContext,
  weekStart: string,
  timezone: string,
): number {
  const weekDays = new Set<string>();
  for (let index = 0; index < 7; index += 1) {
    weekDays.add(addDaysToLocalDateKey(weekStart, index));
  }

  return context.assignments.reduce((total, assignment) => {
    const dateKey = toLocalDateKey(assignment.shift.startTime, timezone);
    if (!weekDays.has(dateKey)) {
      return total;
    }

    return (
      total +
      getShiftDurationHours(
        assignment.shift.startTime,
        assignment.shift.endTime,
      )
    );
  }, 0);
}

export class HoursRule implements RuleValidator {
  evaluate(context: RuleEvaluationContext): ConstraintIssue[] {
    const timezone = context.shift.location.timezone;
    const shiftStartKey = toLocalDateKey(context.shift.startTime, timezone);
    const shiftHours = getShiftDurationHours(
      context.shift.startTime,
      context.shift.endTime,
    );
    const projectedDailyHours =
      sumHoursForLocalDate(context, shiftStartKey, timezone) + shiftHours;

    const issues: ConstraintIssue[] = [];

    if (projectedDailyHours > 12) {
      issues.push({
        rule: ConstraintRuleCode.DAILY_LIMIT_12H,
        severity: ConstraintSeverity.BLOCK,
        message: `${context.user.name} would exceed 12 hours in a single day.`,
        meta: {
          projectedDailyHours: Number(projectedDailyHours.toFixed(2)),
        },
      });
    } else if (projectedDailyHours > 8) {
      issues.push({
        rule: ConstraintRuleCode.DAILY_WARNING_8H,
        severity: ConstraintSeverity.WARN,
        message: `${context.user.name} would exceed 8 hours in a single day.`,
        meta: {
          projectedDailyHours: Number(projectedDailyHours.toFixed(2)),
        },
      });
    }

    const weekStart = getWeekStartFromLocalDateKey(shiftStartKey);
    const projectedWeeklyHours =
      sumHoursForWeek(context, weekStart, timezone) + shiftHours;

    if (projectedWeeklyHours > 40) {
      issues.push({
        rule: ConstraintRuleCode.WEEKLY_OVERTIME_40H,
        severity: ConstraintSeverity.WARN,
        message: `${context.user.name} would exceed 40 weekly hours.`,
        meta: {
          projectedWeeklyHours: Number(projectedWeeklyHours.toFixed(2)),
          overtimeHours: Number((projectedWeeklyHours - 40).toFixed(2)),
        },
      });
    } else if (projectedWeeklyHours > 35) {
      issues.push({
        rule: ConstraintRuleCode.WEEKLY_WARNING_35H,
        severity: ConstraintSeverity.WARN,
        message: `${context.user.name} is approaching weekly overtime.`,
        meta: {
          projectedWeeklyHours: Number(projectedWeeklyHours.toFixed(2)),
        },
      });
    }

    return issues;
  }
}
