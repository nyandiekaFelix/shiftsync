import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  UseInterceptors,
  Request,
} from '@nestjs/common';
import { ShiftsService } from './shifts.service';
import { AssignmentsService } from './assignments.service';
import { Request as ExpressRequest } from 'express';
import { AuthUser } from '@shiftsync/shared-types';
import { CreateShiftDto } from './dto/create-shift.dto';
import { UpdateShiftDto } from './dto/update-shift.dto';
import { AssignStaffDto } from './dto/assign-staff.dto';
import { PreviewAssignmentDto } from './dto/preview-assignment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RoleGuard } from '../auth/guards/role.guard';
import { LocationAccessGuard } from '../auth/guards/location-access.guard';
import { LocationSource } from '../auth/decorators/location-source.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@shiftsync/shared-types';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IdempotencyInterceptor } from '../common/idempotency/idempotency.interceptor';

interface AuthenticatedRequest extends ExpressRequest {
  user: AuthUser;
}

@ApiTags('shifts')
@ApiBearerAuth()
@Controller('shifts')
@UseGuards(JwtAuthGuard, RoleGuard)
export class ShiftsController {
  constructor(
    private readonly shiftsService: ShiftsService,
    private readonly assignmentsService: AssignmentsService,
  ) {}

  @Post()
  @Roles(Role.ADMIN, Role.MANAGER)
  @UseGuards(LocationAccessGuard)
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Create a new shift' })
  create(
    @Body() createShiftDto: CreateShiftDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.shiftsService.create(createShiftDto, req.user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Get all shifts for a location and date range' })
  findAll(
    @Query('locationId') locationId: string,
    @Query('start') start: string,
    @Query('end') end: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.shiftsService.findAll(req.user, locationId, start, end);
  }

  @Get('live')
  @ApiOperation({
    summary: 'Get currently active shifts for a location (On-Duty dashboard)',
  })
  getLiveShifts(
    @Query('locationId') locationId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.shiftsService.getLiveShifts(locationId, req.user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single shift' })
  findOne(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.shiftsService.findOne(id, req.user);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Update a shift' })
  update(
    @Param('id') id: string,
    @Body() updateShiftDto: UpdateShiftDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.shiftsService.update(id, updateShiftDto, req.user, req.user.id);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Soft delete a shift' })
  remove(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.shiftsService.remove(id, req.user, req.user.id);
  }

  @Post(':id/assignments')
  @Roles(Role.ADMIN, Role.MANAGER)
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Assign staff to a shift' })
  assignStaff(
    @Param('id') id: string,
    @Body() assignStaffDto: AssignStaffDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.assignmentsService.assignStaff(
      id,
      assignStaffDto.userId,
      assignStaffDto.managerOverride?.reason,
      req.user,
      req.user.id,
    );
  }

  @Post(':id/assignments/preview')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Preview assignment impact before confirming' })
  previewAssignment(
    @Param('id') id: string,
    @Body() body: PreviewAssignmentDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.assignmentsService.previewAssignment(
      id,
      body.userId,
      req.user,
      body.managerOverrideReason,
      body.hourlyRate,
    );
  }

  @Delete(':id/assignments/:assignmentId')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Unassign staff from a shift' })
  unassignStaff(
    @Param('id') id: string,
    @Param('assignmentId') assignmentId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.assignmentsService.unassignStaff(
      id,
      assignmentId,
      req.user,
      req.user.id,
    );
  }

  @Post('publish')
  @Roles(Role.ADMIN, Role.MANAGER)
  @UseGuards(LocationAccessGuard)
  @LocationSource('query')
  @ApiOperation({
    summary: 'Bulk publish shifts for a location and date range',
  })
  publishBulk(
    @Query('locationId') locationId: string,
    @Query('start') start: string,
    @Query('end') end: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.shiftsService.publishBulk(locationId, start, end, req.user.id);
  }
}
