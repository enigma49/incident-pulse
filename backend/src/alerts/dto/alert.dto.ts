import { IsString, IsNotEmpty, IsOptional, IsEnum, IsObject } from 'class-validator';
import { AlertStatus } from '../schemas/alert.schema';

export class CreateAlertDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsNotEmpty()
  severity: string;

  @IsString()
  @IsNotEmpty()
  service: string;

  @IsString()
  @IsOptional()
  source?: string;

  @IsObject()
  @IsOptional()
  rawPayload?: Record<string, any>;

  @IsOptional()
  timestamp?: string | Date;
}

export class AssociateAlertDto {
  @IsString()
  @IsNotEmpty()
  incidentId: string;
}

export class QueryAlertsDto {
  @IsOptional()
  page?: number;

  @IsOptional()
  limit?: number;

  @IsOptional()
  service?: string;

  @IsOptional()
  severity?: string;

  @IsOptional()
  @IsEnum(AlertStatus)
  status?: AlertStatus;

  @IsOptional()
  unassigned?: boolean | string;

  @IsOptional()
  search?: string;
}

