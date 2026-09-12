import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private isConnected = false;
  private memoryFallback = new Map<string, { value: string; expiresAt: number }>();

  constructor(private configService: ConfigService) {
    const host = this.configService.get<string>('REDIS_HOST', 'localhost');
    const port = Number(this.configService.get<number>('REDIS_PORT', 6379));
    const password = this.configService.get<string>('REDIS_PASSWORD', '');

    try {
      this.client = new Redis({
        host,
        port,
        password: password || undefined,
        maxRetriesPerRequest: 1,
        retryStrategy: (times) => {
          if (times > 3) {
            // Stop aggressive retrying if Redis is down
            return null;
          }
          return Math.min(times * 100, 1000);
        },
        enableOfflineQueue: false,
        lazyConnect: true,
      });

      this.client.on('connect', () => {
        this.isConnected = true;
        this.logger.log(`Redis connected successfully at ${host}:${port}`);
      });

      this.client.on('ready', () => {
        this.isConnected = true;
      });

      this.client.on('error', (err) => {
        this.isConnected = false;
        this.logger.warn(`Redis connection warning: ${err.message}. Gracefully falling back to memory/MongoDB.`);
      });

      this.client.on('close', () => {
        this.isConnected = false;
      });

      // Attempt non-blocking connection
      this.client.connect().catch((err) => {
        this.isConnected = false;
        this.logger.warn(`Redis initial connect failed: ${err.message}. Operating in fallback mode.`);
      });
    } catch (err: any) {
      this.isConnected = false;
      this.logger.warn(`Redis initialization skipped: ${err.message}. Using in-memory fallback.`);
    }
  }

  async get<T>(key: string): Promise<T | null> {
    if (this.isConnected && this.client) {
      try {
        const raw = await this.client.get(key);
        if (!raw) return null;
        return JSON.parse(raw) as T;
      } catch (err: any) {
        this.logger.warn(`Redis GET error for key [${key}]: ${err.message}`);
      }
    }

    // Memory fallback
    const entry = this.memoryFallback.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.memoryFallback.delete(key);
      return null;
    }
    try {
      return JSON.parse(entry.value) as T;
    } catch {
      return null;
    }
  }

  async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
    const serialized = JSON.stringify(value);

    if (this.isConnected && this.client) {
      try {
        if (ttlSeconds && ttlSeconds > 0) {
          await this.client.set(key, serialized, 'EX', ttlSeconds);
        } else {
          await this.client.set(key, serialized);
        }
        return;
      } catch (err: any) {
        this.logger.warn(`Redis SET error for key [${key}]: ${err.message}`);
      }
    }

    // Memory fallback with TTL
    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : Date.now() + 86400 * 1000;
    this.memoryFallback.set(key, { value: serialized, expiresAt });
  }

  async del(key: string): Promise<void> {
    if (this.isConnected && this.client) {
      try {
        await this.client.del(key);
      } catch (err: any) {
        this.logger.warn(`Redis DEL error for key [${key}]: ${err.message}`);
      }
    }
    this.memoryFallback.delete(key);
  }

  async delPattern(pattern: string): Promise<void> {
    if (this.isConnected && this.client) {
      try {
        const keys = await this.client.keys(pattern);
        if (keys.length > 0) {
          await this.client.del(...keys);
        }
      } catch (err: any) {
        this.logger.warn(`Redis delPattern error for pattern [${pattern}]: ${err.message}`);
      }
    }

    // Clear matching regex from memory fallback
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    for (const key of this.memoryFallback.keys()) {
      if (regex.test(key)) {
        this.memoryFallback.delete(key);
      }
    }
  }

  isHealthy(): boolean {
    return this.isConnected;
  }

  getClient(): Redis | null {
    return this.client;
  }

  async onModuleDestroy() {
    if (this.client) {
      try {
        await this.client.quit();
      } catch {
        // ignore on shutdown
      }
    }
  }
}

