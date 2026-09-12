import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument, UserRole } from './schemas/user.schema';
import { Incident, IncidentDocument, IncidentStatus } from '../incidents/schemas/incident.schema';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Incident.name) private incidentModel: Model<IncidentDocument>,
  ) {}

  async findByEmail(email: string, includePassword = false): Promise<UserDocument | null> {
    const query = this.userModel.findOne({ email: email.toLowerCase() });
    if (includePassword) {
      query.select('+passwordHash');
    }
    return query.exec();
  }

  async findById(id: string | Types.ObjectId): Promise<UserDocument | null> {
    return this.userModel.findById(id).populate('teamId', 'name serviceResponsibility').exec();
  }

  async findAll(): Promise<UserDocument[]> {
    return this.userModel
      .find({ isActive: true })
      .populate('teamId', 'name serviceResponsibility')
      .sort({ name: 1 })
      .exec();
  }

  async count(): Promise<number> {
    return this.userModel.countDocuments().exec();
  }

  async getWorkload() {
    const users = await this.findAll();

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

  async updateUserRoleOrTeam(
    id: string,
    data: { role?: UserRole; teamId?: string },
  ): Promise<UserDocument> {
    const updates: any = {};
    if (data.role) updates.role = data.role;
    if (data.teamId !== undefined) {
      updates.teamId = data.teamId ? new Types.ObjectId(data.teamId) : null;
    }

    const updated = await this.userModel
      .findByIdAndUpdate(id, { $set: updates }, { new: true })
      .populate('teamId', 'name serviceResponsibility')
      .exec();

    if (!updated) {
      throw new NotFoundException(`User ${id} not found`);
    }
    return updated;
  }
}
