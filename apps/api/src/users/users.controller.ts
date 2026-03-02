import {
  Controller,
  Get,
  UseGuards,
  Request as NestRequest,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/auth.service';

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
}
