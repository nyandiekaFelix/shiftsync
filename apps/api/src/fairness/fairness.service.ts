import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Role as PrismaRole } from '@prisma/client';
import { AuthUser, FairnessReport, Role } from '@shiftsync/shared-types';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FairnessService {
  constructor(private readonly prisma: PrismaService) {}

  async getReport(
    from: string,
    to: string,
    actor?: AuthUser,
    locationId?: string,
  ): Promise<FairnessReport> {
    const rangeStart = new Date(`${from}T00:00:00.000Z`);
    const rangeEnd = new Date(`${to}T23:59:59.999Z`);

    if (
      Number.isNaN(rangeStart.getTime()) ||
      Number.isNaN(rangeEnd.getTime())
    ) {
      throw new BadRequestException('Invalid from/to date range');
    }

    if (rangeStart > rangeEnd) {
      throw new BadRequestException('from date must be before to date');
    }
    if (actor?.role === Role.MANAGER) {
      if (!locationId) {
        throw new ForbiddenException(
          'Managers must provide a locationId for fairness reports',
        );
      }
      const manager = await this.prisma.db.user.findUnique({
        where: { id: actor.id },
        select: { certifiedLocations: true },
      });
      if (!manager || !manager.certifiedLocations.includes(locationId)) {
        throw new ForbiddenException(
          `You are not authorized to access location: ${locationId}`,
        );
      }
    }

    const [staff, assignments] = await Promise.all([
      this.prisma.db.user.findMany({
        where: {
          role: PrismaRole.STAFF,
          deletedAt: null,
          ...(locationId
            ? {
                certifiedLocations: {
                  has: locationId,
                },
              }
            : {}),
        },
        select: {
          id: true,
          name: true,
          desiredWeeklyHours: true,
        },
        orderBy: [{ name: 'asc' }],
      }),
      this.prisma.db.assignment.findMany({
        where: {
          deletedAt: null,
          shift: {
            deletedAt: null,
            ...(locationId ? { locationId } : {}),
            startTime: { gte: rangeStart },
            endTime: { lte: rangeEnd },
          },
        },
        include: {
          shift: {
            include: {
              location: true,
            },
          },
        },
      }),
    ]);

    const metricsByUser = new Map(
      staff.map((member) => [
        member.id,
        {
          userId: member.id,
          name: member.name,
          totalHours: 0,
          premiumHours: 0,
          shiftCount: 0,
          desiredWeeklyHours: member.desiredWeeklyHours,
          desiredHoursDelta: 0,
        },
      ]),
    );

    assignments.forEach((assignment) => {
      const metric = metricsByUser.get(assignment.userId);
      if (!metric) {
        return;
      }

      const hours = getDurationHours(
        assignment.shift.startTime,
        assignment.shift.endTime,
      );
      metric.totalHours += hours;
      metric.shiftCount += 1;

      if (
        isPremiumShift(
          assignment.shift.startTime,
          assignment.shift.location.timezone,
        )
      ) {
        metric.premiumHours += hours;
      }
    });

    const daysInRange = Math.max(
      1,
      Math.ceil(
        (rangeEnd.getTime() - rangeStart.getTime()) / (24 * 60 * 60 * 1000),
      ) + 1,
    );
    const weeksInRange = daysInRange / 7;

    const metrics = Array.from(metricsByUser.values()).map((metric) => {
      const scaledDesiredHours = metric.desiredWeeklyHours * weeksInRange;
      return {
        ...metric,
        totalHours: round2(metric.totalHours),
        premiumHours: round2(metric.premiumHours),
        desiredHoursDelta: round2(metric.totalHours - scaledDesiredHours),
      };
    });

    const totalHoursSeries = metrics.map((metric) => metric.totalHours);
    const premiumHoursSeries = metrics.map((metric) => metric.premiumHours);

    const standardDeviationHours = round2(calculateStdDev(totalHoursSeries));
    const standardDeviationPremiumHours = round2(
      calculateStdDev(premiumHoursSeries),
    );
    const fairnessScore = round2(
      calculateFairnessScore(
        standardDeviationHours,
        standardDeviationPremiumHours,
        metrics,
      ),
    );

    return {
      from,
      to,
      locationId,
      metrics,
      standardDeviationHours,
      standardDeviationPremiumHours,
      fairnessScore,
    };
  }
}

function getDurationHours(start: Date, end: Date): number {
  return (end.getTime() - start.getTime()) / (1000 * 60 * 60);
}

export function calculateStdDev(values: number[]): number {
  if (values.length <= 1) {
    return 0;
  }

  const mean = values.reduce((acc, value) => acc + value, 0) / values.length;
  const variance =
    values.reduce((acc, value) => acc + (value - mean) ** 2, 0) / values.length;

  return Math.sqrt(variance);
}

function calculateFairnessScore(
  stdHours: number,
  stdPremiumHours: number,
  metrics: Array<{ totalHours: number; premiumHours: number }>,
): number {
  const meanHours =
    metrics.reduce((acc, metric) => acc + metric.totalHours, 0) /
    Math.max(metrics.length, 1);
  const meanPremium =
    metrics.reduce((acc, metric) => acc + metric.premiumHours, 0) /
    Math.max(metrics.length, 1);

  const hoursComponent =
    meanHours === 0 ? 100 : Math.max(0, 100 - (stdHours / meanHours) * 100);
  const premiumComponent =
    meanPremium === 0
      ? 100
      : Math.max(0, 100 - (stdPremiumHours / meanPremium) * 100);

  return 0.7 * hoursComponent + 0.3 * premiumComponent;
}

function isPremiumShift(startTime: Date, timezone: string): boolean {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(startTime);
  const weekday = parts.find((part) => part.type === 'weekday')?.value;
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0');

  if (weekday === 'Fri' || weekday === 'Sat') {
    return hour >= 17;
  }

  return false;
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}
