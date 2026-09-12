import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Comment, CommentDocument } from './schemas/comment.schema';
import { Incident, IncidentDocument } from '../incidents/schemas/incident.schema';
import { AuditService } from '../audit/audit.service';
import { ActorType } from '../audit/schemas/audit-event.schema';
import { CreateCommentDto } from './dto/comment.dto';
import { RedisService } from '../common/redis/redis.service';
import { EventsGateway } from '../events/events.gateway';

@Injectable()
export class CommentsService {
  private readonly logger = new Logger(CommentsService.name);

  constructor(
    @InjectModel(Comment.name) private commentModel: Model<CommentDocument>,
    @InjectModel(Incident.name) private incidentModel: Model<IncidentDocument>,
    private auditService: AuditService,
    private redisService: RedisService,
    private eventsGateway: EventsGateway,
  ) {}

  async create(
    incidentId: string,
    dto: CreateCommentDto,
    currentUser: any,
  ): Promise<CommentDocument> {
    const incident = await this.incidentModel.findById(incidentId);
    if (!incident) {
      throw new NotFoundException(`Incident ${incidentId} not found`);
    }

    const comment = new this.commentModel({
      incidentId: new Types.ObjectId(incidentId),
      userId: new Types.ObjectId(currentUser.userId),
      content: dto.content,
    });

    const saved = await comment.save();

    await this.auditService.logEvent({
      incidentId: incident._id,
      actorType: ActorType.USER,
      actorId: currentUser.userId || currentUser.email,
      action: 'COMMENT_CREATED',
      entity: 'Comment',
      entityId: saved._id.toString(),
      metadata: { commentSnippet: dto.content.slice(0, 100) },
    });

    // Invalidate incident detail cache
    await this.redisService.invalidateIncident(incidentId);

    const populated = await saved.populate('userId', 'name email role');

    // Emit realtime event
    this.eventsGateway.emitCommentCreated(incidentId, populated);

    return populated;
  }

  async findByIncident(incidentId: string): Promise<CommentDocument[]> {
    return this.commentModel
      .find({ incidentId: new Types.ObjectId(incidentId) })
      .populate('userId', 'name email role')
      .sort({ createdAt: 1 })
      .exec();
  }
}

