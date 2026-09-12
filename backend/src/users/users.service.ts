import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User, UserDocument, UserRole } from './schemas/user.schema';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Incident, IncidentDocument, IncidentStatus } from '../incidents/schemas/incident.schema';
import { Team, TeamDocument } from '../teams/schemas/team.schema';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Incident.name) private incidentModel: Model<IncidentDocument>,
    @InjectModel(Team.name) private teamModel: Model<TeamDocument>,
  ) {}

  async findByEmail(email: string, includePassword = false): Promise<UserDocument | null> {
    const query = this.userModel.findOne({ email: email.toLowerCase() });
    if (includePassword) {
      query.select('+passwordHash');
    }
    return query.exec();
  }

  async findById(id: string | Types.ObjectId): Promise<UserDocument | null> {
    return this.userModel.findById(id).populate('teamId', 'name serviceResponsibility isArchived').exec();
  }

  async findAll(includeInactive = false): Promise<UserDocument[]> {
    const filter = includeInactive ? {} : { isActive: true };
    return this.userModel
      .find(filter)
      .populate('teamId', 'name serviceResponsibility isArchived')
      .sort({ name: 1 })
      .exec();
  }

  async count(): Promise<number> {
    return this.userModel.countDocuments().exec();
  }

  async getWorkload(includeInactive = false) {
    const users = await this.findAll(includeInactive);

    const aggregation = await this.incidentModel.aggregate([
      {
        $match: {
          status: { $in: [IncidentStatus.OPEN, IncidentStatus.INVESTIGATING, IncidentStatus.MITIGATED] },
          assigneeId: { $ne: null },
        },
      },
      {
        $group: {
          _id: '$assigneeId',
          assignedIncidents: { $sum: 1 },
          criticalIncidents: {
            $sum: { $cond: [{ $in: ['$severity', ['P1', 'P2']] }, 1, 0] },
          },
        },
      },
    ]);

    const countMap = new Map<string, { assignedIncidents: number; criticalIncidents: number }>();
    aggregation.forEach((item) => {
      countMap.set(item._id.toString(), {
        assignedIncidents: item.assignedIncidents,
        criticalIncidents: item.criticalIncidents,
      });
    });

    return users.map((u) => {
      const counts = countMap.get(u._id.toString()) || { assignedIncidents: 0, criticalIncidents: 0 };
      return {
        ...u.toObject(),
        id: u._id.toString(),
        assignedIncidents: counts.assignedIncidents,
        criticalIncidents: counts.criticalIncidents,
      };
    });
  }

  async create(data: {
    name: string;
    email: string;
    passwordHash: string;
    role: UserRole;
    teamId?: Types.ObjectId;
  }): Promise<UserDocument> {
    const user = new this.userModel({
      ...data,
      email: data.email.toLowerCase(),
    });
    return user.save();
  }

  async createUser(dto: CreateUserDto): Promise<UserDocument> {
    const existing = await this.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Email is already registered');
    }

    if (dto.teamId) {
      await this.ensureAssignableTeam(dto.teamId);
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    return this.create({
      name: dto.name.trim(),
      email: dto.email,
      passwordHash,
      role: dto.role ?? UserRole.OPERATOR,
      teamId: dto.teamId ? new Types.ObjectId(dto.teamId) : undefined,
    });
  }

  async updateUser(id: string, dto: UpdateUserDto): Promise<UserDocument> {
    const user = await this.userModel.findById(id).exec();
    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }

    if (dto.name !== undefined) {
      user.name = dto.name.trim();
    }
    if (dto.role !== undefined) {
      user.role = dto.role;
    }
    if (dto.teamId !== undefined) {
      if (dto.teamId) {
        await this.ensureAssignableTeam(dto.teamId);
        user.teamId = new Types.ObjectId(dto.teamId);
      } else {
        user.teamId = null;
      }
    }
    if (dto.isActive !== undefined) {
      user.isActive = dto.isActive;
    }

    await user.save();
    return this.findById(id) as Promise<UserDocument>;
  }

  async resetPassword(id: string, password: string): Promise<void> {
    const user = await this.userModel.findById(id).select('+passwordHash').exec();
    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }
    user.passwordHash = await bcrypt.hash(password, 10);
    await user.save();
  }

  async updateUserRoleOrTeam(
    id: string,
    data: { role?: UserRole; teamId?: string },
  ): Promise<UserDocument> {
    return this.updateUser(id, data);
  }

  private async ensureAssignableTeam(teamId: string): Promise<void> {
    const team = await this.teamModel.findById(teamId).exec();
    if (!team) {
      throw new BadRequestException('Team not found');
    }
    if (team.isArchived) {
      throw new BadRequestException('Cannot assign users to an archived team');
    }
  }
}
