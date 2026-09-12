import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { TeamsService } from './teams.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { UpdateTeamMembersDto } from './dto/update-team-members.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';

@Controller('teams')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Get()
  async getAllTeams(@Query('includeArchived') includeArchived?: string) {
    return this.teamsService.findAll(includeArchived === 'true');
  }

  @Get('workload')
  async getTeamWorkload(@Query('includeArchived') includeArchived?: string) {
    return this.teamsService.getWorkload(includeArchived === 'true');
  }

  @Get(':id')
  async getTeamDetails(@Param('id') id: string) {
    return this.teamsService.getTeamDetails(id);
  }

  @Get(':id/members')
  async getTeamMembers(@Param('id') id: string) {
    return this.teamsService.getMembers(id);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async createTeam(@Body() body: CreateTeamDto) {
    return this.teamsService.create(body);
  }

  @Patch(':id/members')
  @Roles(UserRole.ADMIN)
  async updateTeamMembers(@Param('id') id: string, @Body() body: UpdateTeamMembersDto) {
    return this.teamsService.updateMembers(id, body);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  async updateTeam(@Param('id') id: string, @Body() body: UpdateTeamDto) {
    return this.teamsService.update(id, body);
  }
}
