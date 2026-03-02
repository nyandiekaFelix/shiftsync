import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { BadRequestException } from '@nestjs/common';
import { Role, SwapRequestType, SwapStatus } from '@prisma/client';
import { SwapRequestsService } from './swap-requests.service';
import { SWAP_REQUESTS_QUEUE } from './swap-requests.constants';
import { PrismaService } from '../prisma/prisma.service';
import { ConstraintEngineService } from '../shifts/constraints/constraint-engine.service';
import { RealtimeService } from '../realtime/realtime.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';

describe('SwapRequestsService', () => {
  let service: SwapRequestsService;
  type TxCallback<TTx> = (tx: TTx) => Promise<unknown>;

  const mockPrismaService = {
    db: {
      $transaction: jest.fn(),
      swapRequest: {
        findMany: jest.fn(),
        updateMany: jest.fn(),
        findUnique: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
      notification: {
        create: jest.fn(),
      },
    },
  };

  const mockConstraintEngine = {
    evaluate: jest.fn(),
  };

  const mockRealtimeService = {
    emitSwapRequestUpdated: jest.fn(),
    emitAssignmentRemoved: jest.fn(),
    emitAssignmentCreated: jest.fn(),
  };

  const mockQueue = {
    add: jest.fn(),
  };

  const mockAuditService = {
    createLog: jest.fn(),
  };

  const mockNotificationsService = {
    create: jest.fn(),
    createMany: jest.fn(),
  };

  const mockTransaction = <TTx>(tx: TTx): void => {
    (
      mockPrismaService.db.$transaction as jest.Mock<
        Promise<unknown>,
        [TxCallback<TTx>]
      >
    ).mockImplementation((callback) => callback(tx));
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SwapRequestsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ConstraintEngineService, useValue: mockConstraintEngine },
        { provide: RealtimeService, useValue: mockRealtimeService },
        { provide: AuditService, useValue: mockAuditService },
        { provide: NotificationsService, useValue: mockNotificationsService },
        { provide: getQueueToken(SWAP_REQUESTS_QUEUE), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<SwapRequestsService>(SwapRequestsService);
  });

  it('accepts a pending swap and moves it to ACCEPTED_BY_PEER', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue(undefined),
      swapRequest: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'req-1',
          type: SwapRequestType.SWAP,
          status: SwapStatus.PENDING,
          requesterId: 'staff-a',
          receiverId: 'staff-b',
          shiftId: 'shift-1',
          deletedAt: null,
          shift: {
            locationId: 'loc-1',
            requiredSkill: 'SERVER',
            assignments: [],
            deletedAt: null,
          },
        }),
        update: jest.fn().mockResolvedValue({
          id: 'req-1',
          shiftId: 'shift-1',
          status: SwapStatus.ACCEPTED_BY_PEER,
        }),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'staff-b',
          role: Role.STAFF,
          deletedAt: null,
          skills: ['SERVER'],
          certifiedLocations: ['loc-1'],
        }),
      },
    };

    mockTransaction(tx);

    const result = await service.acceptRequest('req-1', 'staff-b');

    expect(result.status).toBe(SwapStatus.ACCEPTED_BY_PEER);
    const updateCall = (
      tx.swapRequest.update as jest.Mock<
        Promise<unknown>,
        [{ data: { status: SwapStatus } }]
      >
    ).mock.calls[0]?.[0];
    expect(updateCall?.data.status).toBe(SwapStatus.ACCEPTED_BY_PEER);
    expect(mockRealtimeService.emitSwapRequestUpdated).toHaveBeenCalledWith(
      'loc-1',
      'req-1',
    );
  });

  it('allows manager denial by moving ACCEPTED_BY_PEER to CANCELLED', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue(undefined),
      swapRequest: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'req-2',
          type: SwapRequestType.DROP,
          status: SwapStatus.ACCEPTED_BY_PEER,
          requesterId: 'staff-a',
          receiverId: 'staff-b',
          shiftId: 'shift-2',
          deletedAt: null,
          shift: {
            locationId: 'loc-1',
            requiredSkill: 'SERVER',
            assignments: [],
            deletedAt: null,
          },
        }),
        update: jest.fn().mockResolvedValue({
          id: 'req-2',
          shiftId: 'shift-2',
          status: SwapStatus.CANCELLED,
        }),
      },
    };

    mockTransaction(tx);

    const result = await service.approveRequest('req-2', false, 'Not approved');

    expect(result.request.status).toBe(SwapStatus.CANCELLED);
    expect(mockRealtimeService.emitSwapRequestUpdated).toHaveBeenCalledWith(
      'loc-1',
      'req-2',
    );
  });

  it('lets initiator cancel an active request', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue(undefined),
      swapRequest: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'req-3',
          type: SwapRequestType.SWAP,
          status: SwapStatus.PENDING,
          requesterId: 'staff-a',
          receiverId: 'staff-b',
          shiftId: 'shift-3',
          deletedAt: null,
          shift: {
            locationId: 'loc-2',
            requiredSkill: 'SERVER',
            assignments: [],
            deletedAt: null,
          },
        }),
        update: jest.fn().mockResolvedValue({
          id: 'req-3',
          shiftId: 'shift-3',
          status: SwapStatus.CANCELLED,
        }),
      },
    };

    mockTransaction(tx);

    const result = await service.cancelByInitiator('req-3', 'staff-a');

    expect(result.status).toBe(SwapStatus.CANCELLED);
    expect(mockRealtimeService.emitSwapRequestUpdated).toHaveBeenCalledWith(
      'loc-2',
      'req-3',
    );
  });

  it('expires only still-pending drop requests', async () => {
    mockPrismaService.db.swapRequest.updateMany.mockResolvedValue({
      count: 1,
    });
    mockPrismaService.db.swapRequest.findUnique.mockResolvedValue({
      id: 'req-4',
      shift: { locationId: 'loc-3' },
    });

    const wasExpired = await service.expirePendingDropRequest('req-4');

    expect(wasExpired).toBe(true);
    const updateManyCall = (
      mockPrismaService.db.swapRequest.updateMany as jest.Mock<
        Promise<unknown>,
        [
          {
            where: { type: SwapRequestType; status: SwapStatus };
            data: { status: SwapStatus };
          },
        ]
      >
    ).mock.calls[0]?.[0];
    expect(updateManyCall?.where.type).toBe(SwapRequestType.DROP);
    expect(updateManyCall?.where.status).toBe(SwapStatus.PENDING);
    expect(updateManyCall?.data.status).toBe(SwapStatus.EXPIRED);
    expect(mockRealtimeService.emitSwapRequestUpdated).toHaveBeenCalledWith(
      'loc-3',
      'req-4',
    );
  });

  it('blocks requester from claiming their own drop request', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue(undefined),
      swapRequest: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'req-5',
          type: SwapRequestType.DROP,
          status: SwapStatus.PENDING,
          requesterId: 'staff-a',
          receiverId: null,
          shiftId: 'shift-5',
          deletedAt: null,
          shift: {
            locationId: 'loc-1',
            requiredSkill: 'SERVER',
            assignments: [],
            deletedAt: null,
          },
        }),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'staff-a',
          role: Role.STAFF,
          deletedAt: null,
          skills: ['SERVER'],
          certifiedLocations: ['loc-1'],
        }),
      },
    };

    mockTransaction(tx);

    await expect(service.acceptRequest('req-5', 'staff-a')).rejects.toThrow(
      BadRequestException,
    );
  });
});
