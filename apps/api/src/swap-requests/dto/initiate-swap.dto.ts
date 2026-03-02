import { IsUUID } from 'class-validator';

export class InitiateSwapDto {
  @IsUUID()
  shiftId: string;

  @IsUUID()
  receiverId: string;
}
