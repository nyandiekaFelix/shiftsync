import {
  ConstraintIssue,
  ConstraintRuleCode,
  ConstraintSeverity,
} from '@shiftsync/shared-types';
import { RuleEvaluationContext, RuleValidator } from '../constraint.types';
import { isIntervalOverlap } from '../timezone.utils';

export class BookingAndRestRule implements RuleValidator {
  evaluate(context: RuleEvaluationContext): ConstraintIssue[] {
    const issues: ConstraintIssue[] = [];
    const shiftStart = context.shift.startTime;
    const shiftEnd = context.shift.endTime;

    for (const assignment of context.assignments) {
      const existingStart = assignment.shift.startTime;
      const existingEnd = assignment.shift.endTime;

      if (isIntervalOverlap(shiftStart, shiftEnd, existingStart, existingEnd)) {
        issues.push({
          rule: ConstraintRuleCode.DOUBLE_BOOKING,
          severity: ConstraintSeverity.BLOCK,
          message: `${context.user.name} is already assigned to an overlapping shift.`,
          conflictingShiftId: assignment.shiftId,
          meta: {
            existingStart: existingStart.toISOString(),
            existingEnd: existingEnd.toISOString(),
            requestedStart: shiftStart.toISOString(),
            requestedEnd: shiftEnd.toISOString(),
          },
        });
        continue;
      }

      if (existingEnd <= shiftStart) {
        const restHours =
          (shiftStart.getTime() - existingEnd.getTime()) / (1000 * 60 * 60);
        if (restHours < 10) {
          issues.push({
            rule: ConstraintRuleCode.MIN_REST,
            severity: ConstraintSeverity.BLOCK,
            message: `${context.user.name} has only ${restHours.toFixed(1)} hours rest before this shift.`,
            conflictingShiftId: assignment.shiftId,
            meta: {
              existingEnd: existingEnd.toISOString(),
              requestedStart: shiftStart.toISOString(),
              restHours: Number(restHours.toFixed(2)),
            },
          });
        }
      }

      if (existingStart >= shiftEnd) {
        const restHours =
          (existingStart.getTime() - shiftEnd.getTime()) / (1000 * 60 * 60);
        if (restHours < 10) {
          issues.push({
            rule: ConstraintRuleCode.MIN_REST,
            severity: ConstraintSeverity.BLOCK,
            message: `${context.user.name} has only ${restHours.toFixed(1)} hours rest after this shift.`,
            conflictingShiftId: assignment.shiftId,
            meta: {
              existingStart: existingStart.toISOString(),
              requestedEnd: shiftEnd.toISOString(),
              restHours: Number(restHours.toFixed(2)),
            },
          });
        }
      }
    }

    return issues;
  }
}
