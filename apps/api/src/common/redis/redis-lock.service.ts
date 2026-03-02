import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { RedisService } from './redis.service';

const RELEASE_LOCK_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end
return 0
`;

export interface AcquiredLock {
  key: string;
  token: string;
}

@Injectable()
export class RedisLockService {
  constructor(private readonly redisService: RedisService) {}

  async acquire(
    key: string,
    ttlMs: number,
    waitTimeoutMs: number,
  ): Promise<AcquiredLock | null> {
    const token = randomUUID();
    const lockKey = `lock:${key}`;
    const deadline = Date.now() + waitTimeoutMs;

    while (Date.now() <= deadline) {
      const lockResult = await this.redisService
        .getClient()
        .set(lockKey, token, { PX: ttlMs, NX: true });

      if (lockResult === 'OK') {
        return { key: lockKey, token };
      }

      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    return null;
  }

  async release(lock: AcquiredLock): Promise<void> {
    await this.redisService
      .getClient()
      .eval(RELEASE_LOCK_SCRIPT, { keys: [lock.key], arguments: [lock.token] });
  }
}
