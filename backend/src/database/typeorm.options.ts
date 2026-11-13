import type { DataSourceOptions } from 'typeorm';
import type { AppConfig } from '../config/configuration.js';
import { migrations } from './migrations/index.js';

/**
 * Connection options shared by the Nest application and the TypeORM CLI.
 * `synchronize` is always off: schema changes go through migrations.
 * Entities are registered by the Nest app through `autoLoadEntities`
 * and by the CLI through a glob (see data-source.ts).
 */
export const buildTypeOrmOptions = (
  database: AppConfig['database'],
): DataSourceOptions => ({
  type: 'postgres',
  host: database.host,
  port: database.port,
  username: database.username,
  password: database.password,
  database: database.name,
  synchronize: false,
  migrationsRun: false,
  migrations,
});
