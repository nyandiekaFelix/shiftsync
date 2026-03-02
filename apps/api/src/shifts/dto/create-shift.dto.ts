import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';
import { Skill, ShiftStatus } from '@shiftsync/shared-types';

export class CreateShiftDto {
  @IsUUID()
  @IsNotEmpty()
  locationId: string;

  @IsDateString()
  @IsNotEmpty()
  startTime: string;

  @IsDateString()
  @IsNotEmpty()
  endTime: string;

  @IsEnum(Skill)
  @IsNotEmpty()
  requiredSkill: Skill;

  @IsInt()
  @Min(1)
  @IsNotEmpty()
  requiredHeadcount: number;

  @IsEnum(ShiftStatus)
  @IsOptional()
  status?: ShiftStatus;
}
