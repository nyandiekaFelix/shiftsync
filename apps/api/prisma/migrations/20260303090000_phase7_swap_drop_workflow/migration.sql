CREATE TYPE "SwapRequestType" AS ENUM ('SWAP', 'DROP');

ALTER TYPE "SwapStatus" RENAME TO "SwapStatus_old";

CREATE TYPE "SwapStatus" AS ENUM (
  'PENDING',
  'ACCEPTED_BY_PEER',
  'APPROVED',
  'CANCELLED',
  'EXPIRED'
);

ALTER TABLE "swap_requests"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "receiverId" DROP NOT NULL;

ALTER TABLE "swap_requests"
  ALTER COLUMN "status" TYPE "SwapStatus"
  USING (
    CASE
      WHEN "status"::text = 'ACCEPTED' THEN 'ACCEPTED_BY_PEER'
      WHEN "status"::text = 'REJECTED' THEN 'CANCELLED'
      ELSE "status"::text
    END
  )::"SwapStatus";

ALTER TABLE "swap_requests"
  ADD COLUMN "type" "SwapRequestType" NOT NULL DEFAULT 'SWAP',
  ADD COLUMN "expiresAt" TIMESTAMP(3),
  ADD COLUMN "acceptedAt" TIMESTAMP(3),
  ADD COLUMN "resolvedAt" TIMESTAMP(3),
  ADD COLUMN "resolutionNote" TEXT,
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "swap_requests"
  ALTER COLUMN "status" SET DEFAULT 'PENDING';

CREATE INDEX "swap_requests_requesterId_status_idx" ON "swap_requests"("requesterId", "status");
CREATE INDEX "swap_requests_receiverId_status_idx" ON "swap_requests"("receiverId", "status");
CREATE INDEX "swap_requests_shiftId_type_status_idx" ON "swap_requests"("shiftId", "type", "status");

DROP TYPE "SwapStatus_old";
