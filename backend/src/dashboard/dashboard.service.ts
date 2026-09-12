import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Incident, IncidentDocument, IncidentSeverity, IncidentStatus } from '../incidents/schemas/incident.schema';
import { Team, TeamDocument } from '../teams/schemas/team.schema';
import { AuditService } from '../audit/audit.service';
import { RedisService, CACHE_KEYS, CACHE_TTLS } from '../common/redis/redis.service';

export interface DashboardOverview {
  totalIncidents: number;
  openIncidents: number;
  criticalIncidents: number;
  mitigatedIncidents: number;
  resolvedIncidents: number;
  severityBreakdown: Record<string, number>;
  statusBreakdown: Record<string, number>;
  serviceBreakdown: Record<string, number>;
  teamWorkload: any[];
  recentIncidents: any[];
  recentActivity: any[];
  cachedAt?: string;
  fromCache: boolean;
}

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    @InjectModel(Incident.name) private incidentModel: Model<IncidentDocument>,
    @InjectModel(Team.name) private teamModel: Model<TeamDocument>,
    private auditService: AuditService,
    private redisService: RedisService,
  ) {}

  async getOverview(): Promise<DashboardOverview> {
    // 1. Check Redis Cache
    const cached = await this.redisService.get<DashboardOverview>(CACHE_KEYS.DASHBOARD_OVERVIEW);
    if (cached) {
      this.logger.log(`Serving operations overview from Redis cache [${CACHE_KEYS.DASHBOARD_OVERVIEW}]`);
      return {
        ...cached,
        fromCache: true,
      };
    }

    this.logger.log(`Cache miss on [${CACHE_KEYS.DASHBOARD_OVERVIEW}]. Aggregating fresh metrics from MongoDB...`);

    // 2. Query MongoDB Aggregations
    const [
      total,
      open,
      critical,
      mitigated,
      resolved,
      severityAgg,
      statusAgg,
      serviceAgg,
      teams,
      teamIncidentsAgg,
      recentIncidents,
      recentActivity,
    ] = await Promise.all([
      this.incidentModel.countDocuments(),
      this.incidentModel.countDocuments({ status: IncidentStatus.OPEN }),
      this.incidentModel.countDocuments({
        severity: { $in: [IncidentSeverity.P1, IncidentSeverity.P2] },
        status: { $ne: IncidentStatus.RESOLVED },
      }),
      this.incidentModel.countDocuments({ status: IncidentStatus.MITIGATED }),
      this.incidentModel.countDocuments({ status: IncidentStatus.RESOLVED }),
      this.incidentModel.aggregate([{ $group: { _id: '$severity', count: { $sum: 1 } } }]),
      this.incidentModel.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      this.incidentModel.aggregate([{ $group: { _id: '$service', count: { $sum: 1 } } }]),
      this.teamModel.find().exec(),
      this.incidentModel.aggregate([
        {
          $match: {
            status: { $in: [IncidentStatus.OPEN, IncidentStatus.INVESTIGATING, IncidentStatus.MITIGATED] },
            teamId: { $ne: null },
          },
        },
        {
          $group: {
            _id: '$teamId',
            activeCount: { $sum: 1 },
            criticalCount: {
              $sum: { $cond: [{ $in: ['$severity', ['P1', 'P2']] }, 1, 0] },
            },
          },
        },
      ]),
      this.incidentModel
        .find()
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('teamId', 'name')
        .populate('assigneeId', 'name')
        .exec(),
      this.auditService.findRecent(10),
    ]);

    // Format Breakdowns
    const severityBreakdown: Record<string, number> = { P1: 0, P2: 0, P3: 0, P4: 0 };
    severityAgg.forEach((item) => {
      if (item._id) severityBreakdown[item._id] = item.count;
    });

    const statusBreakdown: Record<string, number> = {
      OPEN: 0,
      INVESTIGATING: 0,
      MITIGATED: 0,
      RESOLVED: 0,
    };
    statusAgg.forEach((item) => {
      if (item._id) statusBreakdown[item._id] = item.count;
    });

    const serviceBreakdown: Record<string, number> = {};
    serviceAgg.forEach((item) => {
      if (item._id) serviceBreakdown[item._id] = item.count;
    });

    // Format Team Workloads
    const teamCounts = new Map<string, { activeCount: number; criticalCount: number }>();
    teamIncidentsAgg.forEach((item) => {
      teamCounts.set(item._id.toString(), {
        activeCount: item.activeCount,
        criticalCount: item.criticalCount,
      });
    });

    const teamWorkload = teams.map((team) => {
      const counts = teamCounts.get(team._id.toString()) || { activeCount: 0, criticalCount: 0 };
      return {
        _id: team._id,
        name: team.name,
        serviceResponsibility: team.serviceResponsibility,
        activeIncidents: counts.activeCount,
        criticalIncidents: counts.criticalCount,
      };
    });

    const overview: DashboardOverview = {
      totalIncidents: total,
      openIncidents: open,
      criticalIncidents: critical,
      mitigatedIncidents: mitigated,
      resolvedIncidents: resolved,
      severityBreakdown,
      statusBreakdown,
      serviceBreakdown,
      teamWorkload,
      recentIncidents,
      recentActivity,
      cachedAt: new Date().toISOString(),
      fromCache: false,
    };

    // 3. Store in Redis with 30s TTL
    await this.redisService.set(
      CACHE_KEYS.DASHBOARD_OVERVIEW,
      overview,
      CACHE_TTLS.DASHBOARD,
    );

    return overview;
  }
}

