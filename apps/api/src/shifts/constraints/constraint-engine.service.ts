import { Injectable } from '@nestjs/common';
import { Availability, Role, Shift, User } from '@prisma/client';
import {
  AssignmentSuggestion,
  ConstraintSeverity,
} from '@shiftsync/shared-types';
import {
  AssignmentWithShift,
  ConstraintEvaluationResult,
  RuleEvaluationContext,
  RuleValidator,
  splitConstraintIssues,
} from './constraint.types';
import { SkillCertificationRule } from './rules/skill-certification.rule';
import { AvailabilityRule } from './rules/availability.rule';
import { BookingAndRestRule } from './rules/booking-rest.rule';
import { HoursRule } from './rules/hours.rule';
import { ConsecutiveDaysRule } from './rules/consecutive-days.rule';
import { PrismaService } from '../../prisma/prisma.service';

type TxClient = Parameters<
  Parameters<PrismaService['db']['$transaction']>[0]
>[0];

type ShiftWithLocation = Shift & {
  location: {
    id: string;
    timezone: string;
    name: string;
    address: string | null;
    deletedAt: Date | null;
  };
  assignments: {
    id: string;
    userId: string;
    shiftId: string;
    deletedAt: Date | null;
  }[];
};

@Injectable()
export class ConstraintEngineService {
  private readonly rules: RuleValidator[] = [
    new SkillCertificationRule(),
    new AvailabilityRule(),
    new BookingAndRestRule(),
    new HoursRule(),
    new ConsecutiveDaysRule(),
  ];

  private readonly hardRules: RuleValidator[] = [
    new SkillCertificationRule(),
    new AvailabilityRule(),
    new BookingAndRestRule(),
    new HoursRule(),
    new ConsecutiveDaysRule(),
  ];

  async evaluate(
    tx: TxClient,
    params: {
      shift: ShiftWithLocation;
      user: User;
      managerOverrideReason?: string;
    },
  ): Promise<ConstraintEvaluationResult> {
    const assignments = await this.loadAssignments(tx, params.user.id);
    const availabilities = await this.loadAvailabilities(tx, params.user.id);
    const context: RuleEvaluationContext = {
      shift: params.shift,
      user: params.user,
      assignments,
      availabilities,
      managerOverrideReason: params.managerOverrideReason,
    };

    const issues = this.rules.flatMap((rule) => rule.evaluate(context));
    const { blocks, warnings } = splitConstraintIssues(issues);

    const suggestions =
      blocks.length > 0
        ? await this.findSuggestions(tx, params.shift, params.user.id)
        : [];

    return { blocks, warnings, suggestions };
  }

  private async findSuggestions(
    tx: TxClient,
    shift: ShiftWithLocation,
    excludedUserId: string,
  ): Promise<AssignmentSuggestion[]> {
    const potentialStaff = await tx.user.findMany({
      where: {
        role: Role.STAFF,
        id: { not: excludedUserId },
        skills: { has: shift.requiredSkill },
        certifiedLocations: { has: shift.locationId },
        assignments: {
          none: {
            shiftId: shift.id,
            deletedAt: null,
          },
        },
      },
      orderBy: { name: 'asc' },
      take: 15,
    });

    const suggestions: AssignmentSuggestion[] = [];

    for (const candidate of potentialStaff) {
      const assignments = await this.loadAssignments(tx, candidate.id);
      const availabilities = await this.loadAvailabilities(tx, candidate.id);
      const context: RuleEvaluationContext = {
        shift,
        user: candidate,
        assignments,
        availabilities,
      };
      const hardRuleIssues = this.hardRules.flatMap((rule) =>
        rule
          .evaluate(context)
          .filter((issue) => issue.severity === ConstraintSeverity.BLOCK),
      );

      if (hardRuleIssues.length === 0) {
        suggestions.push({ userId: candidate.id, name: candidate.name });
      }

      if (suggestions.length >= 3) {
        break;
      }
    }

    return suggestions;
  }

  private async loadAssignments(
    tx: TxClient,
    userId: string,
  ): Promise<AssignmentWithShift[]> {
    const assignments = await tx.assignment.findMany({
      where: { userId },
      include: {
        shift: {
          include: { location: true },
        },
      },
      orderBy: {
        shift: {
          startTime: 'asc',
        },
      },
    });

    return assignments as unknown as AssignmentWithShift[];
  }

  private async loadAvailabilities(
    tx: TxClient,
    userId: string,
  ): Promise<Availability[]> {
    return tx.availability.findMany({
      where: { userId },
      orderBy: [{ type: 'desc' }, { dayOfWeek: 'asc' }],
    });
  }
}
