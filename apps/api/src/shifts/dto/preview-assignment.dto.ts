import { IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class PreviewAssignmentDto {
  @IsUUID()
  userId: string;

  @IsOptional()
  @IsString()
  managerOverrideReason?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  hourlyRate?: number;
}
