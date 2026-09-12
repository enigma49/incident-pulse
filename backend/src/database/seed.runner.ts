import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { SeedService } from './seed.service';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const logger = new Logger('SeedRunner');
  logger.log('Bootstrapping application context for database seed...');

  const app = await NestFactory.createApplicationContext(AppModule);
  const seedService = app.get(SeedService);

  const force = process.argv.includes('--force');
  await seedService.seed(force);

  logger.log('Seed execution finished.');
  await app.close();
  process.exit(0);
}

bootstrap().catch((err) => {
  console.error('Fatal seed error:', err);
  process.exit(1);
});

