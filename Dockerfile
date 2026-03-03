# ---- Builder Stage ----
FROM node:20-alpine AS builder

WORKDIR /app

# Enable corepack (pnpm)
RUN corepack enable

# Copy root files for workspace install
COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
COPY packages ./packages
COPY apps/api ./apps/api

# Install deps
RUN pnpm install --frozen-lockfile

# Build shared workspace package required at runtime by the API
WORKDIR /app/packages/shared-types
RUN pnpm run build

# Generate Prisma Client
WORKDIR /app/apps/api
RUN pnpm run prisma:generate

# Build NestJS
RUN pnpm run build


# ---- Runtime Stage ----
FROM node:20-alpine

WORKDIR /app/apps/api

RUN corepack enable

COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/apps/api/node_modules ./node_modules
COPY --from=builder /app/packages /app/packages
COPY --from=builder /app/apps/api/package.json ./package.json
COPY --from=builder /app/apps/api/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/prisma ./prisma

ENV NODE_ENV=production

CMD ["sh", "-c", "pnpm exec prisma migrate deploy && node dist/src/main.js"]
