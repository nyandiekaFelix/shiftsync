import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { CreateShiftDto } from './dto/create-shift.dto';
import { UpdateShiftDto } from './dto/update-shift.dto';
import { Shift, ShiftStatus } from '@shiftsync/shared-types';

@Injectable()
export class ShiftsService {
  constructor(private prisma: PrismaService) {}

  async create(createShiftDto: CreateShiftDto): Promise<Shift> {
    const { startTime, endTime, ...rest } = createShiftDto;

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (start >= end) {
      throw new BadRequestException('Start time must be before end time');
    }

    const shift = await this.prisma.db.shift.create({
      data: {
        ...rest,
        startTime: start,
        endTime: end,
        status: ShiftStatus.DRAFT,
      },
    });

    return shift as unknown as Shift;
  }

  async findAll(
    locationId: string,
    startDate: string,
    endDate: string,
  ): Promise<Shift[]> {
    const shifts = await this.prisma.db.shift.findMany({
      where: {
        locationId,
        startTime: {
          gte: new Date(startDate),
        },
        endTime: {
          lte: new Date(endDate),
        },
        deletedAt: null,
      },
      include: {
        assignments: true,
      },
      orderBy: {
        startTime: 'asc',
      },
    });

    return shifts as unknown as Shift[];
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

    const data: Prisma.ShiftUpdateInput = {
      ...rest,
    } as unknown as Prisma.ShiftUpdateInput;
    if (startTime) data.startTime = new Date(startTime);
    if (endTime) data.endTime = new Date(endTime);

    if (
      data.startTime &&
      data.endTime &&
      (data.startTime as Date) >= (data.endTime as Date)
    ) {
      throw new BadRequestException('Start time must be before end time');
    }

    try {
      const shift = await this.prisma.db.shift.update({
        where: { id },
        data,
      });
      return shift as unknown as Shift;
    } catch {
      throw new NotFoundException(`Shift with ID ${id} not found`);
    }
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
    const result = await this.prisma.db.shift.updateMany({
      where: {
        locationId,
        status: ShiftStatus.DRAFT,
        startTime: {
          gte: new Date(startDate),
        },
        endTime: {
          lte: new Date(endDate),
        },
        deletedAt: null,
      },
      data: {
        status: ShiftStatus.PUBLISHED,
      },
    });

    return result.count;
  }
}
