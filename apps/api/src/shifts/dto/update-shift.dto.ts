import { IsDateString, IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { Skill, ShiftStatus } from '@shiftsync/shared-types';

export class UpdateShiftDto {
  @IsDateString()
  @IsOptional()
  startTime?: string;

  @IsDateString()
  @IsOptional()
  endTime?: string;

  @IsEnum(Skill)
  @IsOptional()
  requiredSkill?: Skill;

  @IsInt()
  @Min(1)
  @IsOptional()
  requiredHeadcount?: number;

  @IsEnum(ShiftStatus)
  @IsOptional()
  status?: ShiftStatus;
}
