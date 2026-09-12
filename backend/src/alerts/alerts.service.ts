import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Alert, AlertDocument } from './schemas/alert.schema';

@Injectable()
export class AlertsService {
  constructor(
    @InjectModel(Alert.name) private alertModel: Model<AlertDocument>,
  ) {}

  async findAll(query: { service?: string; status?: string; limit?: number }) {
    const filter: Record<string, any> = {};
    if (query.service) filter.service = query.service;
    if (query.status) filter.status = query.status;

    return this.alertModel
      .find(filter)
      .sort({ timestamp: -1 })
      .limit(query.limit || 50)
      .exec();
  }

  async findByIncident(incidentId: string): Promise<AlertDocument[]> {
    return this.alertModel
      .find({ incidentId: new Types.ObjectId(incidentId) })
      .sort({ timestamp: -1 })
      .exec();
  }

  async findById(id: string): Promise<AlertDocument | null> {
    return this.alertModel.findById(id).exec();
  }
}

