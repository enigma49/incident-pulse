import {
  Controller,
  Post,
  Get,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AIService } from './ai.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Controller('incidents')
@UseGuards(JwtAuthGuard)
export class AIController {
  constructor(private readonly aiService: AIService) {}

  @Post(':id/investigate')
  async startInvestigation(@Param('id') incidentId: string, @Request() req: any) {
    return this.aiService.startInvestigation(incidentId, req.user);
  }

  @Get(':id/investigation')
  async getLatestInvestigation(@Param('id') incidentId: string) {
    return this.aiService.getLatestInvestigation(incidentId);
  }

  @Get(':id/investigations')
  async getInvestigationHistory(@Param('id') incidentId: string) {
    return this.aiService.getInvestigationHistory(incidentId);
  }
}

