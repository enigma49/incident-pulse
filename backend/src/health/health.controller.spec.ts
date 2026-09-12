import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { RedisService } from '../common/redis/redis.service';
import { getConnectionToken } from '@nestjs/mongoose';

describe('HealthController', () => {
  let controller: HealthController;
  let mockConnection: any;
  let mockRedisService: Partial<RedisService>;

  beforeEach(async () => {
    mockConnection = {
      readyState: 1, // connected
      name: 'incident_platform',
    };

    mockRedisService = {
      isHealthy: jest.fn().mockReturnValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: getConnectionToken(),
          useValue: mockConnection,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should return overall status "ok" when MongoDB and Redis are healthy', () => {
    const health = controller.getHealth();

    expect(health.status).toBe('ok');
    expect(health.database.status).toBe('connected');
    expect(health.redis.status).toBe('connected');
    expect(health).toHaveProperty('uptime');
    expect(health).toHaveProperty('timestamp');
  });

  it('should return overall status "degraded" when Redis is offline but MongoDB is connected', () => {
    mockRedisService.isHealthy = jest.fn().mockReturnValue(false);

    const health = controller.getHealth();

    expect(health.status).toBe('degraded');
    expect(health.database.status).toBe('connected');
    expect(health.redis.status).toBe('degraded-memory-fallback');
  });

  it('should return overall status "unhealthy" when MongoDB is disconnected', () => {
    mockConnection.readyState = 0; // disconnected

    const health = controller.getHealth();

    expect(health.status).toBe('unhealthy');
    expect(health.database.status).toBe('disconnected');
  });
});

