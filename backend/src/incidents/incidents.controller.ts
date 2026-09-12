import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { IncidentsService } from './incidents.service';
import {
  CreateIncidentDto,
  UpdateIncidentDto,
  ChangeStatusDto,
  ChangeSeverityDto,
  AssignIncidentDto,
  RelateIncidentDto,
  MergeIncidentDto,
} from './dto/incident.dto';
import { QueryIncidentsDto } from './dto/query-incidents.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('incidents')
@UseGuards(JwtAuthGuard)
export class IncidentsController {
  constructor(private readonly incidentsService: IncidentsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() createIncidentDto: CreateIncidentDto,
    @CurrentUser() user: any,
  ) {
    return this.incidentsService.create(createIncidentDto, user);
  }

  @Get()
  async findAll(@Query() query: QueryIncidentsDto) {
    return this.incidentsService.findAll(query);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.incidentsService.findOne(id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateIncidentDto: UpdateIncidentDto,
    @CurrentUser() user: any,
  ) {
    return this.incidentsService.update(id, updateIncidentDto, user);
  }

  @Patch(':id/status')
  async changeStatus(
    @Param('id') id: string,
    @Body() changeStatusDto: ChangeStatusDto,
    @CurrentUser() user: any,
  ) {
    return this.incidentsService.changeStatus(id, changeStatusDto.status, user);
  }

  @Patch(':id/severity')
  async changeSeverity(
    @Param('id') id: string,
    @Body() changeSeverityDto: ChangeSeverityDto,
    @CurrentUser() user: any,
  ) {
    return this.incidentsService.changeSeverity(id, changeSeverityDto.severity, user);
  }

  @Patch(':id/assign')
  async assign(
    @Param('id') id: string,
    @Body() assignIncidentDto: AssignIncidentDto,
    @CurrentUser() user: any,
  ) {
    return this.incidentsService.assign(id, assignIncidentDto, user);
  }

  @Post(':id/resolve')
  @HttpCode(HttpStatus.OK)
  async resolve(@Param('id') id: string, @CurrentUser() user: any) {
    return this.incidentsService.resolve(id, user);
  }

  @Post(':id/relate')
  @HttpCode(HttpStatus.OK)
  async relate(
    @Param('id') id: string,
    @Body() dto: RelateIncidentDto,
    @CurrentUser() user: any,
  ) {
    return this.incidentsService.relate(id, dto, user);
  }

  @Delete(':id/relate/:relatedId')
  async unrelate(
    @Param('id') id: string,
    @Param('relatedId') relatedId: string,
    @CurrentUser() user: any,
  ) {
    return this.incidentsService.unrelate(id, relatedId, user);
  }

  @Post(':id/merge')
  @HttpCode(HttpStatus.OK)
  async merge(
    @Param('id') id: string,
    @Body() dto: MergeIncidentDto,
    @CurrentUser() user: any,
  ) {
    return this.incidentsService.merge(id, dto, user);
  }
}

