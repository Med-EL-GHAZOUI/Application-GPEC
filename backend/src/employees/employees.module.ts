import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Department } from '../departments/entities/department.entity.js';
import { Position } from '../positions/entities/position.entity.js';
import { UsersModule } from '../users/users.module.js';
import { AccessPolicy } from './access-policy.service.js';
import { Employee } from './entities/employee.entity.js';
import { EmployeesController } from './employees.controller.js';
import { EmployeesService } from './employees.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Employee, Department, Position]),
    UsersModule,
  ],
  controllers: [EmployeesController],
  providers: [EmployeesService, AccessPolicy],
  // AccessPolicy is shared with the evaluations and gaps modules (next phases).
  exports: [EmployeesService, AccessPolicy],
})
export class EmployeesModule {}
