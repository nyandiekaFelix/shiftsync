import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AssignStaffResponse, Assignment } from '@shiftsync/shared-types';
import { ConstraintEngineService } from './constraints/constraint-engine.service';
import { ConstraintViolationException } from './constraints/constraint-violation.exception';
import { RedisLockService } from '../common/redis/redis-lock.service';
import { RealtimeService } from '../realtime/realtime.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction, AuditEntityType, NotificationType } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class AssignmentsService {
  constructor(
    private prisma: PrismaService,
    private constraintEngine: ConstraintEngineService,
    private redisLockService: RedisLockService,
    private realtimeService: RealtimeService,
    private auditService: AuditService,
    private notificationsService: NotificationsService,
  ) {}

  async assignStaff(
    shiftId: string,
    userId: string,
    managerOverrideReason?: string,
    actorId?: string,
  ): Promise<AssignStaffResponse> {
    const lock = await this.redisLockService.acquire(
      `staff:${userId}`,
      5000,
      1500,
    );
    if (!lock) {
      throw new ConflictException('Conflict');
    }

    try {
      const result = await this.prisma.db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM shifts WHERE id = ${shiftId} FOR UPDATE`;

        const shift = await tx.shift.findUnique({
          where: { id: shiftId },
          include: {
            location: true,
            assignments: {
              where: {
                deletedAt: null,
              },
            },
          },
        });

        if (!shift || shift.deletedAt) {
          throw new NotFoundException(`Shift with ID ${shiftId} not found`);
        }

        const user = await tx.user.findUnique({
          where: { id: userId },
        });

        if (!user || user.deletedAt) {
          throw new NotFoundException(`User with ID ${userId} not found`);
        }

        if (shift.assignments.length >= shift.requiredHeadcount) {
          throw new BadRequestException('Shift is already fully staffed');
        }

        const existingAssignment = await tx.assignment.findFirst({
          where: {
            shiftId,
            userId,
            deletedAt: null,
          },
        });

        if (existingAssignment) {
          throw new BadRequestException(
            'User is already assigned to this shift',
          );
        }

        const evaluation = await this.constraintEngine.evaluate(tx, {
          shift,
          user,
          managerOverrideReason,
        });

        if (evaluation.blocks.length > 0) {
          throw new ConstraintViolationException(
            evaluation.blocks,
            evaluation.suggestions,
          );
        }

        const assignment = await tx.assignment.create({
          data: {
            shiftId,
            userId,
          },
        });

        await this.auditService.createLog(tx, {
          entityType: AuditEntityType.ASSIGNMENT,
          entityId: assignment.id,
          action: AuditAction.CREATE,
          actorId,
          targetUserId: userId,
          after: assignment,
        });

        await this.notificationsService.create(tx, {
          userId,
          type: NotificationType.SHIFT_ASSIGNED,
          title: 'New shift assigned',
          message:
            'You were assigned to a shift. Open your schedule to review details.',
          metadata: {
            shiftId,
            assignmentId: assignment.id,
          },
        });

        if (actorId && evaluation.warnings.length > 0) {
          await this.notificationsService.create(tx, {
            userId: actorId,
            type: NotificationType.OVERTIME_WARNING,
            title: 'Overtime warning',
            message: evaluation.warnings
              .map((warning) => warning.message)
              .join(' '),
            metadata: {
              shiftId,
              assignedUserId: userId,
            },
          });
        }

        return {
          assignment: assignment as unknown as Assignment,
          warnings: evaluation.warnings,
          locationId: shift.locationId,
        };
      });

      this.realtimeService.emitAssignmentCreated(
        result.locationId,
        shiftId,
        userId,
        result.assignment.id,
      );

      return {
        assignment: result.assignment,
        warnings: result.warnings,
      };
    } finally {
      await this.redisLockService.release(lock);
    }
  }

  async unassignStaff(
    shiftId: string,
    assignmentId: string,
    actorId?: string,
  ): Promise<void> {
    const existingAssignment = await this.prisma.db.assignment.findFirst({
      where: { id: assignmentId, shiftId, deletedAt: null },
      include: {
        shift: {
          select: {
            locationId: true,
          },
        },
      },
    });

    if (!existingAssignment) {
      throw new NotFoundException(
        `Assignment with ID ${assignmentId} for shift ${shiftId} not found`,
      );
    }

    try {
      await this.prisma.db.$transaction(async (tx) => {
        const updated = await tx.assignment.update({
          where: { id: assignmentId, shiftId },
          data: { deletedAt: new Date() },
        });

        await this.auditService.createLog(tx, {
          entityType: AuditEntityType.ASSIGNMENT,
          entityId: assignmentId,
          action: AuditAction.SOFT_DELETE,
          actorId,
          targetUserId: existingAssignment.userId,
          before: existingAssignment,
          after: updated,
        });

        await this.notificationsService.create(tx, {
          userId: existingAssignment.userId,
          type: NotificationType.SHIFT_UNASSIGNED,
          title: 'Shift assignment removed',
          message:
            'You were unassigned from a shift. Check your schedule for the latest updates.',
          metadata: {
            shiftId,
            assignmentId,
          },
        });
      });
    } catch {
      throw new NotFoundException(
        `Assignment with ID ${assignmentId} for shift ${shiftId} not found`,
      );
    }

    this.realtimeService.emitAssignmentRemoved(
      existingAssignment.shift.locationId,
      shiftId,
      existingAssignment.userId,
    );
  }

  async findByShift(shiftId: string): Promise<Assignment[]> {
    const assignments = await this.prisma.db.assignment.findMany({
      where: { shiftId, deletedAt: null },
      include: { user: true },
    });
    return assignments as unknown as Assignment[];
  }
}
