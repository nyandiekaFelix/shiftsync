import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { Role } from '@prisma/client';
import { Request } from 'express';
import { AuthUser } from '../auth.service';
import {
  LOCATION_SOURCE_KEY,
  LocationSource,
} from '../decorators/location-source.decorator';

interface AuthenticatedRequest extends Request {
  user: AuthUser;
}

@Injectable()
export class LocationAccessGuard implements CanActivate {
  constructor(
    private prisma: PrismaService,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (user.role === Role.ADMIN) {
      return true;
    }

    const source = this.reflector.getAllAndOverride<LocationSource>(
      LOCATION_SOURCE_KEY,
      [context.getHandler(), context.getClass()],
    );

    let locationIdRaw: unknown;

    if (source) {
      const requestSource = request[source] as Record<string, unknown>;
      locationIdRaw = requestSource?.locationId;
    } else {
      // Fallback to implicit extraction if no decorator is present
      locationIdRaw =
        request.params.locationId ||
        request.query.locationId ||
        (request.body as { locationId?: unknown }).locationId;
    }

    const locationId =
      typeof locationIdRaw === 'string' ? locationIdRaw : undefined;

    if (!locationId) {
      throw new ForbiddenException(
        'Location context (string) is required for this operation',
      );
    }

    const dbUser = await this.prisma.db.user.findUnique({
      where: { id: user.id },
      select: { certifiedLocations: true },
    });

    if (!dbUser || !dbUser.certifiedLocations.includes(locationId)) {
      throw new ForbiddenException(
        `You are not authorized to access location: ${locationId}`,
      );
    }

    return true;
  }
}
