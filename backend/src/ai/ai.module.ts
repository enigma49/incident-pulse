import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AIInvestigation, AIInvestigationSchema } from './schemas/ai-investigation.schema';
import { Incident, IncidentSchema } from '../incidents/schemas/incident.schema';
import { Alert, AlertSchema } from '../alerts/schemas/alert.schema';
import { Task, TaskSchema } from '../tasks/schemas/task.schema';
import { Comment, CommentSchema } from '../comments/schemas/comment.schema';
import { AuditModule } from '../audit/audit.module';
import { RedisModule } from '../common/redis/redis.module';
import { AIService } from './ai.service';
import { AIController } from './ai.controller';
import { ContextGathererService } from './tools/context-gatherer.service';
import { MockAIProvider } from './providers/mock-ai.provider';
import { OpenRouterProvider } from './providers/openrouter.provider';
import { AIProviderFactory } from './providers/ai-provider.factory';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AIInvestigation.name, schema: AIInvestigationSchema },
      { name: Incident.name, schema: IncidentSchema },
      { name: Alert.name, schema: AlertSchema },
      { name: Task.name, schema: TaskSchema },
      { name: Comment.name, schema: CommentSchema },
    ]),
    AuditModule,
    RedisModule,
  ],
  providers: [
    AIService,
    ContextGathererService,
    MockAIProvider,
    OpenRouterProvider,
    AIProviderFactory,
  ],
  controllers: [AIController],
  exports: [AIService, MongooseModule],
})
export class AIModule {}
