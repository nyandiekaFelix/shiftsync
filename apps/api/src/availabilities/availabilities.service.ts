import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AvailabilityType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertAvailabilityDto } from './dto/upsert-availability.dto';

@Injectable()
export class AvailabilitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async listMine(userId: string) {
    return this.prisma.db.availability.findMany({
      where: {
        userId,
        deletedAt: null,
      },
      orderBy: [
        { type: 'desc' },
        { dayOfWeek: 'asc' },
        { date: 'asc' },
        { startTime: 'asc' },
      ],
    });
  }

  async create(userId: string, dto: UpsertAvailabilityDto) {
    this.validateWindow(dto);

    return this.prisma.db.availability.create({
      data: {
        userId,
        type: dto.type,
        dayOfWeek:
          dto.type === AvailabilityType.RECURRING ? dto.dayOfWeek : null,
        date:
          dto.type === AvailabilityType.EXCEPTION && dto.date
            ? new Date(dto.date)
            : null,
        startTime: dto.startTime ?? null,
        endTime: dto.endTime ?? null,
      },
    });
  }

  async update(
    userId: string,
    availabilityId: string,
    dto: UpsertAvailabilityDto,
  ) {
    this.validateWindow(dto);

    const existing = await this.prisma.db.availability.findFirst({
      where: {
        id: availabilityId,
        userId,
        deletedAt: null,
      },
    });
    if (!existing) {
      throw new NotFoundException('Availability not found');
    }

    return this.prisma.db.availability.update({
      where: { id: availabilityId },
      data: {
        type: dto.type,
        dayOfWeek:
          dto.type === AvailabilityType.RECURRING ? dto.dayOfWeek : null,
        date:
          dto.type === AvailabilityType.EXCEPTION && dto.date
            ? new Date(dto.date)
            : null,
        startTime: dto.startTime ?? null,
        endTime: dto.endTime ?? null,
      },
    });
  }

  async remove(userId: string, availabilityId: string) {
    const result = await this.prisma.db.availability.updateMany({
      where: {
        id: availabilityId,
        userId,
        deletedAt: null,
      },
      data: {
        deletedAt: new Date(),
      },
    });

    if (result.count === 0) {
      throw new NotFoundException('Availability not found');
    }

    return { success: true };
  }

  private validateWindow(dto: UpsertAvailabilityDto): void {
    if ((dto.startTime && !dto.endTime) || (!dto.startTime && dto.endTime)) {
      throw new BadRequestException(
        'Availability requires both startTime and endTime when one is provided',
      );
    }

    if (dto.startTime && dto.endTime && dto.startTime === dto.endTime) {
      throw new BadRequestException('startTime and endTime cannot be equal');
    }
  }
}
