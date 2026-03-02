import { Module } from '@nestjs/common';
import { ShiftsService } from './shifts.service';
import { AssignmentsService } from './assignments.service';
import { ShiftsController } from './shifts.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [ShiftsController],
  providers: [ShiftsService, AssignmentsService],
  exports: [ShiftsService, AssignmentsService],
})
export class ShiftsModule {}
