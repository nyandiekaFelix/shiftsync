import { Availability, Location, Shift, User } from '@prisma/client';
import {
  AssignmentSuggestion,
  ConstraintIssue,
  ConstraintSeverity,
} from '@shiftsync/shared-types';

export type AssignmentWithShift = {
  id: string;
  shiftId: string;
  userId: string;
  shift: Shift & { location: Location };
};

export interface RuleEvaluationContext {
  shift: Shift & { location: Location };
  user: User;
  availabilities: Availability[];
  assignments: AssignmentWithShift[];
  managerOverrideReason?: string;
}

export interface RuleValidator {
  evaluate(context: RuleEvaluationContext): ConstraintIssue[];
}

export interface ConstraintEvaluationResult {
  blocks: ConstraintIssue[];
  warnings: ConstraintIssue[];
  suggestions: AssignmentSuggestion[];
}

export function splitConstraintIssues(issues: ConstraintIssue[]): {
  blocks: ConstraintIssue[];
  warnings: ConstraintIssue[];
} {
  return {
    blocks: issues.filter(
      (issue) => issue.severity === ConstraintSeverity.BLOCK,
    ),
    warnings: issues.filter(
      (issue) => issue.severity === ConstraintSeverity.WARN,
    ),
  };
}
