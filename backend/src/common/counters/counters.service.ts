import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Counter, CounterDocument } from './counter.schema';

const INCIDENT_COUNTER_ID = 'incident';

@Injectable()
export class CountersService {
  constructor(
    @InjectModel(Counter.name) private counterModel: Model<CounterDocument>,
  ) {}

  async getNextIncidentNumber(): Promise<number> {
    const result = await this.counterModel
      .findByIdAndUpdate(
        INCIDENT_COUNTER_ID,
        { $inc: { seq: 1 } },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      )
      .exec();

    return result.seq;
  }

  async syncIncidentCounterToAtLeast(minValue: number): Promise<void> {
    await this.counterModel
      .findByIdAndUpdate(
        INCIDENT_COUNTER_ID,
        { $max: { seq: minValue } },
        { upsert: true, setDefaultsOnInsert: true },
      )
      .exec();
  }
}
