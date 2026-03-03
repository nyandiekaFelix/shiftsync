import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { AvailabilityType } from '@prisma/client';

export class UpsertAvailabilityDto {
  @IsEnum(AvailabilityType)
  type: AvailabilityType;

  @ValidateIf(
    (dto: UpsertAvailabilityDto) => dto.type === AvailabilityType.RECURRING,
  )
  @IsInt()
  @Min(1)
  @Max(7)
  dayOfWeek?: number;

  @ValidateIf(
    (dto: UpsertAvailabilityDto) => dto.type === AvailabilityType.EXCEPTION,
  )
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  startTime?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  endTime?: string;
}
