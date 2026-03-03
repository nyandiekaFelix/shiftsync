import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, Role } from '@shiftsync/shared-types';
import { Request as ExpressRequest } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RoleGuard } from '../auth/guards/role.guard';
import { FairnessService } from './fairness.service';

@ApiTags('fairness')
@ApiBearerAuth()
@Controller('fairness')
@UseGuards(JwtAuthGuard, RoleGuard)
@Roles(Role.ADMIN, Role.MANAGER)
export class FairnessController {
  constructor(private readonly fairnessService: FairnessService) {}

  @Get('report')
  @ApiOperation({ summary: 'Generate fairness distribution analytics report' })
  getReport(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('locationId') locationId?: string,
    @Request() req?: ExpressRequest & { user: AuthUser },
  ) {
    return this.fairnessService.getReport(from, to, req?.user, locationId);
  }
}
