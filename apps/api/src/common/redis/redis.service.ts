import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, RedisClientType } from 'redis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client?: RedisClientType;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const redisUrl =
      this.configService.get<string>('REDIS_URL') ??
      `redis://localhost:${this.configService.get<string>('REDIS_PORT') ?? '6379'}`;

    this.client = createClient({
      url: redisUrl,
    });

    this.client.on('error', (error: unknown) => {
      this.logger.error('Redis client error', error);
    });

    await this.client.connect();
    this.logger.log(`Connected to Redis at ${redisUrl}`);
  }

  async onModuleDestroy() {
    if (this.client?.isOpen) {
      await this.client.quit();
    }
  }

  getClient(): RedisClientType {
    if (!this.client) {
      throw new Error('Redis client is not initialized');
    }
    return this.client;
  }
}
