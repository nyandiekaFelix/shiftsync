import { Module } from '@nestjs/common';
import { ShiftsService } from './shifts.service';
import { AssignmentsService } from './assignments.service';
import { ShiftsController } from './shifts.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { ConstraintEngineService } from './constraints/constraint-engine.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [ShiftsController],
  providers: [ShiftsService, AssignmentsService, ConstraintEngineService],
  exports: [ShiftsService, AssignmentsService],
})
export class ShiftsModule {}
