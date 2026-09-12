import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Comment, CommentSchema } from './schemas/comment.schema';
import { Incident, IncidentSchema } from '../incidents/schemas/incident.schema';
import { CommentsService } from './comments.service';
import { CommentsController } from './comments.controller';
import { AuditModule } from '../audit/audit.module';
import { IncidentsModule } from '../incidents/incidents.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Comment.name, schema: CommentSchema },
      { name: Incident.name, schema: IncidentSchema },
    ]),
    AuditModule,
    IncidentsModule,
  ],
  providers: [CommentsService],
  controllers: [CommentsController],
  exports: [CommentsService, MongooseModule],
})
export class CommentsModule {}
