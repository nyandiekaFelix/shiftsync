import {
  BadRequestException,
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, catchError, from, mergeMap, of, throwError } from 'rxjs';
import { createHash } from 'crypto';
import { RedisService } from '../redis/redis.service';

interface CachedResponse {
  statusCode: number;
  body: unknown;
  fingerprint: string;
}

interface PendingState {
  state: 'pending';
  fingerprint: string;
}

const CACHE_TTL_SECONDS = 60 * 10;
const PENDING_TTL_SECONDS = 30;

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly redisService: RedisService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<{
      method: string;
      originalUrl: string;
      headers: Record<string, string | undefined>;
      body?: unknown;
      user?: { id?: string };
    }>();
    const response = httpContext.getResponse<{
      statusCode: number;
      status: (code: number) => unknown;
    }>();

    const idempotencyKey = request.headers['idempotency-key'];
    if (!idempotencyKey || !idempotencyKey.trim()) {
      throw new BadRequestException('Idempotency-Key header is required');
    }

    const fingerprint = this.buildFingerprint(request);
    const redisKey = `idempotency:${request.user?.id ?? 'anonymous'}:${request.method}:${request.originalUrl}:${idempotencyKey.trim()}`;

    return from(this.redisService.getClient().get(redisKey)).pipe(
      mergeMap((existingValue) => {
        if (existingValue) {
          const parsed = JSON.parse(existingValue) as
            | PendingState
            | CachedResponse;
          if (parsed.fingerprint !== fingerprint) {
            throw new ConflictException(
              'Idempotency-Key has already been used with a different request payload',
            );
          }

          if ('state' in parsed && parsed.state === 'pending') {
            throw new ConflictException(
              'Request with this Idempotency-Key is still processing',
            );
          }

          const cached = parsed as CachedResponse;
          response.status(cached.statusCode);
          return of(cached.body);
        }

        return from(
          this.redisService.getClient().set(
            redisKey,
            JSON.stringify({
              state: 'pending',
              fingerprint,
            } satisfies PendingState),
            {
              NX: true,
              EX: PENDING_TTL_SECONDS,
            },
          ),
        ).pipe(
          mergeMap((setResult) => {
            if (setResult !== 'OK') {
              throw new ConflictException(
                'Request with this Idempotency-Key is still processing',
              );
            }

            return next.handle().pipe(
              mergeMap((body) =>
                from(
                  this.redisService.getClient().set(
                    redisKey,
                    JSON.stringify({
                      statusCode: response.statusCode,
                      body,
                      fingerprint,
                    } satisfies CachedResponse),
                    {
                      EX: CACHE_TTL_SECONDS,
                    },
                  ),
                ).pipe(mergeMap(() => of(body))),
              ),
              catchError((error: unknown) =>
                from(this.redisService.getClient().del(redisKey)).pipe(
                  mergeMap(() =>
                    throwError(() =>
                      error instanceof Error
                        ? error
                        : new Error('Unknown idempotency pipeline error'),
                    ),
                  ),
                ),
              ),
            );
          }),
        );
      }),
    );
  }

  private buildFingerprint(request: {
    method: string;
    originalUrl: string;
    body?: unknown;
  }): string {
    const normalizedBody = request.body ? JSON.stringify(request.body) : '';
    const payload = `${request.method}|${request.originalUrl}|${normalizedBody}`;
    return createHash('sha256').update(payload).digest('hex');
  }
}
