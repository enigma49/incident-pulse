import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Incident, IncidentSchema } from '../incidents/schemas/incident.schema';
import { Team, TeamSchema } from '../teams/schemas/team.schema';
import {
  AIInvestigation,
  AIInvestigationSchema,
} from '../ai/schemas/ai-investigation.schema';
import { AuditModule } from '../audit/audit.module';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Incident.name, schema: IncidentSchema },
      { name: Team.name, schema: TeamSchema },
      { name: AIInvestigation.name, schema: AIInvestigationSchema },
    ]),
    AuditModule,
  ],
  providers: [DashboardService],
  controllers: [DashboardController],
  exports: [DashboardService],
})
export class DashboardModule {}

