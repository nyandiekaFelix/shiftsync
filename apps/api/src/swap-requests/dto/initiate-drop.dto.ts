import { IsUUID } from 'class-validator';

export class InitiateDropDto {
  @IsUUID()
  shiftId: string;
}
