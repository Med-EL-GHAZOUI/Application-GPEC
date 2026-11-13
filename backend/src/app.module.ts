import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { configuration, type AppConfig } from './config/configuration.js';
import { validateEnv } from './config/env.validation.js';
import { buildTypeOrmOptions } from './database/typeorm.options.js';
import { HealthModule } from './health/health.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) =>
        buildTypeOrmOptions(config.get('database', { infer: true })),
    }),
    HealthModule,
  ],
})
export class AppModule {}
