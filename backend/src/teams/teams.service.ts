import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Team, TeamDocument } from './schemas/team.schema';

@Injectable()
export class TeamsService {
  constructor(
    @InjectModel(Team.name) private teamModel: Model<TeamDocument>,
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

