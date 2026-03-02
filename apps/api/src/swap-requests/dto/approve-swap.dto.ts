import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class ApproveSwapDto {
  @IsBoolean()
  approve: boolean;

  @IsOptional()
  @IsString()
  reason?: string;
}
