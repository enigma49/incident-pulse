import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AIInvestigation, AIInvestigationSchema } from './schemas/ai-investigation.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AIInvestigation.name, schema: AIInvestigationSchema },
    ]),
  ],
  exports: [MongooseModule],
})
export class AIModule {}

