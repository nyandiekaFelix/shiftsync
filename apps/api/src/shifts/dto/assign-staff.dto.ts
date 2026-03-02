import { IsNotEmpty, IsUUID } from 'class-validator';

export class AssignStaffDto {
  @IsUUID()
  @IsNotEmpty()
  userId: string;
}
