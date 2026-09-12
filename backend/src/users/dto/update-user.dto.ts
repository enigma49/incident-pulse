import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { UserRole } from '../schemas/user.schema';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Name must be at most 100 characters' })
  name?: string;

  @IsOptional()
  @IsEnum(UserRole, { message: 'Role must be ADMIN or OPERATOR' })
  role?: UserRole;

  @IsOptional()
  @IsString()
  teamId?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
