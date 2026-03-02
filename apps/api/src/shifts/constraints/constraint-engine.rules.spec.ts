import { AvailabilityType, Shift, Skill } from '@prisma/client';
import {
  ConstraintRuleCode,
  ConstraintSeverity,
} from '@shiftsync/shared-types';
import { RuleEvaluationContext } from './constraint.types';
import { SkillCertificationRule } from './rules/skill-certification.rule';
import { AvailabilityRule } from './rules/availability.rule';
import { BookingAndRestRule } from './rules/booking-rest.rule';
import { HoursRule } from './rules/hours.rule';
import { ConsecutiveDaysRule } from './rules/consecutive-days.rule';

const location = {
  id: 'loc-1',
  name: 'HQ',
  timezone: 'UTC',
  address: null,
  deletedAt: null,
};

function makeShift(
  start: string,
  end: string,
): Shift & { location: typeof location } {
  return {
    id: 'shift-1',
    locationId: 'loc-1',
    requiredHeadcount: 1,
    requiredSkill: Skill.SERVER,
    startTime: new Date(start),
    endTime: new Date(end),
    status: 'DRAFT',
    deletedAt: null,
    location,
    assignments: [],
  } as unknown as Shift & { location: typeof location };
}

function makeContext(
  overrides: Partial<RuleEvaluationContext> = {},
): RuleEvaluationContext {
  return {
    shift: makeShift('2026-03-02T09:00:00.000Z', '2026-03-02T17:00:00.000Z'),
    user: {
      id: 'user-1',
      email: 'staff@example.com',
      name: 'Staff Member',
      role: 'STAFF',
      password: 'x',
      skills: [Skill.SERVER],
      certifiedLocations: ['loc-1'],
      deletedAt: null,
    },
    availabilities: [
      {
        id: 'a1',
        userId: 'user-1',
        type: AvailabilityType.RECURRING,
        dayOfWeek: 1,
        startTime: '09:00',
        endTime: '17:00',
        date: null,
        deletedAt: null,
      },
    ],
    assignments: [],
    ...overrides,
  } as RuleEvaluationContext;
}

