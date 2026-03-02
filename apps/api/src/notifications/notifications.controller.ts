import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request as ExpressRequest } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NotificationsService } from './notifications.service';

interface AuthenticatedRequest extends ExpressRequest {
  user: {
    id: string;
  };
}

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'List notifications for current user' })
  list(
    @Request() req: AuthenticatedRequest,
    @Query('unreadOnly') unreadOnly?: string,
    @Query('limit') limit?: string,
  ) {
    return this.notificationsService.listForUser(
      req.user.id,
      unreadOnly === 'true',
      limit ? Number(limit) : 50,
    );
  }

  @Post(':id/read')
  @ApiOperation({ summary: 'Mark notification as read' })
  markRead(@Request() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.notificationsService.markRead(req.user.id, id);
  }

  @Post('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  markAllRead(@Request() req: AuthenticatedRequest) {
    return this.notificationsService.markAllRead(req.user.id);
  }
}
