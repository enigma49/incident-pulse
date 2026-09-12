import { IsArray, IsOptional, IsString } from 'class-validator';

export class UpdateTeamMembersDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  addUserIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  removeUserIds?: string[];
}
