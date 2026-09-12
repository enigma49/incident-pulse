import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { TasksService } from './tasks.service';
import { CreateTaskDto, UpdateTaskDto } from './dto/task.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller()
@UseGuards(JwtAuthGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post('incidents/:incidentId/tasks')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Param('incidentId') incidentId: string,
    @Body() createTaskDto: CreateTaskDto,
    @CurrentUser() user: any,
  ) {
    return this.tasksService.create(incidentId, createTaskDto, user);
  }

  @Get('incidents/:incidentId/tasks')
  async findByIncident(@Param('incidentId') incidentId: string) {
    return this.tasksService.findByIncident(incidentId);
  }

  @Patch('tasks/:id')
  async update(
    @Param('id') id: string,
    @Body() updateTaskDto: UpdateTaskDto,
    @CurrentUser() user: any,
  ) {
    return this.tasksService.update(id, updateTaskDto, user);
  }

  @Delete('tasks/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string, @CurrentUser() user: any) {
    return this.tasksService.delete(id, user);
  }
}

