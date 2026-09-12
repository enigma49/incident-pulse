import { IsOptional, IsString, IsBoolean } from 'class-validator';

export class ApproveActionDto {
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

export class RejectActionDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

