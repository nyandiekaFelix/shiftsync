import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';

class ManagerOverrideDto {
  @IsString()
  @IsNotEmpty()
  reason: string;
}

export class AssignStaffDto {
  @IsUUID()
  @IsNotEmpty()
  userId: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ManagerOverrideDto)
  managerOverride?: ManagerOverrideDto;
}
