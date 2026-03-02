import {
  ConstraintIssue,
  ConstraintRuleCode,
  ConstraintSeverity,
} from '@shiftsync/shared-types';
import { RuleEvaluationContext, RuleValidator } from '../constraint.types';

export class SkillCertificationRule implements RuleValidator {
  evaluate(context: RuleEvaluationContext): ConstraintIssue[] {
    const issues: ConstraintIssue[] = [];

    if (!context.user.skills.includes(context.shift.requiredSkill)) {
      issues.push({
        rule: ConstraintRuleCode.SKILL_MISMATCH,
        severity: ConstraintSeverity.BLOCK,
        message: `${context.user.name} does not have required skill ${context.shift.requiredSkill}.`,
      });
    }

    if (!context.user.certifiedLocations.includes(context.shift.locationId)) {
      issues.push({
        rule: ConstraintRuleCode.CERTIFICATION_MISMATCH,
        severity: ConstraintSeverity.BLOCK,
        message: `${context.user.name} is not certified for this location.`,
      });
    }

    return issues;
  }
}
