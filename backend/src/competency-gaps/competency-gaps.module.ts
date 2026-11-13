import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmployeeSkill } from '../employee-skills/entities/employee-skill.entity.js';
import { EmployeesModule } from '../employees/employees.module.js';
import { Employee } from '../employees/entities/employee.entity.js';
import { PositionSkill } from '../positions/entities/position-skill.entity.js';
import { CompetencyGapsController } from './competency-gaps.controller.js';
import { CompetencyGapsService } from './competency-gaps.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Employee, PositionSkill, EmployeeSkill]),
    EmployeesModule,
  ],
  controllers: [CompetencyGapsController],
  providers: [CompetencyGapsService],
  // Reused by the training recommendations and the dashboard (next phases).
  exports: [CompetencyGapsService],
})
export class CompetencyGapsModule {}
