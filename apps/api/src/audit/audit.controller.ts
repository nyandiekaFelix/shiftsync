import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@shiftsync/shared-types';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RoleGuard } from '../auth/guards/role.guard';
import { AuditService } from './audit.service';

@ApiTags('audit-logs')
@ApiBearerAuth()
@Controller('audit-logs')
@UseGuards(JwtAuthGuard, RoleGuard)
@Roles(Role.ADMIN, Role.MANAGER)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'List audit logs by optional filters' })
  list(
    @Query('shiftId') shiftId?: string,
    @Query('userId') userId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    return this.auditService.list({
      shiftId,
      userId,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('shift/:shiftId')
  @ApiOperation({ summary: 'Get shift-specific audit trail history' })
  listByShift(
    @Param('shiftId') shiftId: string,
    @Query('limit') limit?: string,
  ) {
    return this.auditService.listByShift(shiftId, limit ? Number(limit) : 200);
  }

  @Get('user/:userId')
  @ApiOperation({ summary: 'Get user-specific audit trail history' })
  listByUser(@Param('userId') userId: string, @Query('limit') limit?: string) {
    return this.auditService.listByUser(userId, limit ? Number(limit) : 200);
  }
}
