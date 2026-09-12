import { Controller, Get } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { RedisService } from '../common/redis/redis.service';

@Controller('health')
export class HealthController {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly redisService: RedisService,
  ) {}

  @Get()
  getHealth() {
    // Mongoose readyState: 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
    const mongoStateMap: Record<number, string> = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting',
    };
    const mongoStatus = mongoStateMap[this.connection.readyState] || 'unknown';
    const isMongoOk = this.connection.readyState === 1;

    const isRedisOk = this.redisService.isHealthy();
    const redisStatus = isRedisOk ? 'connected' : 'degraded-memory-fallback';

    const overallStatus = isMongoOk ? (isRedisOk ? 'ok' : 'degraded') : 'unhealthy';

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      database: {
        status: mongoStatus,
        name: this.connection.name,
      },
      redis: {
        status: redisStatus,
      },
      system: {
        memoryUsage: process.memoryUsage(),
        nodeVersion: process.version,
      },
    };
  }
}

