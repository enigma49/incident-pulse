import { IsArray, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateTeamDto {
  @IsString()
  @IsNotEmpty({ message: 'Team name is required' })
  @MaxLength(100, { message: 'Team name must be at most 100 characters' })
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Description must be at most 500 characters' })
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  serviceResponsibility?: string[];

  @IsOptional()
  @IsString()
  leadUserId?: string;
}
