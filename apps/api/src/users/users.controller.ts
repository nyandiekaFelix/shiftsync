import {
  Controller,
  Get,
  UseGuards,
  Query,
  Request as NestRequest,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, Skill as PrismaSkill } from '@prisma/client';
import { AuthUser, Role, Skill } from '@shiftsync/shared-types';

interface AuthenticatedRequest extends Request {
  user: AuthUser;
}

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private prisma: PrismaService) {}

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  async getProfile(@NestRequest() req: AuthenticatedRequest) {
    const user = await this.prisma.db.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        skills: true,
        certifiedLocations: true,
      },
    });
    return user;
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get()
  @ApiOperation({
    summary: 'Get all users with optional location and skill filters',
  })
  async findAll(
    @Query('locationId') locationId?: string,
    @Query('skill') skill?: string,
  ) {
    const where: Prisma.UserWhereInput = {
      role: Role.STAFF as unknown as Prisma.EnumRoleFilter,
    };

    if (locationId && locationId !== 'null' && locationId !== 'undefined') {
      where.certifiedLocations = {
        has: locationId,
      };
    }

    if (skill && skill !== 'null' && skill !== 'undefined') {
      where.skills = {
        has: skill as PrismaSkill,
      };
    }

    console.log(
      '[UsersController] Fetching staff with where:',
      JSON.stringify(where),
    );

    const users = await this.prisma.db.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        skills: true,
      },
      orderBy: { name: 'asc' },
    });

    console.log(`[UsersController] Found ${users.length} staff members`);
    return users.map((user) => ({
      ...user,
      role: user.role as unknown as Role,
      skills: user.skills as unknown as Skill[],
    }));
  }
}
