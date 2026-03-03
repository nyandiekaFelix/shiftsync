import { ForbiddenException, Injectable } from '@nestjs/common';
import { AuditAction, AuditEntityType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, Role } from '@shiftsync/shared-types';

type JsonObject = Record<string, unknown>;
type TxClient = Parameters<
  Parameters<PrismaService['db']['$transaction']>[0]
>[0];

export interface CreateAuditLogInput {
  entityType: AuditEntityType;
  entityId: string;
  action: AuditAction;
  actorId?: string;
  targetUserId?: string;
  before?: unknown;
  after?: unknown;
}

export interface AuditLogQueryInput {
  shiftId?: string;
  userId?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  locationId?: string;
  actor?: AuthUser;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async createLog(tx: TxClient, input: CreateAuditLogInput) {
    const before = toJsonObject(input.before);
    const after = toJsonObject(input.after);
    const diff = computeDiff(before, after);

    return tx.auditLog.create({
      data: {
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        actorId: input.actorId,
        targetUserId: input.targetUserId,
        before,
        after,
        diff,
      },
    });
  }

  async list(input: AuditLogQueryInput) {
    if (input.actor?.role === Role.MANAGER) {
      if (!input.locationId) {
        throw new ForbiddenException(
          'Managers must provide a locationId when listing audit logs',
        );
      }
      const manager = await this.prisma.db.user.findUnique({
        where: { id: input.actor.id },
        select: { certifiedLocations: true },
      });
      if (!manager || !manager.certifiedLocations.includes(input.locationId)) {
        throw new ForbiddenException(
          `You are not authorized to access location: ${input.locationId}`,
        );
      }
    }

    const limit = Math.min(Math.max(input.limit ?? 200, 1), 5000);
    const createdAtFilter: { gte?: Date; lte?: Date } = {};
    if (input.from) {
      createdAtFilter.gte = input.from;
    }
    if (input.to) {
      createdAtFilter.lte = input.to;
    }

    const logs = await this.prisma.db.auditLog.findMany({
      where: {
        ...(input.shiftId
          ? {
              entityType: AuditEntityType.SHIFT,
              entityId: input.shiftId,
            }
          : {}),
        ...(input.userId
          ? {
              OR: [{ actorId: input.userId }, { targetUserId: input.userId }],
            }
          : {}),
        ...(Object.keys(createdAtFilter).length > 0
          ? { createdAt: createdAtFilter }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }],
      take: limit,
    });

    if (!input.locationId) {
      return logs;
    }

    const shiftLogIds = logs
      .filter((log) => log.entityType === AuditEntityType.SHIFT)
      .map((log) => log.entityId);
    const assignmentLogIds = logs
      .filter((log) => log.entityType === AuditEntityType.ASSIGNMENT)
      .map((log) => log.entityId);
    const swapLogIds = logs
      .filter((log) => log.entityType === AuditEntityType.SWAP_REQUEST)
      .map((log) => log.entityId);

    const [shifts, assignments, swaps] = await Promise.all([
      shiftLogIds.length
        ? this.prisma.db.shift.findMany({
            where: {
              id: { in: shiftLogIds },
              locationId: input.locationId,
            },
            select: { id: true },
          })
        : Promise.resolve<Array<{ id: string }>>([]),
      assignmentLogIds.length
        ? this.prisma.db.assignment.findMany({
            where: {
              id: { in: assignmentLogIds },
              shift: { locationId: input.locationId },
            },
            select: { id: true },
          })
        : Promise.resolve<Array<{ id: string }>>([]),
      swapLogIds.length
        ? this.prisma.db.swapRequest.findMany({
            where: {
              id: { in: swapLogIds },
              shift: { locationId: input.locationId },
            },
            select: { id: true },
          })
        : Promise.resolve<Array<{ id: string }>>([]),
    ]);

    const allowedShiftIds = new Set(shifts.map((item) => item.id));
    const allowedAssignmentIds = new Set(assignments.map((item) => item.id));
    const allowedSwapIds = new Set(swaps.map((item) => item.id));

    return logs.filter((log) => {
      if (log.entityType === AuditEntityType.SHIFT) {
        return allowedShiftIds.has(log.entityId);
      }
      if (log.entityType === AuditEntityType.ASSIGNMENT) {
        return allowedAssignmentIds.has(log.entityId);
      }
      if (log.entityType === AuditEntityType.SWAP_REQUEST) {
        return allowedSwapIds.has(log.entityId);
      }
      return false;
    });
  }

  async listByShift(shiftId: string, limit = 200) {
    return this.list({ shiftId, limit });
  }

  async listByUser(userId: string, limit = 200) {
    return this.list({ userId, limit });
  }
}

function toJsonObject(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function computeDiff(
  before?: Prisma.InputJsonValue,
  after?: Prisma.InputJsonValue,
): Prisma.InputJsonValue | undefined {
  const beforeObj = (before as JsonObject | undefined) ?? {};
  const afterObj = (after as JsonObject | undefined) ?? {};
  const keys = new Set([...Object.keys(beforeObj), ...Object.keys(afterObj)]);
  const diff: JsonObject = {};

  keys.forEach((key) => {
    const prev = beforeObj[key];
    const next = afterObj[key];

    if (JSON.stringify(prev) !== JSON.stringify(next)) {
      diff[key] = { before: prev, after: next };
    }
  });

  return Object.keys(diff).length > 0
    ? (diff as Prisma.InputJsonValue)
    : undefined;
}
