import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';

import { User, UserDocument, UserRole } from '../users/schemas/user.schema';
import { Team, TeamDocument } from '../teams/schemas/team.schema';
import { Incident, IncidentDocument, IncidentSeverity, IncidentStatus } from '../incidents/schemas/incident.schema';
import { Alert, AlertDocument, AlertStatus } from '../alerts/schemas/alert.schema';
import { Comment, CommentDocument } from '../comments/schemas/comment.schema';
import { Task, TaskDocument, TaskStatus } from '../tasks/schemas/task.schema';
import { AuditEvent, AuditEventDocument, ActorType } from '../audit/schemas/audit-event.schema';
import { AIInvestigation, AIInvestigationDocument, AIInvestigationStatus, ProposedActionStatus } from '../ai/schemas/ai-investigation.schema';
import { CountersService } from '../common/counters/counters.service';

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Team.name) private teamModel: Model<TeamDocument>,
    @InjectModel(Incident.name) private incidentModel: Model<IncidentDocument>,
    @InjectModel(Alert.name) private alertModel: Model<AlertDocument>,
    @InjectModel(Comment.name) private commentModel: Model<CommentDocument>,
    @InjectModel(Task.name) private taskModel: Model<TaskDocument>,
    @InjectModel(AuditEvent.name) private auditModel: Model<AuditEventDocument>,
    @InjectModel(AIInvestigation.name) private aiInvestigationModel: Model<AIInvestigationDocument>,
    private countersService: CountersService,
  ) {}

  async onApplicationBootstrap() {
    try {
      await this.seed();
    } catch (err: any) {
      this.logger.warn(`Seed check warning: ${err.message}`);
    }
  }

  async seed(force = false) {
    const userCount = await this.userModel.countDocuments();
    if (userCount > 0 && !force) {
      this.logger.log(`Database already seeded (${userCount} users found). Skipping seed.`);
      return;
    }

    if (force) {
      this.logger.warn('Force seed enabled: Clearing existing collections...');
      await Promise.all([
        this.userModel.deleteMany({}),
        this.teamModel.deleteMany({}),
        this.incidentModel.deleteMany({}),
        this.alertModel.deleteMany({}),
        this.commentModel.deleteMany({}),
        this.taskModel.deleteMany({}),
        this.auditModel.deleteMany({}),
        this.aiInvestigationModel.deleteMany({}),
      ]);
    }

    this.logger.log('Starting realistic idempotent seed...');

    const saltRounds = 10;
    const adminPasswordHash = await bcrypt.hash('Admin123!', saltRounds);
    const operatorPasswordHash = await bcrypt.hash('Operator123!', saltRounds);

    // 1. Teams
    const teamsData = [
      {
        name: 'Core Infrastructure',
        description: 'Underlying cloud platform, edge gateways, service meshes, and DB clusters.',
        serviceResponsibility: ['gateway', 'database-cluster', 'auth-service'],
      },
      {
        name: 'Platform & Payments',
        description: 'Payment processors, ledger APIs, fraud checks, and customer notifications.',
        serviceResponsibility: ['payment-service', 'notification-worker'],
      },
      {
        name: 'Customer & Commerce',
        description: 'Order routing, shopping cart, inventory allocations, and product catalog.',
        serviceResponsibility: ['order-api', 'inventory-service'],
      },
    ];

    const createdTeams = await this.teamModel.insertMany(teamsData);
    const [infraTeam, paymentsTeam, commerceTeam] = createdTeams;

    // 2. Users (1 Admin, 4 Operators)
    const usersData = [
      {
        name: 'Admin User',
        email: 'admin@example.com',
        passwordHash: adminPasswordHash,
        role: UserRole.ADMIN,
        teamId: infraTeam._id,
        isActive: true,
      },
      {
        name: 'Operator John',
        email: 'operator@example.com',
        passwordHash: operatorPasswordHash,
        role: UserRole.OPERATOR,
        teamId: infraTeam._id,
        isActive: true,
      },
      {
        name: 'Sarah Chen',
        email: 'sarah.chen@example.com',
        passwordHash: operatorPasswordHash,
        role: UserRole.OPERATOR,
        teamId: paymentsTeam._id,
        isActive: true,
      },
      {
        name: 'Alex Rivera',
        email: 'alex.rivera@example.com',
        passwordHash: operatorPasswordHash,
        role: UserRole.OPERATOR,
        teamId: commerceTeam._id,
        isActive: true,
      },
      {
        name: 'David Kim',
        email: 'david.kim@example.com',
        passwordHash: operatorPasswordHash,
        role: UserRole.OPERATOR,
        teamId: paymentsTeam._id,
        isActive: true,
      },
    ];

    const createdUsers = await this.userModel.insertMany(usersData);
    const [adminUser, johnOp, sarahOp, alexOp, davidOp] = createdUsers;

    // Set team leads
    await this.teamModel.findByIdAndUpdate(infraTeam._id, { leadUserId: johnOp._id });
    await this.teamModel.findByIdAndUpdate(paymentsTeam._id, { leadUserId: sarahOp._id });
    await this.teamModel.findByIdAndUpdate(commerceTeam._id, { leadUserId: alexOp._id });

    // 3. Incidents (70 realistic incidents)
    const services = [
      { name: 'payment-service', team: paymentsTeam },
      { name: 'auth-service', team: infraTeam },
      { name: 'order-api', team: commerceTeam },
      { name: 'inventory-service', team: commerceTeam },
      { name: 'gateway', team: infraTeam },
      { name: 'notification-worker', team: paymentsTeam },
      { name: 'database-cluster', team: infraTeam },
    ];

    const severities = [
      IncidentSeverity.P1,
      IncidentSeverity.P2,
      IncidentSeverity.P2,
      IncidentSeverity.P3,
      IncidentSeverity.P3,
      IncidentSeverity.P3,
      IncidentSeverity.P4,
      IncidentSeverity.P4,
    ];

    const statuses = [
      IncidentStatus.OPEN,
      IncidentStatus.INVESTIGATING,
      IncidentStatus.INVESTIGATING,
      IncidentStatus.MITIGATED,
      IncidentStatus.RESOLVED,
      IncidentStatus.RESOLVED,
    ];

    const operators = [johnOp, sarahOp, alexOp, davidOp];

    const sampleIncidentTemplates = [
      {
        title: 'Elevated 5xx error rate on checkout route',
        desc: 'Gateway metrics indicate HTTP 502 and 504 errors on /api/v1/checkout exceeding 8% threshold.',
        tags: ['checkout', 'gateway', 'latency'],
      },
      {
        title: 'Redis replication lag exceeding 10s',
        desc: 'Read replicas in us-east-1 experiencing replication lag under heavy write volume.',
        tags: ['redis', 'database', 'lag'],
      },
      {
        title: 'Payment webhook delivery dead letter queue spike',
        desc: 'Stripe webhook listener failed to acknowledge events resulting in DLQ accumulation.',
        tags: ['payments', 'dlq', 'webhooks'],
      },
      {
        title: 'Authentication token verification latency degradation',
        desc: 'JWT public key cache miss causing excessive roundtrips to identity provider.',
        tags: ['auth', 'jwt', 'latency'],
      },
      {
        title: 'High database connection pool exhaustion',
        desc: 'Active connections reached 98% of pool capacity on Postgres primary.',
        tags: ['database', 'connections', 'postgres'],
      },
      {
        title: 'Inventory reconciliation mismatch across regional warehouses',
        desc: 'Asynchronous event stream dropped 43 stock adjustment messages.',
        tags: ['inventory', 'kafka', 'consistency'],
      },
      {
        title: 'Memory leak in notification worker background consumer',
        desc: 'RSS memory increasing monotonically until OOMKilled by Kubernetes cgroup.',
        tags: ['worker', 'memory-leak', 'oom'],
      },
      {
        title: 'TLS handshake failures on edge ingress proxy',
        desc: 'Certificate renewal failed on secondary ingress controller pod.',
        tags: ['tls', 'ingress', 'certificates'],
      },
    ];

    const incidentsToInsert = [];
    const now = Date.now();

    for (let i = 1; i <= 70; i++) {
      const template = sampleIncidentTemplates[i % sampleIncidentTemplates.length];
      const serviceObj = services[i % services.length];
      const severity = severities[i % severities.length];
      const status = statuses[i % statuses.length];
      const assignee = i % 5 === 0 ? null : operators[i % operators.length];
      
      // Spread created dates across the past 28 days
      const daysAgo = (70 - i) * 0.4;
      const createdAt = new Date(now - daysAgo * 24 * 60 * 60 * 1000);
      const updatedAt = new Date(createdAt.getTime() + Math.min(3600000 * 4, now - createdAt.getTime()));
      const resolvedAt = status === IncidentStatus.RESOLVED ? updatedAt : null;

      incidentsToInsert.push({
        incidentNumber: i,
        title: `${template.title} #${1000 + i}`,
        description: template.desc,
        status,
        severity,
        services: [serviceObj.name],
        correlationKey: `service:${serviceObj.name.toLowerCase()}`,
        teamId: serviceObj.team._id,
        assigneeId: assignee ? assignee._id : null,
        tags: template.tags,
        resolvedAt,
        createdAt,
        updatedAt,
      });
    }

    const createdIncidents = await this.incidentModel.insertMany(incidentsToInsert);
    await this.countersService.syncIncidentCounterToAtLeast(createdIncidents.length);
    this.logger.log(`Seeded ${createdIncidents.length} incidents successfully.`);

    // 4. Alerts (~150 alerts)
    const alertSources = ['Prometheus', 'Datadog', 'AWS CloudWatch', 'PagerDuty', 'Sentry'];
    const alertsToInsert = [];

    // Associate 100 alerts with existing incidents
    for (let i = 0; i < 110; i++) {
      const inc = createdIncidents[i % createdIncidents.length];
      const timestamp = new Date(inc.createdAt.getTime() - Math.floor(Math.random() * 300000));
      alertsToInsert.push({
        title: `Alert: High error rates on ${inc.services[0]}`,
        description: `Threshold exceeded for ${inc.services[0]} - error rate > 5% over 5m interval.`,
        severity: inc.severity,
        service: inc.services[0],
        timestamp,
        source: alertSources[i % alertSources.length],
        rawPayload: { metric: 'http_requests_total', code: '5xx', threshold: 0.05, value: 0.082 },
        incidentId: inc._id,
        status: AlertStatus.CORRELATED,
        createdAt: timestamp,
      });
    }

    // 40 Unassigned alerts for real-time triage and correlation demos
    for (let i = 1; i <= 40; i++) {
      const serviceObj = services[i % services.length];
      const timestamp = new Date(now - i * 15 * 60 * 1000); // within last 10 hours
      alertsToInsert.push({
        title: `Simulated anomaly in ${serviceObj.name} latency distribution`,
        description: `P99 latency jumped above 1200ms on ${serviceObj.name} endpoints.`,
        severity: i % 4 === 0 ? 'P1' : i % 3 === 0 ? 'P2' : 'P3',
        service: serviceObj.name,
        timestamp,
        source: alertSources[i % alertSources.length],
        rawPayload: { p99_latency_ms: 1240, normal_threshold: 400 },
        incidentId: null,
        status: AlertStatus.UNASSIGNED,
        createdAt: timestamp,
      });
    }

    await this.alertModel.insertMany(alertsToInsert);
    this.logger.log(`Seeded ${alertsToInsert.length} alerts successfully.`);

    // 5. Comments & Tasks on the most recent 15 incidents
    const commentsToInsert = [];
    const tasksToInsert = [];
    const auditEventsToInsert = [];

    const activeIncidents = createdIncidents.slice(-15);

    for (const inc of activeIncidents) {
      // Audit event for incident creation
      auditEventsToInsert.push({
        incidentId: inc._id,
        actorType: ActorType.SYSTEM,
        actorId: 'system',
        action: 'INCIDENT_CREATED',
        entity: 'Incident',
        entityId: inc._id.toString(),
        metadata: { title: inc.title, severity: inc.severity, services: inc.services },
        timestamp: inc.createdAt,
      });

      // Comments
      commentsToInsert.push({
        incidentId: inc._id,
        userId: johnOp._id,
        content: `Triaging this incident. Checked APM traces for ${inc.services.join(', ')}, seeing upstream throttling.`,
        createdAt: new Date(inc.createdAt.getTime() + 10 * 60 * 1000),
      });

      if (inc.assigneeId) {
        commentsToInsert.push({
          incidentId: inc._id,
          userId: inc.assigneeId,
          content: 'Acknowledged. Pulling container logs and verifying memory usage.',
          createdAt: new Date(inc.createdAt.getTime() + 25 * 60 * 1000),
        });
      }

      // Tasks
      tasksToInsert.push({
        incidentId: inc._id,
        title: 'Review container logs for panic or connection timeouts',
        description: 'Inspect stdout logs across last 30 minutes in Loki/Elasticsearch.',
        status: TaskStatus.COMPLETED,
        assigneeId: inc.assigneeId || johnOp._id,
        createdAt: new Date(inc.createdAt.getTime() + 5 * 60 * 1000),
      });

      tasksToInsert.push({
        incidentId: inc._id,
        title: 'Adjust connection pool capacity or scale replica count',
        description: 'Verify if horizontal auto-scaler threshold is reached.',
        status: inc.status === IncidentStatus.RESOLVED ? TaskStatus.COMPLETED : TaskStatus.IN_PROGRESS,
        assigneeId: inc.assigneeId || sarahOp._id,
        createdAt: new Date(inc.createdAt.getTime() + 15 * 60 * 1000),
      });
    }

    await this.commentModel.insertMany(commentsToInsert);
    await this.taskModel.insertMany(tasksToInsert);
    await this.auditModel.insertMany(auditEventsToInsert);

    // 6. Sample AI Investigation for one recent high-priority incident
    const targetP1 = activeIncidents.find((inc) => inc.severity === IncidentSeverity.P1) || activeIncidents[0];
    await this.aiInvestigationModel.create({
      incidentId: targetP1._id,
      status: AIInvestigationStatus.COMPLETED,
      summary: `Automated investigation determined elevated error rate in ${targetP1.services.join(', ')} due to downstream dependency throttling and connection saturation.`,
      findings: [
        'Sudden spike in downstream latency beginning at incident timestamp.',
        'Database connection pool saturated at 95% threshold for >10 consecutive minutes.',
        'High correlation with recent deployment of release v2.14.0.',
      ],
      evidence: [
        `Correlated 3 alerts from Prometheus reporting 504 Gateway Timeouts.`,
        `Similar historical incident #1004 showed identical signature resolved by pool resizing.`,
      ],
      confidence: 0.92,
      recommendations: [
        'Scale deployment replicas from 4 to 8 to distribute active connection loads.',
        'Temporarily increase max_connections limit on Postgres database replica.',
        'Notify on-call team for payments service.',
      ],
      proposedAction: {
        type: 'CHANGE_SEVERITY',
        parameters: { severity: 'P1' },
        reason: 'Client-facing transaction degradation exceeds SLA threshold.',
        status: ProposedActionStatus.PENDING_APPROVAL,
      },
      rawOutput: JSON.stringify({ note: 'Grounded in Prometheus alerts and service topology' }),
      roundCount: 4,
      startedAt: new Date(targetP1.createdAt.getTime() + 60000),
      completedAt: new Date(targetP1.createdAt.getTime() + 180000),
    });

    this.logger.log('Seed completed successfully! Demo accounts and 70 incidents populated.');
  }
}

