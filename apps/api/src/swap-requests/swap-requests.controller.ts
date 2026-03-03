import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@shiftsync/shared-types';
import { Request as ExpressRequest } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RoleGuard } from '../auth/guards/role.guard';
import { InitiateSwapDto } from './dto/initiate-swap.dto';
import { InitiateDropDto } from './dto/initiate-drop.dto';
import { ApproveSwapDto } from './dto/approve-swap.dto';
import { SwapRequestsService } from './swap-requests.service';

interface AuthenticatedRequest extends ExpressRequest {
  user: {
    id: string;
    role: Role;
    certifiedLocations: string[];
  };
}

@ApiTags('swap-requests')
@ApiBearerAuth()
@Controller('swap-requests')
@UseGuards(JwtAuthGuard, RoleGuard)
export class SwapRequestsController {
  constructor(private readonly swapRequestsService: SwapRequestsService) {}

  @Post('swap')
  @Roles(Role.STAFF)
  @ApiOperation({ summary: 'Initiate a shift swap request with a peer' })
  createSwap(
    @Body() body: InitiateSwapDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.swapRequestsService.requestSwap(
      req.user.id,
      body.shiftId,
      body.receiverId,
      req.user.id,
    );
  }

  @Post('drop')
  @Roles(Role.STAFF)
  @ApiOperation({ summary: 'Offer an assigned shift for pickup' })
  createDrop(
    @Body() body: InitiateDropDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.swapRequestsService.requestDrop(
      req.user.id,
      body.shiftId,
      req.user.id,
    );
  }

  @Post(':id/accept')
  @Roles(Role.STAFF)
  @ApiOperation({ summary: 'Accept a swap or claim a drop request' })
  accept(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.swapRequestsService.acceptRequest(id, req.user.id, req.user.id);
  }

  @Post(':id/approve')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Approve or deny a peer-accepted request' })
  approve(
    @Param('id') id: string,
    @Body() body: ApproveSwapDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.swapRequestsService.approveRequest(
      id,
      body.approve,
      body.reason,
      req.user,
      req.user.id,
    );
  }

  @Post(':id/cancel')
  @Roles(Role.STAFF)
  @ApiOperation({ summary: 'Cancel an active request by its initiator' })
  cancel(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.swapRequestsService.cancelByInitiator(
      id,
      req.user.id,
      req.user.id,
    );
  }

  @Get()
  @Roles(Role.STAFF, Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'List swap/drop requests by role-specific scope' })
  list(
    @Query('scope') scope: string | undefined,
    @Request() req: AuthenticatedRequest,
  ) {
    if (scope === 'approval') {
      if (req.user.role === Role.STAFF) {
        throw new ForbiddenException('Only managers/admins can view approvals');
      }
      return this.swapRequestsService.listApprovalQueue(req.user);
    }

    if (scope === 'drop-board') {
      return this.swapRequestsService.listDropBoard(req.user);
    }

    return this.swapRequestsService.listMyRequests(req.user.id);
  }
}
