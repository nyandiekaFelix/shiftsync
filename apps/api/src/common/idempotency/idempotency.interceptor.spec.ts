import {
  BadRequestException,
  ConflictException,
  ExecutionContext,
} from '@nestjs/common';
import { CallHandler } from '@nestjs/common';
import { lastValueFrom, of, throwError } from 'rxjs';
import { createHash } from 'crypto';
import { IdempotencyInterceptor } from './idempotency.interceptor';

describe('IdempotencyInterceptor', () => {
  const get = jest.fn();
  const set = jest.fn();
  const del = jest.fn();

  const redisService = {
    getClient: () => ({
      get,
      set,
      del,
    }),
  };

  const interceptor = new IdempotencyInterceptor(redisService as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const createContext = (request: Record<string, unknown>) => {
    const response = {
      statusCode: 201,
      status: jest.fn(),
    };

    const context = {
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as ExecutionContext;

    return { context, response };
  };

  it('requires Idempotency-Key header', () => {
    const { context } = createContext({
      method: 'POST',
      originalUrl: '/shifts',
      headers: {},
      body: { locationId: 'loc-1' },
      user: { id: 'user-1' },
    });

    expect(() =>
      interceptor.intercept(context, { handle: () => of({}) }),
    ).toThrow(BadRequestException);
  });

  it('stores response and returns cached payload on duplicate', async () => {
    const request = {
      method: 'POST',
      originalUrl: '/shifts',
      headers: { 'idempotency-key': 'idem-1' },
      body: { locationId: 'loc-1', requiredHeadcount: 1 },
      user: { id: 'user-1' },
    };

    const { context } = createContext(request);
    const handler: CallHandler = {
      handle: () => of({ id: 'shift-1' }),
    };

    get.mockResolvedValueOnce(null);
    set.mockResolvedValueOnce('OK');
    set.mockResolvedValueOnce('OK');

    const firstResult = await lastValueFrom(
      interceptor.intercept(context, handler),
    );

    expect(firstResult).toEqual({ id: 'shift-1' });
    expect(set).toHaveBeenCalledTimes(2);

    const fingerprint = createHash('sha256')
      .update(`POST|/shifts|${JSON.stringify(request.body)}`)
      .digest('hex');
    const cached = {
      statusCode: 201,
      body: { id: 'shift-1' },
      fingerprint,
    };

    const { context: duplicateContext, response } = createContext(request);
    get.mockResolvedValueOnce(JSON.stringify(cached));

    const duplicateResult = await lastValueFrom(
      interceptor.intercept(duplicateContext, {
        handle: () => throwError(() => new Error('should not run')),
      }),
    );

    expect(duplicateResult).toEqual({ id: 'shift-1' });
    expect(response.status).toHaveBeenCalledWith(201);
  });

  it('rejects when the same key is still pending', async () => {
    const request = {
      method: 'POST',
      originalUrl: '/shifts/abc/assignments',
      headers: { 'idempotency-key': 'idem-2' },
      body: { userId: 'staff-1' },
      user: { id: 'manager-1' },
    };

    const { context } = createContext(request);
    get.mockResolvedValueOnce(
      JSON.stringify({ state: 'pending', fingerprint: 'fingerprint-value' }),
    );

    await expect(
      lastValueFrom(interceptor.intercept(context, { handle: () => of({}) })),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('clears pending key when downstream handler throws', async () => {
    const request = {
      method: 'PATCH',
      originalUrl: '/shifts/shift-1',
      headers: { 'idempotency-key': 'idem-3' },
      body: { requiredHeadcount: 4 },
      user: { id: 'manager-1' },
    };

    const { context } = createContext(request);
    get.mockResolvedValueOnce(null);
    set.mockResolvedValueOnce('OK');
    del.mockResolvedValueOnce(1);

    await expect(
      lastValueFrom(
        interceptor.intercept(context, {
          handle: () => throwError(() => new Error('boom')),
        }),
      ),
    ).rejects.toThrow('boom');

    expect(del).toHaveBeenCalledTimes(1);
  });
});
