import { Module } from '@nestjs/common';
import { ShiftsService } from './shifts.service';
import { AssignmentsService } from './assignments.service';
import { ShiftsController } from './shifts.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { ConstraintEngineService } from './constraints/constraint-engine.service';
import { RealtimeModule } from '../realtime/realtime.module';
import { IdempotencyInterceptor } from '../common/idempotency/idempotency.interceptor';

@Module({
  imports: [PrismaModule, AuthModule, RealtimeModule],
  controllers: [ShiftsController],
  providers: [
    ShiftsService,
    AssignmentsService,
    ConstraintEngineService,
    IdempotencyInterceptor,
  ],
  exports: [ShiftsService, AssignmentsService],
})
export class ShiftsModule {}
