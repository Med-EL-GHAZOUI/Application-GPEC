import type { DataSourceOptions } from 'typeorm';
import type { AppConfig } from '../config/configuration.js';

/**
 * Single source of truth for the TypeORM connection, shared by the Nest
 * application and the TypeORM CLI (migrations).
 * `synchronize` is always off: schema changes go through migrations.
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
  entities: [`${import.meta.dirname}/../**/*.entity.{ts,js}`],
  migrations: [`${import.meta.dirname}/migrations/*.{ts,js}`],
});
