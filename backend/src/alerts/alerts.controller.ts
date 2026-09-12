import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Query,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AlertsService } from './alerts.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CreateAlertDto, QueryAlertsDto, AssociateAlertDto } from './dto/alert.dto';

@Controller('alerts')
@UseGuards(JwtAuthGuard)
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Post()
  async ingest(@Body() dto: CreateAlertDto, @Request() req: any) {
    return this.alertsService.ingest(dto, req.user);
  }

  @Get()
  async findAll(@Query() query: QueryAlertsDto) {
    return this.alertsService.findAll(query);
  }

  @Get('incident/:incidentId')
  async findByIncident(@Param('incidentId') incidentId: string) {
    return this.alertsService.findByIncident(incidentId);
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.alertsService.findById(id);
  }

  @Patch(':id/associate')
  async associate(
    @Param('id') id: string,
    @Body() dto: AssociateAlertDto,
    @Request() req: any,
  ) {
    return this.alertsService.associate(id, dto, req.user);
  }

  @Patch(':id/unassociate')
  async unassociate(@Param('id') id: string, @Request() req: any) {
    return this.alertsService.unassociate(id, req.user);
  }
}
