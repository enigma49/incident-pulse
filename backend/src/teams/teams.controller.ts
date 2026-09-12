import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { TeamsService } from './teams.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';

@Controller('teams')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Get()
  async getAllTeams() {
    return this.teamsService.findAll();
  }

  @Get('workload')
  async getTeamWorkload() {
    return this.teamsService.getWorkload();
  }

  @Post()
  @Roles(UserRole.ADMIN)
  async createTeam(@Body() body: { name: string; description?: string; serviceResponsibility?: string[] }) {
    return this.teamsService.create(body);
  }
}
