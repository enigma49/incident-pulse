import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AIService } from './ai.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';
import { ApproveActionDto, RejectActionDto } from './dto/action-review.dto';

@Controller('incidents')
@UseGuards(JwtAuthGuard, RolesGuard)
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

  /**
   * Phase 7: Approve & Execute latest pending AI proposed action
   */
  @Post(':id/investigation/actions/approve')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  async approveLatestAction(
    @Param('id') incidentId: string,
    @Body() dto: ApproveActionDto,
    @Request() req: any,
  ) {
    return this.aiService.approveAction(incidentId, req.user, undefined, dto);
  }

  /**
   * Phase 7: Approve & Execute specific AI proposed action by investigationId
   */
  @Post(':id/investigations/:investigationId/actions/approve')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  async approveSpecificAction(
    @Param('id') incidentId: string,
    @Param('investigationId') investigationId: string,
    @Body() dto: ApproveActionDto,
    @Request() req: any,
  ) {
    return this.aiService.approveAction(incidentId, req.user, investigationId, dto);
  }

  /**
   * Phase 7: Reject latest pending AI proposed action
   */
  @Post(':id/investigation/actions/reject')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  async rejectLatestAction(
    @Param('id') incidentId: string,
    @Body() dto: RejectActionDto,
    @Request() req: any,
  ) {
    return this.aiService.rejectAction(incidentId, req.user, dto, undefined);
  }

  /**
   * Phase 7: Reject specific AI proposed action by investigationId
   */
  @Post(':id/investigations/:investigationId/actions/reject')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  async rejectSpecificAction(
    @Param('id') incidentId: string,
    @Param('investigationId') investigationId: string,
    @Body() dto: RejectActionDto,
    @Request() req: any,
  ) {
    return this.aiService.rejectAction(incidentId, req.user, dto, investigationId);
  }
}
