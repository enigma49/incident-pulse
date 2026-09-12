import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Task, TaskDocument, TaskStatus } from './schemas/task.schema';
import { Incident, IncidentDocument } from '../incidents/schemas/incident.schema';
import { AuditService } from '../audit/audit.service';
import { ActorType } from '../audit/schemas/audit-event.schema';
import { CreateTaskDto, UpdateTaskDto } from './dto/task.dto';
import { RedisService } from '../common/redis/redis.service';
import { EventsGateway } from '../events/events.gateway';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    @InjectModel(Task.name) private taskModel: Model<TaskDocument>,
    @InjectModel(Incident.name) private incidentModel: Model<IncidentDocument>,
    private auditService: AuditService,
    private redisService: RedisService,
    private eventsGateway: EventsGateway,
  ) {}

  async create(
    incidentId: string,
    dto: CreateTaskDto,
    currentUser: any,
  ): Promise<TaskDocument> {
    const incident = await this.incidentModel.findById(incidentId);
    if (!incident) {
      throw new NotFoundException(`Incident ${incidentId} not found`);
    }

    const task = new this.taskModel({
      incidentId: new Types.ObjectId(incidentId),
      title: dto.title,
      description: dto.description || '',
      status: dto.status || TaskStatus.PENDING,
      assigneeId: dto.assigneeId ? new Types.ObjectId(dto.assigneeId) : null,
    });

    const saved = await task.save();

    await this.auditService.logEvent({
      incidentId: incident._id,
      actorType: ActorType.USER,
      actorId: currentUser.userId || currentUser.email,
      action: 'TASK_CREATED',
      entity: 'Task',
      entityId: saved._id.toString(),
      metadata: { title: saved.title, status: saved.status },
    });

    // Invalidate incident cache
    await this.redisService.invalidateIncident(incidentId);

    const populated = await saved.populate('assigneeId', 'name email role');

    // Emit realtime event
    this.eventsGateway.emitTaskCreated(incidentId, populated);

    return populated;
  }

  async findByIncident(incidentId: string): Promise<TaskDocument[]> {
    return this.taskModel
      .find({ incidentId: new Types.ObjectId(incidentId) })
      .populate('assigneeId', 'name email role')
      .sort({ createdAt: 1 })
      .exec();
  }

  async update(
    id: string,
    dto: UpdateTaskDto,
    currentUser: any,
  ): Promise<TaskDocument> {
    const existing = await this.taskModel.findById(id);
    if (!existing) {
      throw new NotFoundException(`Task ${id} not found`);
    }

    if (dto.title !== undefined) existing.title = dto.title;
    if (dto.description !== undefined) existing.description = dto.description;
    if (dto.status !== undefined) existing.status = dto.status;
    if (dto.assigneeId !== undefined) {
      existing.assigneeId = dto.assigneeId ? new Types.ObjectId(dto.assigneeId) : null;
    }

    const saved = await existing.save();

    await this.auditService.logEvent({
      incidentId: saved.incidentId,
      actorType: ActorType.USER,
      actorId: currentUser.userId || currentUser.email,
      action: 'TASK_UPDATED',
      entity: 'Task',
      entityId: saved._id.toString(),
      metadata: { status: saved.status, title: saved.title },
    });

    // Invalidate incident cache
    await this.redisService.invalidateIncident(saved.incidentId.toString());

    const populated = await saved.populate('assigneeId', 'name email role');

    // Emit realtime event
    this.eventsGateway.emitTaskUpdated(saved.incidentId.toString(), populated);

    return populated;
  }

  async delete(id: string, currentUser: any): Promise<void> {
    const existing = await this.taskModel.findById(id);
    if (!existing) {
      throw new NotFoundException(`Task ${id} not found`);
    }

    const incidentId = existing.incidentId.toString();
    await this.taskModel.findByIdAndDelete(id);

    await this.auditService.logEvent({
      incidentId: existing.incidentId,
      actorType: ActorType.USER,
      actorId: currentUser.userId || currentUser.email,
      action: 'TASK_DELETED',
      entity: 'Task',
      entityId: id,
      metadata: { title: existing.title },
    });

    // Invalidate incident cache
    await this.redisService.invalidateIncident(incidentId);

    // Emit realtime event
    this.eventsGateway.emitTaskDeleted(incidentId, id);
  }
}
