import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '../prisma/prisma.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { ShiftsModule } from '../shifts/shifts.module';
import { SWAP_REQUESTS_QUEUE } from './swap-requests.constants';
import { SwapRequestsController } from './swap-requests.controller';
import { SwapRequestsProcessor } from './swap-requests.processor';
import { SwapRequestsService } from './swap-requests.service';

@Module({
  imports: [
    PrismaModule,
    RealtimeModule,
    ShiftsModule,
    BullModule.registerQueue({
      name: SWAP_REQUESTS_QUEUE,
    }),
  ],
  controllers: [SwapRequestsController],
  providers: [SwapRequestsService, SwapRequestsProcessor],
  exports: [SwapRequestsService],
})
export class SwapRequestsModule {}
