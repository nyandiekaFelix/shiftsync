import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ShiftsModule } from './shifts/shifts.module';
import { LocationsModule } from './locations/locations.module';
import { RedisModule } from './common/redis/redis.module';
import { RealtimeModule } from './realtime/realtime.module';
import { SwapRequestsModule } from './swap-requests/swap-requests.module';
import { AuditModule } from './audit/audit.module';
import { FairnessModule } from './fairness/fairness.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AvailabilitiesModule } from './availabilities/availabilities.module';

import { validate } from './common/configs/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      ignoreEnvFile: process.env.NODE_ENV === 'production',
      validate,
      cache: true,
    }),
    BullModule.forRootAsync({
      inject: [],
      useFactory: () => {
        const redisUrl =
          process.env.REDIS_URL ??
          `redis://localhost:${process.env.REDIS_PORT ?? '6379'}`;
        const parsedRedisUrl = new URL(redisUrl);

        return {
          connection: {
            host: parsedRedisUrl.hostname,
            port: Number(parsedRedisUrl.port || '6379'),
            username: parsedRedisUrl.username || undefined,
            password: parsedRedisUrl.password || undefined,
            db: Number(parsedRedisUrl.pathname.replace('/', '') || '0'),
            tls: parsedRedisUrl.protocol === 'rediss:' ? {} : undefined,
          },
        };
      },
    }),
    HealthModule,
    PrismaModule,
    RedisModule,
    RealtimeModule,
    AuthModule,
    UsersModule,
    ShiftsModule,
    SwapRequestsModule,
    LocationsModule,
    AuditModule,
    FairnessModule,
    NotificationsModule,
    AvailabilitiesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
