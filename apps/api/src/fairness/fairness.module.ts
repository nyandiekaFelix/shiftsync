import { Module } from '@nestjs/common';
import { FairnessController } from './fairness.controller';
import { FairnessService } from './fairness.service';

@Module({
  controllers: [FairnessController],
  providers: [FairnessService],
})
export class FairnessModule {}
