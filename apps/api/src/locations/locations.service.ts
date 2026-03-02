import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { Role } from '@shiftsync/shared-types';

@Injectable()
export class LocationsService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.db.location.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async findAllForUser(user: AuthenticatedUser) {
    if ((user.role as unknown as Role) === Role.ADMIN) {
      return this.prisma.db.location.findMany({
        orderBy: { name: 'asc' },
      });
    }

    return this.prisma.db.location.findMany({
      where: {
        id: { in: user.certifiedLocations },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    return this.prisma.db.location.findUnique({
      where: { id },
    });
  }
}
