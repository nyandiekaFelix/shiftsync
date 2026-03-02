import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Assignment } from '@shiftsync/shared-types';

@Injectable()
export class AssignmentsService {
  constructor(private prisma: PrismaService) {}

  async assignStaff(shiftId: string, userId: string): Promise<Assignment> {
    // Check if shift exists
    const shift = await this.prisma.db.shift.findUnique({
      where: { id: shiftId },
      include: { assignments: { where: { deletedAt: null } } },
    });

    if (!shift || shift.deletedAt) {
      throw new NotFoundException(`Shift with ID ${shiftId} not found`);
    }

    // Check if user exists
    const user = await this.prisma.db.user.findUnique({
      where: { id: userId },
    });

    if (!user || user.deletedAt) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    // Basic Validation: Headcount limit
    if (shift.assignments.length >= shift.requiredHeadcount) {
      throw new BadRequestException('Shift is already fully staffed');
    }

    // Check if user is already assigned to this shift
    const existingAssignment = await this.prisma.db.assignment.findFirst({
      where: {
        shiftId,
        userId,
        deletedAt: null,
      },
    });

    if (existingAssignment) {
      throw new BadRequestException('User is already assigned to this shift');
    }

    const assignment = await this.prisma.db.assignment.create({
      data: {
        shiftId,
        userId,
      },
    });

    return assignment as unknown as Assignment;
  }

  async unassignStaff(shiftId: string, assignmentId: string): Promise<void> {
    try {
      await this.prisma.db.assignment.update({
        where: { id: assignmentId, shiftId },
        data: { deletedAt: new Date() },
      });
    } catch {
      throw new NotFoundException(
        `Assignment with ID ${assignmentId} for shift ${shiftId} not found`,
      );
    }
  }

  async findByShift(shiftId: string): Promise<Assignment[]> {
    const assignments = await this.prisma.db.assignment.findMany({
      where: { shiftId, deletedAt: null },
      include: { user: true },
    });
    return assignments as unknown as Assignment[];
  }
}
