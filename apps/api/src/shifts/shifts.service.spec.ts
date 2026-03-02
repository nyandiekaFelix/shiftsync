import { Test, TestingModule } from '@nestjs/testing';
import { ShiftsService } from './shifts.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { Role, AuthUser } from '@shiftsync/shared-types';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';

describe('ShiftsService', () => {
  let service: ShiftsService;
  let prisma: PrismaService;

  const mockPrismaService = {
    db: {
      location: {
        findUnique: jest.fn(),
      },
      shift: {
        findMany: jest.fn(),
      },
    },
  };

  const mockRealtimeService = {
    emitShiftUpdated: jest.fn(),
    emitSchedulePublished: jest.fn(),
  };

  const mockAuditService = {
    createLog: jest.fn(),
  };

  const mockNotificationsService = {
    create: jest.fn(),
    createMany: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShiftsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: RealtimeService, useValue: mockRealtimeService },
        { provide: AuditService, useValue: mockAuditService },
        { provide: NotificationsService, useValue: mockNotificationsService },
      ],
    }).compile();

    service = module.get<ShiftsService>(ShiftsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('findAll', () => {
    const mockStaff: AuthUser = {
      id: 'user-1',
      email: 'staff@example.com',
      name: 'Staff User',
      role: Role.STAFF,
      certifiedLocations: ['loc-1'],
    };

    const mockManager: AuthUser = {
      id: 'manager-1',
      email: 'manager@example.com',
      name: 'Manager User',
      role: Role.MANAGER,
      certifiedLocations: ['loc-1'],
    };

    it('should throw BadRequestException for Manager when locationId is missing', async () => {
      await expect(
        service.findAll(mockManager, '', '2026-03-01', '2026-03-07'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should return assigned shifts for Staff when locationId is missing', async () => {
      const mockShifts = [{ id: 'shift-1', locationId: 'loc-1' }];
      (prisma.db.shift.findMany as jest.Mock).mockResolvedValue(mockShifts);

      const result = await service.findAll(
        mockStaff,
        '',
        '2026-03-01',
        '2026-03-07',
      );

      const findManyCalls = (prisma.db.shift.findMany as jest.Mock).mock
        .calls as unknown[][];
      const firstCall = findManyCalls[0]?.[0] as {
        where?: {
          assignments?: {
            some?: {
              userId?: string;
              deletedAt?: null;
            };
          };
        };
      };

      expect(firstCall.where?.assignments?.some?.userId).toBe(mockStaff.id);
      expect(firstCall.where?.assignments?.some?.deletedAt).toBeNull();
      expect(result).toEqual(mockShifts);
    });

    it('should return all shifts for a location when locationId is provided', async () => {
      const mockLocation = { id: 'loc-1', timezone: 'UTC', deletedAt: null };
      const mockShifts = [{ id: 'shift-1', locationId: 'loc-1' }];
      (prisma.db.location.findUnique as jest.Mock).mockResolvedValue(
        mockLocation,
      );
      (prisma.db.shift.findMany as jest.Mock).mockResolvedValue(mockShifts);

      const result = await service.findAll(
        mockManager,
        'loc-1',
        '2026-03-01',
        '2026-03-07',
      );

      expect(prisma.db.location.findUnique).toHaveBeenCalledWith({
        where: { id: 'loc-1' },
      });
      const findManyCalls = (prisma.db.shift.findMany as jest.Mock).mock
        .calls as unknown[][];
      const latestCall = findManyCalls.at(-1)?.[0] as {
        where?: {
          locationId?: string;
        };
      };
      expect(latestCall.where?.locationId).toBe('loc-1');
      expect(result).toEqual(mockShifts);
    });

    it('should throw NotFoundException if location does not exist', async () => {
      (prisma.db.location.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.findAll(mockManager, 'loc-invalid', '2026-03-01', '2026-03-07'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
