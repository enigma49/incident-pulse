import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Team, TeamSchema } from './schemas/team.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Incident, IncidentSchema } from '../incidents/schemas/incident.schema';
import { TeamsService } from './teams.service';
import { TeamsController } from './teams.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Team.name, schema: TeamSchema },
      { name: User.name, schema: UserSchema },
      { name: Incident.name, schema: IncidentSchema },
    ]),
  ],
  providers: [TeamsService],
  controllers: [TeamsController],
  exports: [TeamsService, MongooseModule],
})
export class TeamsModule {}
