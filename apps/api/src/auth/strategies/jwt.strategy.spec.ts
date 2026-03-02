import { Test, TestingModule } from '@nestjs/testing';
import { JwtStrategy } from './jwt.strategy';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { UnauthorizedException } from '@nestjs/common';
import { Role } from '@shiftsync/shared-types';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let prisma: PrismaService;

  const mockPrismaService = {
    db: {
      user: {
        findUnique: jest.fn(),
      },
    },
  };

  const mockConfigService = {
    getOrThrow: jest.fn().mockReturnValue('secret'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(strategy).toBeDefined();
  });

  describe('validate', () => {
    it('should return user data if user exists in DB', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        role: Role.STAFF,
        certifiedLocations: [],
      };
      (prisma.db.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      const result = await strategy.validate({
        sub: 'user-1',
        email: 'test@example.com',
        role: Role.ADMIN, // Payload says ADMIN
      });

      expect(result).toEqual({
        id: 'user-1',
        email: 'test@example.com',
        role: Role.STAFF, // Returns DB role (STAFF)
        certifiedLocations: [],
      });
      expect(prisma.db.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        select: { id: true, email: true, role: true, certifiedLocations: true },
      });
    });

    it('should throw UnauthorizedException if user does not exist', async () => {
      (prisma.db.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        strategy.validate({
          sub: 'unknown',
          email: 'none@example.com',
          role: Role.STAFF,
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
