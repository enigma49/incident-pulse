import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Incident, IncidentSchema } from './schemas/incident.schema';
import { IncidentsService } from './incidents.service';
import { IncidentsController } from './incidents.controller';
import { Alert, AlertSchema } from '../alerts/schemas/alert.schema';
import { Comment, CommentSchema } from '../comments/schemas/comment.schema';
import { Task, TaskSchema } from '../tasks/schemas/task.schema';
import {
  AIInvestigation,
  AIInvestigationSchema,
} from '../ai/schemas/ai-investigation.schema';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Incident.name, schema: IncidentSchema },
      { name: Alert.name, schema: AlertSchema },
      { name: Comment.name, schema: CommentSchema },
      { name: Task.name, schema: TaskSchema },
      { name: AIInvestigation.name, schema: AIInvestigationSchema },
    ]),
    AuditModule,
  ],
  providers: [IncidentsService],
  controllers: [IncidentsController],
  exports: [IncidentsService, MongooseModule],
})
export class IncidentsModule {}
