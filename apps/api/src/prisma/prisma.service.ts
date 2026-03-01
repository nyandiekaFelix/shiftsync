import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

function withSoftDeleteFilter<A extends { where?: Record<string, unknown> }>(args: A): A {
  return { ...args, where: { deletedAt: null, ...args.where } };
}

type SoftDeleteWhere = { id: string };
type SoftDeleteData = { deletedAt: Date };
type SoftDeleteArgs = { where: SoftDeleteWhere; data: SoftDeleteData };

function createExtendedClient() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const base = new PrismaClient({ adapter });

  return base.$extends({
    query: {
      $allModels: {
        async findMany({ args, query }) {
          return query(withSoftDeleteFilter(args));
        },
        async findFirst({ args, query }) {
          return query(withSoftDeleteFilter(args));
        },
        async count({ args, query }) {
          return query(withSoftDeleteFilter(args));
        },
      },
    },
    model: {
      $allModels: {
        async softDelete<M>(
          this: M,
          id: string,
        ): Promise<Prisma.Result<M, SoftDeleteArgs, 'update'>> {
          const ctx = Prisma.getExtensionContext(this) as unknown as {
            update(args: SoftDeleteArgs): Promise<Prisma.Result<M, SoftDeleteArgs, 'update'>>;
          };
          return ctx.update({ where: { id }, data: { deletedAt: new Date() } });
        },
      },
    },
  });
}

type ExtendedPrismaClient = ReturnType<typeof createExtendedClient>;

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  readonly db: ExtendedPrismaClient = createExtendedClient();

  async onModuleInit() {
    await this.db.$connect();
  }

  async onModuleDestroy() {
    await this.db.$disconnect();
  }
}
