import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AssignStaffResponse, Assignment } from '@shiftsync/shared-types';
import { ConstraintEngineService } from './constraints/constraint-engine.service';
import { ConstraintViolationException } from './constraints/constraint-violation.exception';

@Injectable()
export class AssignmentsService {
  constructor(
    private prisma: PrismaService,
    private constraintEngine: ConstraintEngineService,
  ) {}

  async assignStaff(
    shiftId: string,
    userId: string,
    managerOverrideReason?: string,
  ): Promise<AssignStaffResponse> {
    return this.prisma.db.$transaction(async (tx) => {
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
        },
      });

      if (existingAssignment) {
        throw new BadRequestException('User is already assigned to this shift');
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

      return {
        assignment: assignment as unknown as Assignment,
        warnings: evaluation.warnings,
      };
    });
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
      where: { shiftId },
      include: { user: true },
    });
    return assignments as unknown as Assignment[];
  }
}
