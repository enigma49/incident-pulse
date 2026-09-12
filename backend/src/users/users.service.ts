import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument, UserRole } from './schemas/user.schema';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
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
      .exec();
  }

  async count(): Promise<number> {
    return this.userModel.countDocuments().exec();
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
}

