import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Incident, IncidentDocument } from '../../incidents/schemas/incident.schema';
import { Alert, AlertDocument } from '../../alerts/schemas/alert.schema';
import { Task, TaskDocument } from '../../tasks/schemas/task.schema';
import { Comment, CommentDocument } from '../../comments/schemas/comment.schema';
import { AuditService } from '../../audit/audit.service';

export interface GroundedContext {
  incident: {
    id: string;
    title: string;
    description: string;
    severity: string;
    status: string;
    service: string;
    createdAt: Date;
    updatedAt: Date;
    version: string;
  };
  assignee: { id: string; name: string; email: string } | null;
  team: { id: string; name: string; serviceResponsibility: string[] } | null;
  alerts: Array<{
    id: string;
    title: string;
    severity: string;
    service: string;
    source: string;
    timestamp: Date;
    count: number;
    description: string;
  }>;
  recentActivity: Array<{
    action: string;
    actor: string;
    timestamp: Date;
    details?: string;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    status: string;
  }>;
  similarIncidents: Array<{
    id: string;
    title: string;
    severity: string;
    status: string;
    resolvedAt?: Date | null;
  }>;
  validEntityIds: Set<string>;
}

@Injectable()
export class ContextGathererService {
  private readonly logger = new Logger(ContextGathererService.name);

  constructor(
    @InjectModel(Incident.name) private incidentModel: Model<IncidentDocument>,
    @InjectModel(Alert.name) private alertModel: Model<AlertDocument>,
    @InjectModel(Task.name) private taskModel: Model<TaskDocument>,
    @InjectModel(Comment.name) private commentModel: Model<CommentDocument>,
    private auditService: AuditService,
  ) {}

  /**
   * Tool: get_incident
   */
  async getIncident(incidentId: string): Promise<IncidentDocument> {
    const inc = await this.incidentModel
      .findById(incidentId)
      .populate('assigneeId', 'name email')
      .populate('teamId', 'name serviceResponsibility')
      .exec();
    if (!inc) {
      throw new NotFoundException(`Incident ${incidentId} not found`);
    }
    return inc;
  }

  /**
   * Tool: get_related_alerts
   */
  async getRelatedAlerts(incidentId: string, service: string) {
    const objId = new Types.ObjectId(incidentId);
    return this.alertModel
      .find({
        $or: [{ incidentId: objId }, { service, status: 'UNASSIGNED' }],
      })
      .sort({ timestamp: -1 })
      .limit(20)
      .exec();
  }

  /**
   * Tool: get_recent_activity
   */
  async getRecentActivity(incidentId: string) {
    const [comments, audits] = await Promise.all([
      this.commentModel
        .find({ incidentId: new Types.ObjectId(incidentId) })
        .populate('userId', 'name')
        .sort({ createdAt: -1 })
        .limit(10)
        .exec(),
      this.auditService.findByIncidentId(incidentId),
    ]);

    const activity: Array<{ action: string; actor: string; timestamp: Date; details?: string }> = [];

    comments.forEach((c: any) => {
      activity.push({
        action: 'COMMENT_POSTED',
        actor: c.userId?.name || 'User',
        timestamp: c.createdAt,
        details: c.content,
      });
    });

    audits.slice(0, 10).forEach((a: any) => {
      activity.push({
        action: a.action,
        actor: a.actorId || 'System',
        timestamp: a.timestamp,
        details: JSON.stringify(a.metadata || {}),
      });
    });

    return activity.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).slice(0, 15);
  }

  /**
   * Tool: get_tasks
   */
  async getTasks(incidentId: string) {
    return this.taskModel
      .find({ incidentId: new Types.ObjectId(incidentId) })
      .sort({ createdAt: 1 })
      .exec();
  }

  /**
   * Tool: search_similar_incidents
   */
  async getSimilarIncidents(service: string, excludeIncidentId: string) {
    return this.incidentModel
      .find({
        service,
        _id: { $ne: new Types.ObjectId(excludeIncidentId) },
      })
      .sort({ createdAt: -1 })
      .limit(5)
      .exec();
  }

  /**
   * Gathers full grounded application context deterministically
   */
  async gatherContext(incidentId: string): Promise<GroundedContext> {
    const incident = await this.getIncident(incidentId);
    const validEntityIds = new Set<string>();

    validEntityIds.add(incident._id.toString());

    const [alerts, activity, tasks, similarIncidents] = await Promise.all([
      this.getRelatedAlerts(incident._id.toString(), incident.service),
      this.getRecentActivity(incident._id.toString()),
      this.getTasks(incident._id.toString()),
      this.getSimilarIncidents(incident.service, incident._id.toString()),
    ]);

    alerts.forEach((a) => validEntityIds.add(a._id.toString()));
    tasks.forEach((t) => validEntityIds.add(t._id.toString()));
    similarIncidents.forEach((s) => validEntityIds.add(s._id.toString()));

    const incidentVersion = `${incident._id.toString()}:${incident.updatedAt ? incident.updatedAt.getTime() : incident.createdAt.getTime()}`;

    return {
      incident: {
        id: incident._id.toString(),
        title: incident.title,
        description: incident.description,
        severity: incident.severity,
        status: incident.status,
        service: incident.service,
        createdAt: incident.createdAt,
        updatedAt: incident.updatedAt,
        version: incidentVersion,
      },
      assignee: incident.assigneeId
        ? {
            id: (incident.assigneeId as any)._id?.toString() || '',
            name: (incident.assigneeId as any).name || '',
            email: (incident.assigneeId as any).email || '',
          }
        : null,
      team: incident.teamId
        ? {
            id: (incident.teamId as any)._id?.toString() || '',
            name: (incident.teamId as any).name || '',
            serviceResponsibility: (incident.teamId as any).serviceResponsibility || [],
          }
        : null,
      alerts: alerts.map((a) => ({
        id: a._id.toString(),
        title: a.title,
        severity: a.severity,
        service: a.service,
        source: a.source,
        timestamp: a.timestamp,
        count: a.count || 1,
        description: a.description,
      })),
      recentActivity: activity,
      tasks: tasks.map((t) => ({
        id: t._id.toString(),
        title: t.title,
        status: t.status,
      })),
      similarIncidents: similarIncidents.map((s) => ({
        id: s._id.toString(),
        title: s.title,
        severity: s.severity,
        status: s.status,
        resolvedAt: s.resolvedAt,
      })),
      validEntityIds,
    };
  }

  /**
   * Validates that model evidence references real existing application entities
   */
  validateEvidenceGrounding(
    evidence: Array<{ type: string; id: string; reason: string }>,
    context: GroundedContext,
  ): Array<{ type: string; id: string; reason: string }> {
    return evidence.map((item) => {
      const isGrounded = context.validEntityIds.has(item.id);
      if (!isGrounded) {
        return {
          ...item,
          reason: `[Unverified Reference] ${item.reason}`,
        };
      }
      return item;
    });
  }
}