describe('Constraint rules', () => {
  it('blocks on skill mismatch', () => {
    const rule = new SkillCertificationRule();
    const issues = rule.evaluate(
      makeContext({
        user: { ...makeContext().user, skills: [Skill.HOST] },
      }),
    );

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule: ConstraintRuleCode.SKILL_MISMATCH,
          severity: ConstraintSeverity.BLOCK,
        }),
      ]),
    );
  });

  it('blocks on certification mismatch', () => {
    const rule = new SkillCertificationRule();
    const issues = rule.evaluate(
      makeContext({
        user: { ...makeContext().user, certifiedLocations: ['loc-2'] },
      }),
    );

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule: ConstraintRuleCode.CERTIFICATION_MISMATCH,
          severity: ConstraintSeverity.BLOCK,
        }),
      ]),
    );
  });

  it('blocks when availability window does not cover shift', () => {
    const rule = new AvailabilityRule();
    const issues = rule.evaluate(
      makeContext({
        availabilities: [
          {
            id: 'a2',
            userId: 'user-1',
            type: AvailabilityType.RECURRING,
            dayOfWeek: 1,
            startTime: '10:00',
            endTime: '16:00',
            date: null,
            deletedAt: null,
          },
        ],
      }),
    );

    expect(issues[0].rule).toBe(ConstraintRuleCode.AVAILABILITY_VIOLATION);
    expect(issues[0].severity).toBe(ConstraintSeverity.BLOCK);
  });

  it('allows overnight shifts covered by split day windows', () => {
    const rule = new AvailabilityRule();
    const issues = rule.evaluate(
      makeContext({
        shift: makeShift(
          '2026-03-02T22:00:00.000Z',
          '2026-03-03T04:00:00.000Z',
        ),
        availabilities: [
          {
            id: 'a3',
            userId: 'user-1',
            type: AvailabilityType.RECURRING,
            dayOfWeek: 1,
            startTime: '22:00',
            endTime: '23:59',
            date: null,
            deletedAt: null,
          },
          {
            id: 'a4',
            userId: 'user-1',
            type: AvailabilityType.RECURRING,
            dayOfWeek: 2,
            startTime: '00:00',
            endTime: '06:00',
            date: null,
            deletedAt: null,
          },
        ],
      }),
    );

    expect(issues).toEqual([]);
  });

  it('blocks on overlapping assignment', () => {
    const rule = new BookingAndRestRule();
    const issues = rule.evaluate(
      makeContext({
        assignments: [
          {
            id: 'as1',
            shiftId: 's-existing',
            userId: 'user-1',
            shift: makeShift(
              '2026-03-02T12:00:00.000Z',
              '2026-03-02T19:00:00.000Z',
            ),
          },
        ],
      }),
    );

    expect(issues[0].rule).toBe(ConstraintRuleCode.DOUBLE_BOOKING);
  });

  it('blocks when rest period is below 10 hours', () => {
    const rule = new BookingAndRestRule();
    const issues = rule.evaluate(
      makeContext({
        shift: makeShift(
          '2026-03-03T06:00:00.000Z',
          '2026-03-03T14:00:00.000Z',
        ),
        assignments: [
          {
            id: 'as2',
            shiftId: 's-existing',
            userId: 'user-1',
            shift: makeShift(
              '2026-03-02T18:00:00.000Z',
              '2026-03-02T23:00:00.000Z',
            ),
          },
        ],
      }),
    );

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: ConstraintRuleCode.MIN_REST }),
      ]),
    );
  });

  it('flags daily warning above 8h', () => {
    const rule = new HoursRule();
    const issues = rule.evaluate(
      makeContext({
        assignments: [
          {
            id: 'as3',
            shiftId: 's-existing',
            userId: 'user-1',
            shift: makeShift(
              '2026-03-02T00:00:00.000Z',
              '2026-03-02T04:00:00.000Z',
            ),
          },
        ],
      }),
    );

    expect(
      issues.some(
        (issue) =>
          issue.rule === ConstraintRuleCode.DAILY_WARNING_8H &&
          issue.severity === ConstraintSeverity.WARN,
      ),
    ).toBe(true);
  });

  it('blocks daily hours above 12h', () => {
    const rule = new HoursRule();
    const issues = rule.evaluate(
      makeContext({
        assignments: [
          {
            id: 'as4',
            shiftId: 's-existing',
            userId: 'user-1',
            shift: makeShift(
              '2026-03-02T00:00:00.000Z',
              '2026-03-02T06:00:00.000Z',
            ),
          },
        ],
      }),
    );

    expect(
      issues.some(
        (issue) =>
          issue.rule === ConstraintRuleCode.DAILY_LIMIT_12H &&
          issue.severity === ConstraintSeverity.BLOCK,
      ),
    ).toBe(true);
  });

  it('flags weekly warning and overtime warning', () => {
    const rule = new HoursRule();
    const issues = rule.evaluate(
      makeContext({
        assignments: [
          {
            id: 'w1',
            shiftId: 'w1',
            userId: 'user-1',
            shift: makeShift(
              '2026-03-02T00:00:00.000Z',
              '2026-03-02T10:00:00.000Z',
            ),
          },
          {
            id: 'w2',
            shiftId: 'w2',
            userId: 'user-1',
            shift: makeShift(
              '2026-03-03T00:00:00.000Z',
              '2026-03-03T10:00:00.000Z',
            ),
          },
          {
            id: 'w3',
            shiftId: 'w3',
            userId: 'user-1',
            shift: makeShift(
              '2026-03-04T00:00:00.000Z',
              '2026-03-04T10:00:00.000Z',
            ),
          },
          {
            id: 'w4',
            shiftId: 'w4',
            userId: 'user-1',
            shift: makeShift(
              '2026-03-05T00:00:00.000Z',
              '2026-03-05T10:00:00.000Z',
            ),
          },
        ],
      }),
    );

    expect(
      issues.some(
        (issue) => issue.rule === ConstraintRuleCode.WEEKLY_OVERTIME_40H,
      ),
    ).toBe(true);
  });

  it('warns on 6th consecutive day and blocks on 7th without override', () => {
    const rule = new ConsecutiveDaysRule();
    const sixDayIssues = rule.evaluate(
      makeContext({
        assignments: [
          {
            id: 'c1',
            shiftId: 'c1',
            userId: 'user-1',
            shift: makeShift(
              '2026-02-25T09:00:00.000Z',
              '2026-02-25T12:00:00.000Z',
            ),
          },
          {
            id: 'c2',
            shiftId: 'c2',
            userId: 'user-1',
            shift: makeShift(
              '2026-02-26T09:00:00.000Z',
              '2026-02-26T12:00:00.000Z',
            ),
          },
          {
            id: 'c3',
            shiftId: 'c3',
            userId: 'user-1',
            shift: makeShift(
              '2026-02-27T09:00:00.000Z',
              '2026-02-27T12:00:00.000Z',
            ),
          },
          {
            id: 'c4',
            shiftId: 'c4',
            userId: 'user-1',
            shift: makeShift(
              '2026-02-28T09:00:00.000Z',
              '2026-02-28T12:00:00.000Z',
            ),
          },
          {
            id: 'c5',
            shiftId: 'c5',
            userId: 'user-1',
            shift: makeShift(
              '2026-03-01T09:00:00.000Z',
              '2026-03-01T12:00:00.000Z',
            ),
          },
        ],
      }),
    );

    expect(
      sixDayIssues.some(
        (issue) => issue.rule === ConstraintRuleCode.CONSECUTIVE_DAY_6,
      ),
    ).toBe(true);

    const sevenDayIssues = rule.evaluate(
      makeContext({
        shift: makeShift(
          '2026-03-03T09:00:00.000Z',
          '2026-03-03T12:00:00.000Z',
        ),
        assignments: [
          {
            id: 'c1',
            shiftId: 'c1',
            userId: 'user-1',
            shift: makeShift(
              '2026-02-25T09:00:00.000Z',
              '2026-02-25T12:00:00.000Z',
            ),
          },
          {
            id: 'c2',
            shiftId: 'c2',
            userId: 'user-1',
            shift: makeShift(
              '2026-02-26T09:00:00.000Z',
              '2026-02-26T12:00:00.000Z',
            ),
          },
          {
            id: 'c3',
            shiftId: 'c3',
            userId: 'user-1',
            shift: makeShift(
              '2026-02-27T09:00:00.000Z',
              '2026-02-27T12:00:00.000Z',
            ),
          },
          {
            id: 'c4',
            shiftId: 'c4',
            userId: 'user-1',
            shift: makeShift(
              '2026-02-28T09:00:00.000Z',
              '2026-02-28T12:00:00.000Z',
            ),
          },
          {
            id: 'c5',
            shiftId: 'c5',
            userId: 'user-1',
            shift: makeShift(
              '2026-03-01T09:00:00.000Z',
              '2026-03-01T12:00:00.000Z',
            ),
          },
          {
            id: 'c6',
            shiftId: 'c6',
            userId: 'user-1',
            shift: makeShift(
              '2026-03-02T09:00:00.000Z',
              '2026-03-02T12:00:00.000Z',
            ),
          },
        ],
      }),
    );

    expect(
      sevenDayIssues.some(
        (issue) =>
          issue.rule === ConstraintRuleCode.CONSECUTIVE_DAY_7_OVERRIDE_REQUIRED,
      ),
    ).toBe(true);
  });
});
