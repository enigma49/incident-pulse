import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Team, TeamDocument } from './schemas/team.schema';
import { Incident, IncidentDocument, IncidentStatus } from '../incidents/schemas/incident.schema';

@Injectable()
export class TeamsService {
  constructor(
    @InjectModel(Team.name) private teamModel: Model<TeamDocument>,
    @InjectModel(Incident.name) private incidentModel: Model<IncidentDocument>,
  ) {}

  async findAll(): Promise<TeamDocument[]> {
    return this.teamModel.find().populate('leadUserId', 'name email role').exec();
  }

  async findById(id: string): Promise<TeamDocument | null> {
    return this.teamModel.findById(id).populate('leadUserId', 'name email role').exec();
  }

  async count(): Promise<number> {
    return this.teamModel.countDocuments().exec();
  }

  async getWorkload() {
    const teams = await this.findAll();

    const aggregation = await this.incidentModel.aggregate([
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
    ]);

    const countMap = new Map<string, { activeCount: number; criticalCount: number }>();
    aggregation.forEach((item) => {
      countMap.set(item._id.toString(), {
        activeCount: item.activeCount,
        criticalCount: item.criticalCount,
      });
    });

    return teams.map((team) => {
      const counts = countMap.get(team._id.toString()) || { activeCount: 0, criticalCount: 0 };
      return {
        ...team.toObject(),
        activeIncidents: counts.activeCount,
        criticalIncidents: counts.criticalCount,
      };
    });
  }

  async create(data: {
    name: string;
    description?: string;
    serviceResponsibility?: string[];
    leadUserId?: any;
  }): Promise<TeamDocument> {
    const team = new this.teamModel(data);
    return team.save();
  }
}
