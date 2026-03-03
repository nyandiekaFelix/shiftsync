import { Injectable, Logger, NotFoundException } from '@nestjs/common';
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

export interface NotificationPreferences {
  inApp: boolean;
  emailSimulation: boolean;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(tx: TxClient, input: CreateNotificationInput) {
    const preferences = await this.getPreferencesTx(tx, input.userId);
    if (preferences.emailSimulation) {
      this.simulateEmail(input.userId, input.title, input.message);
    }
    if (!preferences.inApp) {
      return null;
    }

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

    const filtered: CreateNotificationInput[] = [];
    for (const item of notifications) {
      const preferences = await this.getPreferencesTx(tx, item.userId);
      if (preferences.emailSimulation) {
        this.simulateEmail(item.userId, item.title, item.message);
      }
      if (preferences.inApp) {
        filtered.push(item);
      }
    }

    if (filtered.length === 0) {
      return;
    }

    await tx.notification.createMany({
      data: filtered.map((item) => ({
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

  async getPreferences(userId: string): Promise<NotificationPreferences> {
    return this.getPreferencesTx(this.prisma.db, userId);
  }

  async updatePreferences(
    userId: string,
    preferences: Partial<NotificationPreferences>,
  ): Promise<NotificationPreferences> {
    const current = await this.getPreferences(userId);
    const next: NotificationPreferences = {
      inApp: preferences.inApp ?? current.inApp,
      emailSimulation: preferences.emailSimulation ?? current.emailSimulation,
    };

    await this.prisma.db.$executeRaw`
      INSERT INTO notification_preferences (user_id, in_app, email_simulation, updated_at)
      VALUES (${userId}::uuid, ${next.inApp}, ${next.emailSimulation}, NOW())
      ON CONFLICT (user_id) DO UPDATE
      SET
        in_app = EXCLUDED.in_app,
        email_simulation = EXCLUDED.email_simulation,
        updated_at = NOW()
    `;

    return next;
  }

  private async getPreferencesTx(
    tx: TxClient | PrismaService['db'],
    userId: string,
  ): Promise<NotificationPreferences> {
    let rows: Array<{ in_app: boolean; email_simulation: boolean }> = [];
    try {
      rows = (await tx.$queryRaw<
        {
          in_app: boolean;
          email_simulation: boolean;
        }[]
      >`
        SELECT in_app, email_simulation
        FROM notification_preferences
        WHERE user_id = ${userId}::uuid
        LIMIT 1
      `) as Array<{ in_app: boolean; email_simulation: boolean }>;
    } catch {
      return {
        inApp: true,
        emailSimulation: false,
      };
    }

    if (rows.length === 0) {
      return {
        inApp: true,
        emailSimulation: false,
      };
    }

    return {
      inApp: rows[0].in_app,
      emailSimulation: rows[0].email_simulation,
    };
  }

  private simulateEmail(userId: string, title: string, message: string): void {
    this.logger.log(
      `[EMAIL_SIMULATION] user=${userId} title="${title}" message="${message}"`,
    );
  }
}
