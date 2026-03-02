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
} from '@nestjs/common';
import { ShiftsService } from './shifts.service';
import { AssignmentsService } from './assignments.service';
import { CreateShiftDto } from './dto/create-shift.dto';
import { UpdateShiftDto } from './dto/update-shift.dto';
import { AssignStaffDto } from './dto/assign-staff.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RoleGuard } from '../auth/guards/role.guard';
import { LocationAccessGuard } from '../auth/guards/location-access.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@shiftsync/shared-types';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

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
  @ApiOperation({ summary: 'Create a new shift' })
  create(@Body() createShiftDto: CreateShiftDto) {
    return this.shiftsService.create(createShiftDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all shifts for a location and date range' })
  findAll(
    @Query('locationId') locationId: string,
    @Query('start') start: string,
    @Query('end') end: string,
  ) {
    return this.shiftsService.findAll(locationId, start, end);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single shift' })
  findOne(@Param('id') id: string) {
    return this.shiftsService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Update a shift' })
  update(@Param('id') id: string, @Body() updateShiftDto: UpdateShiftDto) {
    return this.shiftsService.update(id, updateShiftDto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Soft delete a shift' })
  remove(@Param('id') id: string) {
    return this.shiftsService.remove(id);
  }

  @Post(':id/assignments')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Assign staff to a shift' })
  assignStaff(@Param('id') id: string, @Body() assignStaffDto: AssignStaffDto) {
    return this.assignmentsService.assignStaff(
      id,
      assignStaffDto.userId,
      assignStaffDto.managerOverride?.reason,
    );
  }

  @Delete(':id/assignments/:assignmentId')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Unassign staff from a shift' })
  unassignStaff(
    @Param('id') id: string,
    @Param('assignmentId') assignmentId: string,
  ) {
    return this.assignmentsService.unassignStaff(id, assignmentId);
  }

  @Post('publish')
  @Roles(Role.ADMIN, Role.MANAGER)
  @UseGuards(LocationAccessGuard)
  @ApiOperation({
    summary: 'Bulk publish shifts for a location and date range',
  })
  publishBulk(
    @Query('locationId') locationId: string,
    @Query('start') start: string,
    @Query('end') end: string,
  ) {
    return this.shiftsService.publishBulk(locationId, start, end);
  }
}
