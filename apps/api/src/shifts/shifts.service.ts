import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  AuditAction,
  AuditEntityType,
  NotificationType,
  Prisma,
  ShiftStatus as PrismaShiftStatus,
  SwapRequestType,
  SwapStatus,
} from '@prisma/client';
import { CreateShiftDto } from './dto/create-shift.dto';
import { UpdateShiftDto } from './dto/update-shift.dto';
import { Shift, Role, AuthUser } from '@shiftsync/shared-types';
import { parseShiftInputToUtc } from '../common/utils/timezone';
import { RealtimeService } from '../realtime/realtime.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class ShiftsService {
  constructor(
    private prisma: PrismaService,
    private realtimeService: RealtimeService,
    private auditService: AuditService,
    private notificationsService: NotificationsService,
  ) {}

  async create(
    createShiftDto: CreateShiftDto,
    actorId?: string,
  ): Promise<Shift> {
    const { startTime, endTime, locationId, ...rest } = createShiftDto;
    const location = await this.prisma.db.location.findUnique({
      where: { id: locationId },
    });
    if (!location || location.deletedAt) {
      throw new NotFoundException(`Location with ID ${locationId} not found`);
    }

    const start = parseShiftInputToUtc(startTime, location.timezone);
    const end = parseShiftInputToUtc(endTime, location.timezone);

    if (!start || !end) {
      throw new BadRequestException('Invalid shift date/time format');
    }

    if (start >= end) {
      throw new BadRequestException('Start time must be before end time');
    }

    const shift = await this.prisma.db.$transaction(async (tx) => {
      const created = await tx.shift.create({
        data: {
          locationId,
          ...rest,
          startTime: start,
          endTime: end,
          status: PrismaShiftStatus.DRAFT,
        },
      });

      await this.auditService.createLog(tx, {
        entityType: AuditEntityType.SHIFT,
        entityId: created.id,
        action: AuditAction.CREATE,
        actorId,
        after: created,
      });

      return created;
    });

    this.realtimeService.emitShiftUpdated(shift.locationId, shift.id);
    return shift as unknown as Shift;
  }

  async findAll(
    user: AuthUser,
    locationId: string | undefined,
    startDate: string,
    endDate: string,
  ): Promise<Shift[]> {
    const isStaff = user.role === Role.STAFF;

    if (locationId && locationId !== 'null' && locationId !== 'undefined') {
      const location = await this.prisma.db.location.findUnique({
        where: { id: locationId },
      });
      if (!location || location.deletedAt) {
        throw new NotFoundException(`Location with ID ${locationId} not found`);
      }
      await this.assertUserCanAccessLocation(user, locationId);

      const rangeStart = parseShiftInputToUtc(
        `${startDate}T00:00:00`,
        location.timezone,
      );
      const rangeEnd = parseShiftInputToUtc(
        `${endDate}T23:59:59`,
        location.timezone,
      );
      if (!rangeStart || !rangeEnd) {
        throw new BadRequestException('Invalid date range format');
      }

      const shifts = await this.prisma.db.shift.findMany({
        where: {
          locationId,
          startTime: { lt: rangeEnd },
          endTime: { gt: rangeStart },
          deletedAt: null,
        },
        include: {
          assignments: true,
          location: true,
        },
        orderBy: {
          startTime: 'asc',
        },
      });

      return shifts as unknown as Shift[];
    } else {
      // If no locationId, only STAFF can fetch their own shifts
      if (!isStaff) {
        throw new BadRequestException(
          'locationId is required for Managers and Admins',
        );
      }

      const rangeStart = parseShiftInputToUtc(`${startDate}T00:00:00`, 'UTC');
      const rangeEnd = parseShiftInputToUtc(`${endDate}T23:59:59`, 'UTC');

      if (!rangeStart || !rangeEnd) {
        throw new BadRequestException('Invalid date range format');
      }

      const shifts = await this.prisma.db.shift.findMany({
        where: {
          assignments: {
            some: {
              userId: user.id,
              deletedAt: null,
            },
          },
          startTime: { lt: rangeEnd },
          endTime: { gt: rangeStart },
          deletedAt: null,
        },
        include: {
          assignments: true,
          location: true,
        },
        orderBy: {
          startTime: 'asc',
        },
      });

      return shifts as unknown as Shift[];
    }
  }

  async findOne(id: string, actor: AuthUser): Promise<Shift> {
    const shift = await this.prisma.db.shift.findUnique({
      where: { id },
      include: {
        assignments: true,
        location: true,
      },
    });

    if (!shift || shift.deletedAt) {
      throw new NotFoundException(`Shift with ID ${id} not found`);
    }

    if (actor.role === Role.STAFF) {
      const isAssigned = shift.assignments.some(
        (assignment) => assignment.userId === actor.id && !assignment.deletedAt,
      );
      if (!isAssigned) {
        throw new ForbiddenException('You can only view your own shifts');
      }
    } else {
      await this.assertUserCanAccessLocation(actor, shift.locationId);
    }

    return shift as unknown as Shift;
  }

  async update(
    id: string,
    updateShiftDto: UpdateShiftDto,
    actor: AuthUser,
    actorId?: string,
  ): Promise<Shift> {
    const { startTime, endTime, ...rest } = updateShiftDto;
    const existingShift = await this.prisma.db.shift.findUnique({
      where: { id },
      include: { location: true },
    });
    if (!existingShift || existingShift.deletedAt) {
      throw new NotFoundException(`Shift with ID ${id} not found`);
    }
    await this.assertUserCanAccessLocation(actor, existingShift.locationId);

    if (
      existingShift.status === PrismaShiftStatus.PUBLISHED &&
      this.isWithinEditCutoff(existingShift.startTime)
    ) {
      throw new BadRequestException(
        'Published schedules cannot be edited inside the cutoff window',
      );
    }

    const data: Prisma.ShiftUpdateInput = {
      ...rest,
    } as unknown as Prisma.ShiftUpdateInput;
    if (startTime) {
      const start = parseShiftInputToUtc(
        startTime,
        existingShift.location.timezone,
      );
      if (!start) {
        throw new BadRequestException('Invalid start time format');
      }
      data.startTime = start;
    }
    if (endTime) {
      const end = parseShiftInputToUtc(
        endTime,
        existingShift.location.timezone,
      );
      if (!end) {
        throw new BadRequestException('Invalid end time format');
      }
      data.endTime = end;
    }

    const finalStart =
      (data.startTime as Date | undefined) ?? existingShift.startTime;
    const finalEnd =
      (data.endTime as Date | undefined) ?? existingShift.endTime;
    if (finalStart >= finalEnd) {
      throw new BadRequestException('Start time must be before end time');
    }

    const incomingHeadcount =
      updateShiftDto.requiredHeadcount ?? existingShift.requiredHeadcount;
    if (incomingHeadcount < 1) {
      throw new BadRequestException('Required headcount must be at least 1');
    }

    const activeAssignmentsCount = await this.prisma.db.assignment.count({
      where: {
        shiftId: id,
        deletedAt: null,
      },
    });
    if (incomingHeadcount < activeAssignmentsCount) {
      throw new BadRequestException(
        `Cannot reduce headcount to ${incomingHeadcount}. This shift currently has ${activeAssignmentsCount} assigned staff. Unassign staff first.`,
      );
    }

    const { shift, cancelledSwapRequests } = await this.prisma.db.$transaction(
      async (tx) => {
        const updatedShift = await tx.shift.update({
          where: { id },
          data,
        });

        const activeSwapRequests = await tx.swapRequest.findMany({
          where: {
            shiftId: id,
            type: SwapRequestType.SWAP,
            status: {
              in: [SwapStatus.PENDING, SwapStatus.ACCEPTED_BY_PEER],
            },
            deletedAt: null,
          },
          select: {
            id: true,
            requesterId: true,
            receiverId: true,
          },
        });

        if (activeSwapRequests.length > 0) {
          await tx.swapRequest.updateMany({
            where: {
              id: {
                in: activeSwapRequests.map((request) => request.id),
              },
            },
            data: {
              status: SwapStatus.CANCELLED,
              resolvedAt: new Date(),
              resolutionNote:
                'Cancelled automatically because shift was edited',
            },
          });
        }

        const activeAssignments = await tx.assignment.findMany({
          where: {
            shiftId: id,
            deletedAt: null,
          },
          select: {
            userId: true,
          },
        });

        await this.auditService.createLog(tx, {
          entityType: AuditEntityType.SHIFT,
          entityId: id,
          action: AuditAction.UPDATE,
          actorId,
          before: existingShift,
          after: updatedShift,
        });

        await this.notificationsService.createMany(
          tx,
          activeAssignments.map((assignment) => ({
            userId: assignment.userId,
            type: NotificationType.SHIFT_UPDATED,
            title: 'Shift updated',
            message:
              'A shift you are assigned to was updated. Please review the latest schedule details.',
            metadata: {
              shiftId: id,
              locationId: updatedShift.locationId,
            },
          })),
        );

        const cancelledSwapNotifications = activeSwapRequests.flatMap(
          (request) =>
            [request.requesterId, request.receiverId]
              .filter((userId): userId is string => Boolean(userId))
              .map((userId) => ({
                userId,
                type: NotificationType.SWAP_REQUEST_UPDATED,
                title: 'Swap request cancelled',
                message:
                  'A pending swap was cancelled automatically because the shift was edited.',
                metadata: {
                  requestId: request.id,
                  shiftId: id,
                  locationId: updatedShift.locationId,
                },
              })),
        );
        await this.notificationsService.createMany(
          tx,
          cancelledSwapNotifications,
        );

        return {
          shift: updatedShift,
          cancelledSwapRequests: activeSwapRequests,
        };
      },
    );

    this.realtimeService.emitShiftUpdated(shift.locationId, shift.id);
    cancelledSwapRequests.forEach((request) => {
      this.realtimeService.emitSwapRequestUpdated(shift.locationId, request.id);
    });

    return shift as unknown as Shift;
  }

  async remove(id: string, actor: AuthUser, actorId?: string): Promise<void> {
    await this.prisma.db.$transaction(async (tx) => {
      const existingShift = await tx.shift.findUnique({
        where: { id },
      });
      if (!existingShift || existingShift.deletedAt) {
        throw new NotFoundException(`Shift with ID ${id} not found`);
      }
      await this.assertUserCanAccessLocation(actor, existingShift.locationId);
      if (
        existingShift.status === PrismaShiftStatus.PUBLISHED &&
        this.isWithinEditCutoff(existingShift.startTime)
      ) {
        throw new BadRequestException(
          'Published schedules cannot be edited inside the cutoff window',
        );
      }

      const deletedShift = await tx.shift.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      await this.auditService.createLog(tx, {
        entityType: AuditEntityType.SHIFT,
        entityId: id,
        action: AuditAction.SOFT_DELETE,
        actorId,
        before: existingShift,
        after: deletedShift,
      });
    });
  }

  async publishBulk(
    locationId: string,
    startDate: string,
    endDate: string,
    actorId?: string,
  ): Promise<number> {
    const location = await this.prisma.db.location.findUnique({
      where: { id: locationId },
    });
    if (!location || location.deletedAt) {
      throw new NotFoundException(`Location with ID ${locationId} not found`);
    }

    const rangeStart = parseShiftInputToUtc(
      `${startDate}T00:00:00`,
      location.timezone,
    );
    const rangeEnd = parseShiftInputToUtc(
      `${endDate}T23:59:59`,
      location.timezone,
    );
    if (!rangeStart || !rangeEnd) {
      throw new BadRequestException('Invalid date range format');
    }

    const draftShiftIds = await this.prisma.db.shift.findMany({
      where: {
        locationId,
        status: PrismaShiftStatus.DRAFT,
        startTime: {
          gte: rangeStart,
        },
        endTime: {
          lte: rangeEnd,
        },
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    const result = await this.prisma.db.$transaction(async (tx) => {
      const updated = await tx.shift.updateMany({
        where: {
          locationId,
          status: PrismaShiftStatus.DRAFT,
          startTime: {
            gte: rangeStart,
          },
          endTime: {
            lte: rangeEnd,
          },
          deletedAt: null,
        },
        data: {
          status: PrismaShiftStatus.PUBLISHED,
        },
      });

      if (draftShiftIds.length > 0) {
        await tx.auditLog.createMany({
          data: draftShiftIds.map((shift) => ({
            entityType: AuditEntityType.SHIFT,
            entityId: shift.id,
            action: AuditAction.STATUS_CHANGE,
            actorId,
            diff: {
              status: {
                before: PrismaShiftStatus.DRAFT,
                after: PrismaShiftStatus.PUBLISHED,
              },
            },
          })),
        });
      }

      const assignments = await tx.assignment.findMany({
        where: {
          shiftId: {
            in: draftShiftIds.map((shift) => shift.id),
          },
          deletedAt: null,
        },
        include: {
          shift: {
            select: {
              id: true,
            },
          },
        },
      });

      await this.notificationsService.createMany(
        tx,
        assignments.map((assignment) => ({
          userId: assignment.userId,
          type: NotificationType.SCHEDULE_PUBLISHED,
          title: 'Schedule published',
          message:
            'A schedule with your assignments has been published by management.',
          metadata: {
            shiftId: assignment.shift.id,
            locationId,
          },
        })),
      );

      return updated;
    });

    draftShiftIds.forEach((shift) => {
      this.realtimeService.emitSchedulePublished(locationId, shift.id);
    });

    return result.count;
  }

  async getLiveShifts(locationId: string, actor: AuthUser): Promise<Shift[]> {
    const now = new Date();
    const location = await this.prisma.db.location.findUnique({
      where: { id: locationId },
    });
    if (!location || location.deletedAt) {
      throw new NotFoundException(`Location with ID ${locationId} not found`);
    }
    if (actor.role === Role.STAFF) {
      const dbUser = await this.prisma.db.user.findUnique({
        where: { id: actor.id },
        select: { certifiedLocations: true },
      });
      if (!dbUser || !dbUser.certifiedLocations.includes(locationId)) {
        throw new ForbiddenException(
          `You are not authorized to access location: ${locationId}`,
        );
      }
    } else {
      await this.assertUserCanAccessLocation(actor, locationId);
    }

    const liveShifts = await this.prisma.db.shift.findMany({
      where: {
        locationId,
        status: PrismaShiftStatus.PUBLISHED,
        startTime: {
          lte: now,
        },
        endTime: {
          gte: now,
        },
        deletedAt: null,
      },
      include: {
        assignments: {
          where: {
            deletedAt: null,
          },
        },
      },
      orderBy: {
        startTime: 'asc',
      },
    });

    return liveShifts as unknown as Shift[];
  }

  private getEditCutoffHours(): number {
    const raw = process.env.SCHEDULE_EDIT_CUTOFF_HOURS;
    const parsed = raw ? Number(raw) : 48;
    if (Number.isNaN(parsed) || parsed < 0) {
      return 48;
    }
    return parsed;
  }

  private isWithinEditCutoff(shiftStartTime: Date): boolean {
    const cutoffMs = this.getEditCutoffHours() * 60 * 60 * 1000;
    return Date.now() > shiftStartTime.getTime() - cutoffMs;
  }

  private async assertUserCanAccessLocation(
    user: AuthUser,
    locationId: string,
  ): Promise<void> {
    if (user.role === Role.ADMIN) {
      return;
    }

    if (user.role === Role.STAFF) {
      throw new ForbiddenException('Staff cannot manage locations');
    }

    const dbUser =
      typeof this.prisma.db.user?.findUnique === 'function'
        ? await this.prisma.db.user.findUnique({
            where: { id: user.id },
            select: { certifiedLocations: true },
          })
        : null;
    const certifiedLocations =
      dbUser?.certifiedLocations ?? user.certifiedLocations ?? [];
    if (!certifiedLocations.includes(locationId)) {
      throw new ForbiddenException(
        `You are not authorized to access location: ${locationId}`,
      );
    }
  }
}
