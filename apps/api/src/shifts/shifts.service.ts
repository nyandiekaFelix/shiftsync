import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { CreateShiftDto } from './dto/create-shift.dto';
import { UpdateShiftDto } from './dto/update-shift.dto';
import { Shift, ShiftStatus, Role, AuthUser } from '@shiftsync/shared-types';
import { parseShiftInputToUtc } from '../common/utils/timezone';
import { RealtimeService } from '../realtime/realtime.service';

@Injectable()
export class ShiftsService {
  constructor(
    private prisma: PrismaService,
    private realtimeService: RealtimeService,
  ) {}

  async create(createShiftDto: CreateShiftDto): Promise<Shift> {
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

    const shift = await this.prisma.db.shift.create({
      data: {
        locationId,
        ...rest,
        startTime: start,
        endTime: end,
        status: ShiftStatus.DRAFT,
      },
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
          startTime: {
            gte: rangeStart,
          },
          endTime: {
            lte: rangeEnd,
          },
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
          startTime: {
            gte: rangeStart,
          },
          endTime: {
            lte: rangeEnd,
          },
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

  async findOne(id: string): Promise<Shift> {
    const shift = await this.prisma.db.shift.findUnique({
      where: { id },
      include: {
        assignments: true,
      },
    });

    if (!shift || shift.deletedAt) {
      throw new NotFoundException(`Shift with ID ${id} not found`);
    }

    return shift as unknown as Shift;
  }

  async update(id: string, updateShiftDto: UpdateShiftDto): Promise<Shift> {
    const { startTime, endTime, ...rest } = updateShiftDto;
    const existingShift = await this.prisma.db.shift.findUnique({
      where: { id },
      include: { location: true },
    });
    if (!existingShift || existingShift.deletedAt) {
      throw new NotFoundException(`Shift with ID ${id} not found`);
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

    const shift = await this.prisma.db.shift.update({
      where: { id },
      data,
    });
    this.realtimeService.emitShiftUpdated(shift.locationId, shift.id);
    return shift as unknown as Shift;
  }

  async remove(id: string): Promise<void> {
    await this.prisma.db.shift.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async publishBulk(
    locationId: string,
    startDate: string,
    endDate: string,
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
        status: ShiftStatus.DRAFT,
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

    const result = await this.prisma.db.shift.updateMany({
      where: {
        locationId,
        status: ShiftStatus.DRAFT,
        startTime: {
          gte: rangeStart,
        },
        endTime: {
          lte: rangeEnd,
        },
        deletedAt: null,
      },
      data: {
        status: ShiftStatus.PUBLISHED,
      },
    });

    draftShiftIds.forEach((shift) => {
      this.realtimeService.emitSchedulePublished(locationId, shift.id);
    });

    return result.count;
  }

  async getLiveShifts(locationId: string): Promise<Shift[]> {
    const now = new Date();
    const location = await this.prisma.db.location.findUnique({
      where: { id: locationId },
    });
    if (!location || location.deletedAt) {
      throw new NotFoundException(`Location with ID ${locationId} not found`);
    }

    const liveShifts = await this.prisma.db.shift.findMany({
      where: {
        locationId,
        status: ShiftStatus.PUBLISHED,
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
}
