import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditEvent, AuditEventSchema } from './schemas/audit-event.schema';
import { AuditService } from './audit.service';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([{ name: AuditEvent.name, schema: AuditEventSchema }]),
  ],
  providers: [AuditService],
  exports: [AuditService, MongooseModule],
})
export class AuditModule {}

