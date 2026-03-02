import { BadRequestException } from '@nestjs/common';
import {
  AssignmentSuggestion,
  ConstraintIssue,
  ConstraintRuleCode,
  ConstraintViolationPayload,
} from '@shiftsync/shared-types';

export class ConstraintViolationException extends BadRequestException {
  constructor(
    details: ConstraintIssue[],
    suggestions: AssignmentSuggestion[],
    message = 'Shift assignment violates scheduling constraints.',
  ) {
    const primaryRule =
      details[0]?.rule ?? ConstraintRuleCode.AVAILABILITY_VIOLATION;
    const payload: ConstraintViolationPayload = {
      statusCode: 400,
      error: 'Bad Request',
      message,
      rule: primaryRule,
      details,
      suggestions,
    };

    super(payload);
  }
}
