import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Team, TeamDocument } from './schemas/team.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { Incident, IncidentDocument, IncidentStatus } from '../incidents/schemas/incident.schema';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { UpdateTeamMembersDto } from './dto/update-team-members.dto';

@Injectable()
export class TeamsService {
  constructor(
    @InjectModel(Team.name) private teamModel: Model<TeamDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Incident.name) private incidentModel: Model<IncidentDocument>,
  ) {}

  async findAll(includeArchived = false): Promise<TeamDocument[]> {
    const filter = includeArchived ? {} : { isArchived: { $ne: true } };
    return this.teamModel
      .find(filter)
      .populate('leadUserId', 'name email role')
      .sort({ name: 1 })
      .exec();
  }

  async findById(id: string): Promise<TeamDocument | null> {
    return this.teamModel.findById(id).populate('leadUserId', 'name email role').exec();
  }

  async getTeamDetails(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`Team ${id} not found`);
    }
    const team = await this.findById(id);
    if (!team) {
      throw new NotFoundException(`Team ${id} not found`);
    }

    const teamObjectId = new Types.ObjectId(id);

    const [incidentCounts, members] = await Promise.all([
      this.incidentModel.aggregate([
        {
          $match: {
            status: { $in: [IncidentStatus.OPEN, IncidentStatus.INVESTIGATING, IncidentStatus.MITIGATED] },
            teamId: teamObjectId,
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
      this.getMembers(id),
    ]);

    const counts = incidentCounts[0] || { activeCount: 0, criticalCount: 0 };

    return {
      ...team.toObject(),
      activeIncidents: counts.activeCount,
      criticalIncidents: counts.criticalCount,
      memberCount: members.length,
      members,
    };
  }

  async count(): Promise<number> {
    return this.teamModel.countDocuments({ isArchived: { $ne: true } }).exec();
  }

  async getWorkload(includeArchived = false) {
    const teams = await this.findAll(includeArchived);

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

    const memberCounts = await this.userModel.aggregate([
      { $match: { isActive: true, teamId: { $ne: null } } },
      { $group: { _id: '$teamId', memberCount: { $sum: 1 } } },
    ]);
    const memberMap = new Map<string, number>();
    memberCounts.forEach((item) => {
      memberMap.set(item._id.toString(), item.memberCount);
    });

    return teams.map((team) => {
      const counts = countMap.get(team._id.toString()) || { activeCount: 0, criticalCount: 0 };
      return {
        ...team.toObject(),
        activeIncidents: counts.activeCount,
        criticalIncidents: counts.criticalCount,
        memberCount: memberMap.get(team._id.toString()) || 0,
      };
    });
  }

  async getMembers(teamId: string): Promise<UserDocument[]> {
    await this.ensureTeamExists(teamId);
    return this.userModel
      .find({ teamId: new Types.ObjectId(teamId), isActive: true })
      .sort({ name: 1 })
      .exec();
  }

  async create(dto: CreateTeamDto): Promise<TeamDocument> {
    const team = new this.teamModel({
      name: dto.name.trim(),
      description: dto.description?.trim() ?? '',
      serviceResponsibility: dto.serviceResponsibility ?? [],
      leadUserId: dto.leadUserId ? new Types.ObjectId(dto.leadUserId) : null,
    });
    return team.save();
  }

  async update(id: string, dto: UpdateTeamDto): Promise<TeamDocument> {
    const team = await this.ensureTeamExists(id);

    if (dto.name !== undefined) {
      team.name = dto.name.trim();
    }
    if (dto.description !== undefined) {
      team.description = dto.description.trim();
    }
    if (dto.serviceResponsibility !== undefined) {
      team.serviceResponsibility = dto.serviceResponsibility;
    }
    if (dto.leadUserId !== undefined) {
      if (dto.leadUserId) {
        const lead = await this.userModel.findById(dto.leadUserId).exec();
        if (!lead || !lead.isActive) {
          throw new BadRequestException('Lead user must be an active user');
        }
        team.leadUserId = new Types.ObjectId(dto.leadUserId);
      } else {
        team.leadUserId = null;
      }
    }
    if (dto.isArchived !== undefined) {
      team.isArchived = dto.isArchived;
      if (dto.isArchived) {
        team.leadUserId = null;
      }
    }

    await team.save();
    return this.findById(id) as Promise<TeamDocument>;
  }

  async updateMembers(teamId: string, dto: UpdateTeamMembersDto): Promise<UserDocument[]> {
    const team = await this.ensureTeamExists(teamId);
    if (team.isArchived) {
      throw new BadRequestException('Cannot modify members of an archived team');
    }

    const teamObjectId = new Types.ObjectId(teamId);

    if (dto.removeUserIds?.length) {
      await this.userModel.updateMany(
        {
          _id: { $in: dto.removeUserIds.map((id) => new Types.ObjectId(id)) },
          teamId: teamObjectId,
        },
        { $set: { teamId: null } },
      );
    }

    if (dto.addUserIds?.length) {
      const users = await this.userModel
        .find({
          _id: { $in: dto.addUserIds.map((id) => new Types.ObjectId(id)) },
          isActive: true,
        })
        .exec();

      if (users.length !== dto.addUserIds.length) {
        throw new BadRequestException('One or more users could not be added');
      }

      await this.userModel.updateMany(
        { _id: { $in: users.map((u) => u._id) } },
        { $set: { teamId: teamObjectId } },
      );
    }

    return this.getMembers(teamId);
  }

  private async ensureTeamExists(id: string): Promise<TeamDocument> {
    const team = await this.teamModel.findById(id).exec();
    if (!team) {
      throw new NotFoundException(`Team ${id} not found`);
    }
    return team;
  }
}
