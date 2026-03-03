import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditAction,
  AuditEntityType,
  NotificationType,
  Prisma,
  Role,
  SwapRequestType,
  SwapStatus,
  User,
} from '@prisma/client';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { ConstraintEngineService } from '../shifts/constraints/constraint-engine.service';
import { ConstraintViolationException } from '../shifts/constraints/constraint-violation.exception';
import { RealtimeService } from '../realtime/realtime.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  EXPIRE_DROP_JOB,
  SWAP_REQUESTS_QUEUE,
} from './swap-requests.constants';
import { Role as SharedRole } from '@shiftsync/shared-types';

type ActorContext = {
  id: string;
  role: SharedRole;
  certifiedLocations?: string[];
};

const ACTIVE_STATUSES: SwapStatus[] = [
  SwapStatus.PENDING,
  SwapStatus.ACCEPTED_BY_PEER,
];

type TxClient = Parameters<
  Parameters<PrismaService['db']['$transaction']>[0]
>[0];

type SwapRequestWithShift = Prisma.SwapRequestGetPayload<{
  include: {
    shift: {
      include: {
        location: true;
        assignments: {
          where: {
            deletedAt: null;
          };
        };
      };
    };
    requester: true;
    receiver: true;
  };
}>;

@Injectable()
export class SwapRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly constraintEngine: ConstraintEngineService,
    private readonly realtimeService: RealtimeService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
    @InjectQueue(SWAP_REQUESTS_QUEUE)
    private readonly swapRequestsQueue: Queue,
  ) {}

  async requestSwap(
    requesterId: string,
    shiftId: string,
    receiverId: string,
    actorId?: string,
  ) {
    if (requesterId === receiverId) {
      throw new BadRequestException('Cannot request a swap with yourself');
    }

    const { request, locationId } = await this.prisma.db.$transaction(
      async (tx) => {
        await this.ensureCanCreateActiveRequest(tx, requesterId);

        const shift = await tx.shift.findUnique({
          where: { id: shiftId },
        });
        if (!shift || shift.deletedAt) {
          throw new NotFoundException(`Shift with ID ${shiftId} not found`);
        }

        const requesterAssignment = await tx.assignment.findFirst({
          where: {
            shiftId,
            userId: requesterId,
            deletedAt: null,
          },
        });
        if (!requesterAssignment) {
          throw new BadRequestException(
            'Only assigned staff can request swaps for a shift',
          );
        }

        const receiver = await tx.user.findUnique({
          where: { id: receiverId },
        });
        if (!receiver || receiver.deletedAt || receiver.role !== Role.STAFF) {
          throw new NotFoundException(
            `Eligible staff member with ID ${receiverId} not found`,
          );
        }

        this.assertBasicQualification(receiver, shift);

        const existingRequest = await tx.swapRequest.findFirst({
          where: {
            shiftId,
            type: SwapRequestType.SWAP,
            requesterId,
            receiverId,
            status: {
              in: ACTIVE_STATUSES,
            },
            deletedAt: null,
          },
        });

        if (existingRequest) {
          throw new BadRequestException(
            'A pending swap request already exists for this shift and peer',
          );
        }

        const created = await tx.swapRequest.create({
          data: {
            type: SwapRequestType.SWAP,
            requesterId,
            receiverId,
            shiftId,
            status: SwapStatus.PENDING,
          },
        });

        await this.auditService.createLog(tx, {
          entityType: AuditEntityType.SWAP_REQUEST,
          entityId: created.id,
          action: AuditAction.CREATE,
          actorId,
          targetUserId: receiverId,
          after: created,
        });

        await this.notificationsService.createMany(tx, [
          {
            userId: requesterId,
            type: NotificationType.SWAP_REQUEST_UPDATED,
            title: 'Swap request submitted',
            message:
              'Your swap request was sent and is pending peer acceptance.',
            metadata: {
              requestId: created.id,
              shiftId,
            },
          },
          {
            userId: receiverId,
            type: NotificationType.SWAP_REQUEST_UPDATED,
            title: 'Swap request received',
            message: 'A coworker requested a shift swap with you.',
            metadata: {
              requestId: created.id,
              shiftId,
            },
          },
        ]);
        return { request: created, locationId: shift.locationId };
      },
    );

    this.realtimeService.emitSwapRequestUpdated(locationId, request.id);
    return request;
  }

  async requestDrop(requesterId: string, shiftId: string, actorId?: string) {
    const { request, locationId } = await this.prisma.db.$transaction(
      async (tx) => {
        await this.ensureCanCreateActiveRequest(tx, requesterId);

        const shift = await tx.shift.findUnique({ where: { id: shiftId } });
        if (!shift || shift.deletedAt) {
          throw new NotFoundException(`Shift with ID ${shiftId} not found`);
        }

        const requesterAssignment = await tx.assignment.findFirst({
          where: {
            shiftId,
            userId: requesterId,
            deletedAt: null,
          },
        });
        if (!requesterAssignment) {
          throw new BadRequestException(
            'Only assigned staff can request a drop for a shift',
          );
        }

        const expiresAt = new Date(
          shift.startTime.getTime() - 24 * 60 * 60 * 1000,
        );
        if (expiresAt <= new Date()) {
          throw new BadRequestException(
            'Drop requests must be created more than 24h before shift start',
          );
        }

        const existingRequest = await tx.swapRequest.findFirst({
          where: {
            shiftId,
            type: SwapRequestType.DROP,
            requesterId,
            status: {
              in: ACTIVE_STATUSES,
            },
            deletedAt: null,
          },
        });

        if (existingRequest) {
          throw new BadRequestException(
            'A pending drop request already exists for this shift',
          );
        }

        const created = await tx.swapRequest.create({
          data: {
            type: SwapRequestType.DROP,
            requesterId,
            shiftId,
            status: SwapStatus.PENDING,
            expiresAt,
          },
        });

        await this.auditService.createLog(tx, {
          entityType: AuditEntityType.SWAP_REQUEST,
          entityId: created.id,
          action: AuditAction.CREATE,
          actorId,
          targetUserId: requesterId,
          after: created,
        });

        await this.notificationsService.create(tx, {
          userId: requesterId,
          type: NotificationType.SWAP_REQUEST_UPDATED,
          title: 'Drop request opened',
          message:
            'Your shift is now listed on the drop board until expiration.',
          metadata: {
            requestId: created.id,
            shiftId,
            expiresAt: expiresAt.toISOString(),
          },
        });
        return { request: created, locationId: shift.locationId };
      },
    );

    await this.scheduleDropExpirationJob(request.id, request.expiresAt);
    this.realtimeService.emitSwapRequestUpdated(locationId, request.id);

    return request;
  }

  async acceptRequest(
    requestId: string,
    actingStaffId: string,
    actorId?: string,
  ) {
    const { request, locationId } = await this.prisma.db.$transaction(
      async (tx) => {
        const existing = await this.findRequestForUpdate(tx, requestId);

        if (existing.status !== SwapStatus.PENDING) {
          throw new BadRequestException(
            'Only pending requests can be accepted',
          );
        }

        const assignee = await tx.user.findUnique({
          where: { id: actingStaffId },
        });
        if (!assignee || assignee.deletedAt || assignee.role !== Role.STAFF) {
          throw new NotFoundException('Eligible staff member not found');
        }

        if (existing.type === SwapRequestType.SWAP) {
          if (existing.receiverId !== actingStaffId) {
            throw new BadRequestException(
              'Only the requested peer can accept this swap',
            );
          }
        } else {
          if (existing.requesterId === actingStaffId) {
            throw new BadRequestException(
              'Requester cannot claim their own drop',
            );
          }
          this.assertBasicQualification(assignee, existing.shift);
        }

        const alreadyAssigned = existing.shift.assignments.some(
          (assignment) => assignment.userId === actingStaffId,
        );
        if (alreadyAssigned) {
          throw new BadRequestException('Staff member is already assigned');
        }

        const updated = await tx.swapRequest.update({
          where: { id: existing.id },
          data: {
            status: SwapStatus.ACCEPTED_BY_PEER,
            receiverId: actingStaffId,
            acceptedAt: new Date(),
          },
        });

        await this.auditService.createLog(tx, {
          entityType: AuditEntityType.SWAP_REQUEST,
          entityId: existing.id,
          action: AuditAction.STATUS_CHANGE,
          actorId,
          targetUserId: existing.requesterId,
          before: existing,
          after: updated,
        });

        await this.notificationsService.createMany(tx, [
          {
            userId: existing.requesterId,
            type: NotificationType.SWAP_REQUEST_UPDATED,
            title: 'Swap/drop accepted',
            message:
              'Your request was accepted by a peer and awaits manager approval.',
            metadata: {
              requestId: existing.id,
            },
          },
          {
            userId: actingStaffId,
            type: NotificationType.SWAP_REQUEST_UPDATED,
            title: 'Request accepted',
            message: 'You accepted this request. Waiting for manager approval.',
            metadata: {
              requestId: existing.id,
            },
          },
        ]);
        return { request: updated, locationId: existing.shift.locationId };
      },
    );

    this.realtimeService.emitSwapRequestUpdated(locationId, request.id);
    return request;
  }

  async approveRequest(
    requestId: string,
    approve: boolean,
    reason?: string,
    actor?: ActorContext,
    actorId?: string,
  ) {
    const result = await this.prisma.db.$transaction(async (tx) => {
      const existing = await this.findRequestForUpdate(tx, requestId);
      if (actor) {
        await this.assertActorCanReviewLocation(
          tx,
          actor,
          existing.shift.locationId,
        );
      }

      if (existing.status !== SwapStatus.ACCEPTED_BY_PEER) {
        throw new BadRequestException(
          'Only peer-accepted requests can be reviewed by managers',
        );
      }

      if (!approve) {
        const cancelled = await tx.swapRequest.update({
          where: { id: existing.id },
          data: {
            status: SwapStatus.CANCELLED,
            resolvedAt: new Date(),
            resolutionNote: reason?.trim() || 'Manager denied request',
          },
        });

        await this.auditService.createLog(tx, {
          entityType: AuditEntityType.SWAP_REQUEST,
          entityId: existing.id,
          action: AuditAction.STATUS_CHANGE,
          actorId,
          targetUserId: existing.requesterId,
          before: existing,
          after: cancelled,
        });

        const denialNotifications = [existing.requesterId, existing.receiverId]
          .filter((id): id is string => Boolean(id))
          .map((userId) => ({
            userId,
            type: NotificationType.SWAP_REQUEST_UPDATED,
            title: 'Swap/drop denied',
            message: reason?.trim() || 'A manager denied this request.',
            metadata: {
              requestId: existing.id,
            },
          }));
        await this.notificationsService.createMany(tx, denialNotifications);

        return {
          request: cancelled,
          approvalWarnings: [],
          wasApproved: false,
          locationId: existing.shift.locationId,
        };
      }

      if (!existing.receiver) {
        throw new BadRequestException('Request has no accepting peer');
      }

      const requesterAssignment = await tx.assignment.findFirst({
        where: {
          shiftId: existing.shiftId,
          userId: existing.requesterId,
          deletedAt: null,
        },
      });
      if (!requesterAssignment) {
        throw new BadRequestException(
          'Requester is no longer assigned to this shift',
        );
      }

      const receiverAlreadyAssigned = await tx.assignment.findFirst({
        where: {
          shiftId: existing.shiftId,
          userId: existing.receiver.id,
          deletedAt: null,
        },
      });
      if (receiverAlreadyAssigned) {
        throw new BadRequestException('Receiving staff is already assigned');
      }

      const evaluation = await this.constraintEngine.evaluate(tx, {
        shift: existing.shift,
        user: existing.receiver,
        managerOverrideReason: reason,
      });

      if (evaluation.blocks.length > 0) {
        throw new ConstraintViolationException(
          evaluation.blocks,
          evaluation.suggestions,
        );
      }

      await tx.assignment.update({
        where: {
          id: requesterAssignment.id,
        },
        data: {
          deletedAt: new Date(),
        },
      });

      const createdAssignment = await tx.assignment.create({
        data: {
          shiftId: existing.shiftId,
          userId: existing.receiver.id,
        },
      });

      const approved = await tx.swapRequest.update({
        where: { id: existing.id },
        data: {
          status: SwapStatus.APPROVED,
          resolvedAt: new Date(),
          resolutionNote: reason?.trim() || null,
        },
      });

      await this.auditService.createLog(tx, {
        entityType: AuditEntityType.ASSIGNMENT,
        entityId: requesterAssignment.id,
        action: AuditAction.SOFT_DELETE,
        actorId,
        targetUserId: existing.requesterId,
        before: requesterAssignment,
      });

      await this.auditService.createLog(tx, {
        entityType: AuditEntityType.ASSIGNMENT,
        entityId: createdAssignment.id,
        action: AuditAction.CREATE,
        actorId,
        targetUserId: existing.receiver.id,
        after: createdAssignment,
      });

      await this.auditService.createLog(tx, {
        entityType: AuditEntityType.SWAP_REQUEST,
        entityId: existing.id,
        action: AuditAction.STATUS_CHANGE,
        actorId,
        targetUserId: existing.requesterId,
        before: existing,
        after: approved,
      });

      await this.notificationsService.createMany(tx, [
        {
          userId: existing.requesterId,
          type: NotificationType.SWAP_REQUEST_UPDATED,
          title: 'Swap/drop approved',
          message:
            'Manager approved your request and assignment changes are live.',
          metadata: {
            requestId: existing.id,
            shiftId: existing.shiftId,
          },
        },
        {
          userId: existing.receiver.id,
          type: NotificationType.SHIFT_ASSIGNED,
          title: 'Shift assigned from swap/drop',
          message: 'You are now assigned after manager approval.',
          metadata: {
            requestId: existing.id,
            shiftId: existing.shiftId,
            assignmentId: createdAssignment.id,
          },
        },
      ]);

      return {
        request: approved,
        approvalWarnings: evaluation.warnings,
        wasApproved: true,
        locationId: existing.shift.locationId,
        createdAssignmentId: createdAssignment.id,
      };
    });

    this.realtimeService.emitSwapRequestUpdated(result.locationId, requestId);

    if (result.wasApproved && result.request.receiverId) {
      this.realtimeService.emitAssignmentRemoved(
        result.locationId,
        result.request.shiftId,
        result.request.requesterId,
      );
      this.realtimeService.emitAssignmentCreated(
        result.locationId,
        result.request.shiftId,
        result.request.receiverId,
        result.createdAssignmentId ?? '',
      );
    }

    return result;
  }

  async cancelByInitiator(
    requestId: string,
    requesterId: string,
    actorId?: string,
  ) {
    const { request, locationId } = await this.prisma.db.$transaction(
      async (tx) => {
        const existing = await this.findRequestForUpdate(tx, requestId);

        if (existing.requesterId !== requesterId) {
          throw new BadRequestException(
            'Only initiator can cancel this request',
          );
        }

        if (!ACTIVE_STATUSES.includes(existing.status)) {
          throw new BadRequestException(
            'Only active requests can be cancelled',
          );
        }

        const updated = await tx.swapRequest.update({
          where: { id: existing.id },
          data: {
            status: SwapStatus.CANCELLED,
            resolvedAt: new Date(),
            resolutionNote: 'Initiator cancelled request',
          },
        });

        await this.auditService.createLog(tx, {
          entityType: AuditEntityType.SWAP_REQUEST,
          entityId: existing.id,
          action: AuditAction.STATUS_CHANGE,
          actorId,
          targetUserId: requesterId,
          before: existing,
          after: updated,
        });

        const impactedUsers = [
          existing.requesterId,
          existing.receiverId,
        ].filter((id): id is string => Boolean(id));
        await this.notificationsService.createMany(
          tx,
          impactedUsers.map((userId) => ({
            userId,
            type: NotificationType.SWAP_REQUEST_UPDATED,
            title: 'Swap/drop cancelled',
            message: 'This request was cancelled by the initiator.',
            metadata: {
              requestId: existing.id,
            },
          })),
        );
        return { request: updated, locationId: existing.shift.locationId };
      },
    );

    this.realtimeService.emitSwapRequestUpdated(locationId, request.id);
    return request;
  }

  async listMyRequests(userId: string) {
    return this.prisma.db.swapRequest.findMany({
      where: {
        deletedAt: null,
        OR: [{ requesterId: userId }, { receiverId: userId }],
      },
      include: {
        requester: true,
        receiver: true,
        shift: true,
      },
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  async listApprovalQueue(actor: ActorContext) {
    const where = await this.buildScopedApprovalWhere(actor);
    return this.prisma.db.swapRequest.findMany({
      where: {
        ...where,
        deletedAt: null,
        status: SwapStatus.ACCEPTED_BY_PEER,
      },
      include: {
        requester: true,
        receiver: true,
        shift: {
          include: {
            location: true,
          },
        },
      },
      orderBy: [{ acceptedAt: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async listDropBoard(actor: ActorContext) {
    const where: Prisma.SwapRequestWhereInput = {
      deletedAt: null,
      type: SwapRequestType.DROP,
      status: SwapStatus.PENDING,
    };

    if (actor.role === SharedRole.STAFF) {
      const staff = await this.prisma.db.user.findUnique({
        where: { id: actor.id },
        select: { skills: true, certifiedLocations: true },
      });
      if (!staff) {
        return [];
      }

      where.shift = {
        requiredSkill: { in: staff.skills },
        locationId: { in: staff.certifiedLocations },
        assignments: {
          none: {
            userId: actor.id,
            deletedAt: null,
          },
        },
      };
    }

    return this.prisma.db.swapRequest.findMany({
      where: {
        ...where,
      },
      include: {
        requester: true,
        shift: {
          include: {
            location: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  async expirePendingDropRequest(requestId: string): Promise<boolean> {
    const result = await this.prisma.db.swapRequest.updateMany({
      where: {
        id: requestId,
        deletedAt: null,
        type: SwapRequestType.DROP,
        status: SwapStatus.PENDING,
        expiresAt: {
          lte: new Date(),
        },
      },
      data: {
        status: SwapStatus.EXPIRED,
        resolvedAt: new Date(),
        resolutionNote: 'Drop request expired 24h before shift start',
      },
    });

    if (result.count > 0) {
      const request = await this.prisma.db.swapRequest.findUnique({
        where: { id: requestId },
        include: {
          shift: {
            select: {
              locationId: true,
            },
          },
        },
      });
      if (request) {
        await this.prisma.db.auditLog.create({
          data: {
            entityType: AuditEntityType.SWAP_REQUEST,
            entityId: request.id,
            action: AuditAction.STATUS_CHANGE,
            targetUserId: request.requesterId,
            diff: {
              status: {
                before: SwapStatus.PENDING,
                after: SwapStatus.EXPIRED,
              },
            },
          },
        });

        await this.prisma.db.notification.create({
          data: {
            userId: request.requesterId,
            type: NotificationType.SWAP_REQUEST_UPDATED,
            title: 'Drop request expired',
            message:
              'Your drop request expired 24 hours before shift start without being claimed.',
            metadata: {
              requestId: request.id,
              shiftId: request.shiftId,
            },
          },
        });

        this.realtimeService.emitSwapRequestUpdated(
          request.shift.locationId,
          request.id,
        );
      }
      return true;
    }

    return false;
  }

  private async scheduleDropExpirationJob(
    requestId: string,
    expiresAt: Date | null,
  ): Promise<void> {
    if (!expiresAt) {
      return;
    }

    const delayMs = Math.max(0, expiresAt.getTime() - Date.now());
    await this.swapRequestsQueue.add(
      EXPIRE_DROP_JOB,
      {
        requestId,
      },
      {
        jobId: `drop-expire:${requestId}`,
        delay: delayMs,
        removeOnComplete: true,
        removeOnFail: 50,
      },
    );
  }

  private async ensureCanCreateActiveRequest(
    tx: TxClient,
    requesterId: string,
  ): Promise<void> {
    const activeCount = await tx.swapRequest.count({
      where: {
        requesterId,
        status: {
          in: ACTIVE_STATUSES,
        },
        deletedAt: null,
      },
    });

    if (activeCount >= 3) {
      throw new BadRequestException(
        'Maximum 3 active swap/drop requests per staff member',
      );
    }
  }

  private async findRequestForUpdate(
    tx: TxClient,
    requestId: string,
  ): Promise<SwapRequestWithShift> {
    await tx.$queryRaw`SELECT id FROM swap_requests WHERE id = ${requestId} FOR UPDATE`;

    const request = await tx.swapRequest.findUnique({
      where: { id: requestId },
      include: {
        shift: {
          include: {
            location: true,
            assignments: {
              where: {
                deletedAt: null,
              },
            },
          },
        },
        requester: true,
        receiver: true,
      },
    });

    if (!request || request.deletedAt) {
      throw new NotFoundException(
        `Swap request with ID ${requestId} not found`,
      );
    }

    if (request.shift.deletedAt) {
      throw new BadRequestException('Cannot modify request for deleted shift');
    }

    return request;
  }

  private assertBasicQualification(
    staff: Pick<User, 'certifiedLocations' | 'skills'>,
    shift: {
      requiredSkill: User['skills'][number];
      locationId: string;
    },
  ): void {
    if (!staff.skills.includes(shift.requiredSkill)) {
      throw new BadRequestException(
        'Staff member lacks required skill for this shift',
      );
    }

    if (!staff.certifiedLocations.includes(shift.locationId)) {
      throw new BadRequestException(
        'Staff member is not certified for this shift location',
      );
    }
  }

  private async assertActorCanReviewLocation(
    tx: TxClient,
    actor: ActorContext,
    locationId: string,
  ): Promise<void> {
    if (actor.role === SharedRole.ADMIN) {
      return;
    }
    if (actor.role !== SharedRole.MANAGER) {
      throw new ForbiddenException('Only managers/admins can review requests');
    }

    const dbUser = await tx.user.findUnique({
      where: { id: actor.id },
      select: { certifiedLocations: true },
    });
    if (!dbUser || !dbUser.certifiedLocations.includes(locationId)) {
      throw new ForbiddenException(
        `You are not authorized to access location: ${locationId}`,
      );
    }
  }

  private async buildScopedApprovalWhere(
    actor: ActorContext,
  ): Promise<Prisma.SwapRequestWhereInput> {
    if (actor.role === SharedRole.ADMIN) {
      return {};
    }
    if (actor.role !== SharedRole.MANAGER) {
      throw new ForbiddenException('Only managers/admins can view approvals');
    }

    const manager = await this.prisma.db.user.findUnique({
      where: { id: actor.id },
      select: { certifiedLocations: true },
    });
    if (!manager) {
      return { id: { equals: '__none__' } };
    }

    return {
      shift: {
        locationId: {
          in: manager.certifiedLocations,
        },
      },
    };
  }
}
