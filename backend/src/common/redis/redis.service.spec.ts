import { ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service';

describe('RedisService Fallback Behavior', () => {
  let redisService: RedisService;
  let configService: any;

  beforeEach(() => {
    configService = {
      get: jest.fn((key: string, defaultVal?: any) => defaultVal),
    };
    // Initialize with unreachable host so it tests fallback path safely
    redisService = new RedisService(configService);
  });

  afterEach(async () => {
    await redisService.onModuleDestroy();
  });

  it('should initialize and report degraded/fallback mode when Redis is offline', () => {
    expect(redisService).toBeDefined();
    expect(redisService.isHealthy()).toBe(false);
  });

  it('should write and read from fallback memory storage transparently', async () => {
    const testKey = 'incident:123:detail';
    const testData = { id: '123', title: 'Latency Spike', severity: 'P1' };

    await redisService.set(testKey, testData, 60);
    const retrieved = await redisService.get(testKey);

    expect(retrieved).toEqual(testData);
  });

  it('should return null for non-existent or expired keys', async () => {
    const nonExistent = await redisService.get('random:key');
    expect(nonExistent).toBeNull();
  });

  it('should delete keys from fallback store', async () => {
    await redisService.set('temp:key', { data: 'test' });
    await redisService.del('temp:key');

    const result = await redisService.get('temp:key');
    expect(result).toBeNull();
  });

  it('should invalidate wildcard patterns in fallback store', async () => {
    await redisService.set('incident:101:detail', { id: 101 });
    await redisService.set('incident:102:detail', { id: 102 });
    await redisService.set('dashboard:overview', { count: 2 });

    await redisService.delPattern('incident:*');

    expect(await redisService.get('incident:101:detail')).toBeNull();
    expect(await redisService.get('incident:102:detail')).toBeNull();
    expect(await redisService.get('dashboard:overview')).toBeDefined();
  });
});

