import {
  ArrayMinSize,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsArray,
} from 'class-validator';
import { IncidentSeverity, IncidentStatus } from '../schemas/incident.schema';

export class CreateIncidentDto {
  @IsString()
  @IsNotEmpty({ message: 'Title is required' })
  title: string;

  @IsString()
  @IsNotEmpty({ message: 'Description is required' })
  description: string;

  @IsEnum(IncidentSeverity, { message: 'Invalid severity (P1, P2, P3, P4)' })
  @IsNotEmpty({ message: 'Severity is required' })
  severity: IncidentSeverity;

  @IsArray()
  @ArrayMinSize(1, { message: 'At least one service is required' })
  @IsString({ each: true })
  services: string[];

  @IsOptional()
  @IsString()
  teamId?: string;

  @IsOptional()
  @IsString()
  assigneeId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class UpdateIncidentDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(IncidentStatus)
  status?: IncidentStatus;

  @IsOptional()
  @IsEnum(IncidentSeverity)
  severity?: IncidentSeverity;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one service is required' })
  @IsString({ each: true })
  services?: string[];

  @IsOptional()
  @IsString()
  teamId?: string;

  @IsOptional()
  @IsString()
  assigneeId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class ChangeStatusDto {
  @IsEnum(IncidentStatus, { message: 'Invalid incident status' })
  @IsNotEmpty()
  status: IncidentStatus;
}

export class ChangeSeverityDto {
  @IsEnum(IncidentSeverity, { message: 'Invalid incident severity' })
  @IsNotEmpty()
  severity: IncidentSeverity;
}

export class AssignIncidentDto {
  @IsOptional()
  @IsString()
  assigneeId?: string;

  @IsOptional()
  @IsString()
  teamId?: string;
}

export class RelateIncidentDto {
  @IsString()
  @IsNotEmpty()
  incidentId: string;
}

export class MergeIncidentDto {
  @IsString()
  @IsNotEmpty()
  targetIncidentId: string;
}
