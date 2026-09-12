import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CountersService } from '../common/counters/counters.service';
import { Incident, IncidentDocument } from './schemas/incident.schema';
import { isObjectIdRef, parseIncidentDisplayId } from './incident-id.util';
import {
  correlationKeyForServices,
  mergeServices,
  primaryService,
} from './incident-services.util';

@Injectable()
export class IncidentRefService implements OnModuleInit {
  private readonly logger = new Logger(IncidentRefService.name);

  constructor(
    @InjectModel(Incident.name) private incidentModel: Model<IncidentDocument>,
    private countersService: CountersService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.backfillMissingCorrelationFields();
    await this.backfillMissingNumbers();
  }

  async getNextIncidentNumber(): Promise<number> {
    return this.countersService.getNextIncidentNumber();
  }

  async findByRef(ref: string): Promise<IncidentDocument | null> {
    const incidentNumber = parseIncidentDisplayId(ref);
    if (incidentNumber !== null) {
      return this.incidentModel.findOne({ incidentNumber }).exec();
    }

    if (isObjectIdRef(ref)) {
      return this.incidentModel.findById(ref).exec();
    }

    return null;
  }

  async findByRefOrThrow(ref: string): Promise<IncidentDocument> {
    const incident = await this.findByRef(ref);
    if (!incident) {
      throw new NotFoundException(`Incident ${ref} not found`);
    }

    return incident;
  }

  async backfillMissingNumbers(): Promise<void> {
    const missing = await this.incidentModel
      .find({ $or: [{ incidentNumber: { $exists: false } }, { incidentNumber: null }] })
      .sort({ createdAt: 1 })
      .exec();

    if (missing.length === 0) {
      return;
    }

    this.logger.log(`Backfilling incidentNumber for ${missing.length} incident(s)...`);

    for (const incident of missing) {
      const incidentNumber = await this.countersService.getNextIncidentNumber();
      await this.incidentModel.updateOne(
        { _id: incident._id },
        { $set: { incidentNumber } },
      );
    }

    this.logger.log(`Backfilled incidentNumber for ${missing.length} incident(s).`);
  }

  async backfillMissingCorrelationFields(): Promise<void> {
    const missing = await this.incidentModel
      .find({
        $or: [
          { correlationKey: { $exists: false } },
          { correlationKey: null },
          { correlationKey: '' },
          { services: { $exists: false } },
          { services: { $size: 0 } },
          { services: null },
        ],
      })
      .sort({ createdAt: 1 })
      .exec();

    if (missing.length === 0) {
      return;
    }

    this.logger.log(`Backfilling correlation/services fields for ${missing.length} incident(s)...`);

    for (const incident of missing as any[]) {
      const services = mergeServices(
        incident.services,
        incident.service,
        ...(Array.isArray(incident.affectedServices) ? incident.affectedServices : []),
      );
      const resolved =
        services.length > 0 ? services : [primaryService(services) || 'unknown-service'];

      const finalServices = resolved.length > 0 ? resolved : ['unknown-service'];
      const correlationKey = incident.correlationKey || correlationKeyForServices(finalServices);

      await this.incidentModel.updateOne(
        { _id: incident._id },
        {
          $set: {
            services: finalServices,
            correlationKey,
          },
          $unset: {
            service: '',
            affectedServices: '',
          },
        },
      );
    }

    this.logger.log(`Backfilled correlation/services fields for ${missing.length} incident(s).`);
  }
}
