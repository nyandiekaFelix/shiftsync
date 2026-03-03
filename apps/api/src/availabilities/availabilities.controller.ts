import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request as ExpressRequest } from 'express';
import { Role } from '@shiftsync/shared-types';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RoleGuard } from '../auth/guards/role.guard';
import { AvailabilitiesService } from './availabilities.service';
import { UpsertAvailabilityDto } from './dto/upsert-availability.dto';

interface AuthenticatedRequest extends ExpressRequest {
  user: {
    id: string;
  };
}

@ApiTags('availabilities')
@ApiBearerAuth()
@Controller('availabilities')
@UseGuards(JwtAuthGuard, RoleGuard)
export class AvailabilitiesController {
  constructor(private readonly availabilitiesService: AvailabilitiesService) {}

  @Get('me')
  @Roles(Role.STAFF)
  @ApiOperation({ summary: 'List my configured availabilities' })
  listMine(@Request() req: AuthenticatedRequest) {
    return this.availabilitiesService.listMine(req.user.id);
  }

  @Post()
  @Roles(Role.STAFF)
  @ApiOperation({ summary: 'Create recurring/exception availability window' })
  create(
    @Request() req: AuthenticatedRequest,
    @Body() body: UpsertAvailabilityDto,
  ) {
    return this.availabilitiesService.create(req.user.id, body);
  }

  @Patch(':id')
  @Roles(Role.STAFF)
  @ApiOperation({ summary: 'Update an availability window' })
  update(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: UpsertAvailabilityDto,
  ) {
    return this.availabilitiesService.update(req.user.id, id, body);
  }

  @Delete(':id')
  @Roles(Role.STAFF)
  @ApiOperation({ summary: 'Delete availability window (soft delete)' })
  remove(@Request() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.availabilitiesService.remove(req.user.id, id);
  }
}
