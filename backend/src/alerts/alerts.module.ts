import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Alert, AlertSchema } from './schemas/alert.schema';
import { Incident, IncidentSchema } from '../incidents/schemas/incident.schema';
import { AlertsService } from './alerts.service';
import { AlertsController } from './alerts.controller';
import { AuditModule } from '../audit/audit.module';
import { RedisModule } from '../common/redis/redis.module';
import { IncidentsModule } from '../incidents/incidents.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Alert.name, schema: AlertSchema },
      { name: Incident.name, schema: IncidentSchema },
    ]),
    AuditModule,
    RedisModule,
    IncidentsModule,
  ],
  providers: [AlertsService],
  controllers: [AlertsController],
  exports: [AlertsService, MongooseModule],
})
export class AlertsModule {}
