import { Injectable, NotFoundException } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
type TxClient = Parameters<
  Parameters<PrismaService['db']['$transaction']>[0]
>[0];

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  metadata?: Prisma.InputJsonValue;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tx: TxClient, input: CreateNotificationInput) {
    return tx.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        message: input.message,
        metadata: input.metadata,
      },
    });
  }

  async createMany(tx: TxClient, notifications: CreateNotificationInput[]) {
    if (notifications.length === 0) {
      return;
    }

    await tx.notification.createMany({
      data: notifications.map((item) => ({
        userId: item.userId,
        type: item.type,
        title: item.title,
        message: item.message,
        metadata: item.metadata,
      })),
    });
  }

  async listForUser(userId: string, unreadOnly: boolean, limit = 50) {
    return this.prisma.db.notification.findMany({
      where: {
        userId,
        ...(unreadOnly ? { readAt: null } : {}),
      },
      orderBy: [{ createdAt: 'desc' }],
      take: Math.min(Math.max(limit, 1), 200),
    });
  }

  async markRead(userId: string, notificationId: string) {
    const updated = await this.prisma.db.notification.updateMany({
      where: {
        id: notificationId,
        userId,
      },
      data: {
        readAt: new Date(),
      },
    });

    if (updated.count === 0) {
      throw new NotFoundException('Notification not found');
    }

    return { success: true };
  }

  async markAllRead(userId: string) {
    const result = await this.prisma.db.notification.updateMany({
      where: {
        userId,
        readAt: null,
      },
      data: {
        readAt: new Date(),
      },
    });

    return { count: result.count };
  }
}
