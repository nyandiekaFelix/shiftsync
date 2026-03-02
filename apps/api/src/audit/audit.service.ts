import { Injectable } from '@nestjs/common';
import { AuditAction, AuditEntityType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

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
    const limit = Math.min(Math.max(input.limit ?? 200, 1), 5000);
    const createdAtFilter: { gte?: Date; lte?: Date } = {};
    if (input.from) {
      createdAtFilter.gte = input.from;
    }
    if (input.to) {
      createdAtFilter.lte = input.to;
    }

    return this.prisma.db.auditLog.findMany({
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
