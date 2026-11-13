import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module.js';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard.js';
import { RolesGuard } from './auth/guards/roles.guard.js';
import { configuration, type AppConfig } from './config/configuration.js';
import { validateEnv } from './config/env.validation.js';
import { buildTypeOrmOptions } from './database/typeorm.options.js';
import { DepartmentsModule } from './departments/departments.module.js';
import { EmployeesModule } from './employees/employees.module.js';
import { HealthModule } from './health/health.module.js';
import { PositionsModule } from './positions/positions.module.js';
import { SkillsModule } from './skills/skills.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        ...buildTypeOrmOptions(config.get('database', { infer: true })),
        autoLoadEntities: true,
      }),
    }),
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 100 }],
      // Test runs only: lets e2e suites log in freely. Ignored in any other environment.
      skipIf: () =>
        process.env.NODE_ENV === 'test' &&
        process.env.THROTTLE_DISABLED === 'true',
    }),
    UsersModule,
    AuthModule,
    DepartmentsModule,
    SkillsModule,
    PositionsModule,
    EmployeesModule,
    HealthModule,
  ],
  providers: [
    // Order matters: throttle first, then authenticate, then authorize.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
