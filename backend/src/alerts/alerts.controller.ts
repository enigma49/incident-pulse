import { Controller, Get, Query, Param, UseGuards } from '@nestjs/common';
import { AlertsService } from './alerts.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Controller('alerts')
@UseGuards(JwtAuthGuard)
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get()
  async findAll(
    @Query('service') service?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: number,
  ) {
    return this.alertsService.findAll({ service, status, limit });
  }

  @Get('incident/:incidentId')
  async findByIncident(@Param('incidentId') incidentId: string) {
    return this.alertsService.findByIncident(incidentId);
  }
}

