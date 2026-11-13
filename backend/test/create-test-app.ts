import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter.js';

/**
 * Boots the real application the same way main.ts does, on the real database.
 * Rate limiting is off by default so that suites can log in freely.
 */
export const createTestApp = async (
  options: { throttling?: boolean } = {},
): Promise<INestApplication> => {
  const { throttling = false } = options;
  process.env.THROTTLE_DISABLED = throttling ? 'false' : 'true';
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();

  await app.get(DataSource).runMigrations();
  return app;
};
