import { Test, TestingModule } from '@nestjs/testing';
import { LocationAccessGuard } from './location-access.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';

describe('LocationAccessGuard', () => {
  let guard: LocationAccessGuard;
  let prisma: PrismaService;
  let reflector: Reflector;

  const mockPrismaService = {
    db: {
      user: {
        findUnique: jest.fn(),
      },
    },
  };

  const mockReflector = {
    getAllAndOverride: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LocationAccessGuard,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: Reflector, useValue: mockReflector },
      ],
    }).compile();

    guard = module.get<LocationAccessGuard>(LocationAccessGuard);
    prisma = module.get<PrismaService>(PrismaService);
    reflector = module.get<Reflector>(Reflector);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('canActivate', () => {
    const mockContext = (requestData: unknown) =>
      ({
        switchToHttp: () => ({
          getRequest: () => requestData,
        }),
        getHandler: jest.fn(),
        getClass: jest.fn(),
      }) as unknown as ExecutionContext;

    it('should allow Admin unconditionally', async () => {
      const context = mockContext({ user: { role: Role.ADMIN } });
      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('should extract locationId from explicit source (query)', async () => {
      const context = mockContext({
        user: { id: 'user-1', role: Role.MANAGER },
        query: { locationId: 'loc-1' },
        body: { locationId: 'loc-wrong' },
      });
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue('query');
      (prisma.db.user.findUnique as jest.Mock).mockResolvedValue({
        certifiedLocations: ['loc-1'],
      });

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
      expect(prisma.db.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        select: { certifiedLocations: true },
      });
    });

    it('should extract locationId from explicit source (body)', async () => {
      const context = mockContext({
        user: { id: 'user-1', role: Role.MANAGER },
        body: { locationId: 'loc-1' },
      });
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue('body');
      (prisma.db.user.findUnique as jest.Mock).mockResolvedValue({
        certifiedLocations: ['loc-1'],
      });

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('should fallback to implicit extraction if no source metadata', async () => {
      const context = mockContext({
        user: { id: 'user-1', role: Role.MANAGER },
        params: { locationId: 'loc-1' },
      });
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(null);
      (prisma.db.user.findUnique as jest.Mock).mockResolvedValue({
        certifiedLocations: ['loc-1'],
      });

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('should throw ForbiddenException if locationId is missing', async () => {
      const context = mockContext({
        user: { id: 'user-1', role: Role.MANAGER },
        query: {},
      });
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue('query');

      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw ForbiddenException if user is not certified for location', async () => {
      const context = mockContext({
        user: { id: 'user-1', role: Role.MANAGER },
        query: { locationId: 'loc-unauthorized' },
      });
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue('query');
      (prisma.db.user.findUnique as jest.Mock).mockResolvedValue({
        certifiedLocations: ['loc-authorized'],
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
