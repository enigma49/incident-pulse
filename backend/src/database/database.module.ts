import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { TeamsModule } from '../teams/teams.module';
import { IncidentsModule } from '../incidents/incidents.module';
import { AlertsModule } from '../alerts/alerts.module';
import { CommentsModule } from '../comments/comments.module';
import { TasksModule } from '../tasks/tasks.module';
import { AuditModule } from '../audit/audit.module';
import { AIModule } from '../ai/ai.module';
import { CountersModule } from '../common/counters/counters.module';
import { SeedService } from './seed.service';

@Module({
  imports: [
    UsersModule,
    TeamsModule,
    IncidentsModule,
    AlertsModule,
    CommentsModule,
    TasksModule,
    AuditModule,
    AIModule,
    CountersModule,
  ],
  providers: [SeedService],
  exports: [SeedService],
})
export class DatabaseModule {}

