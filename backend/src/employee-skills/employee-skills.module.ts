import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmployeesModule } from '../employees/employees.module.js';
import { Employee } from '../employees/entities/employee.entity.js';
import { EvaluationsModule } from '../evaluations/evaluations.module.js';
import { EmployeeSkillsController } from './employee-skills.controller.js';
import { EmployeeSkillsService } from './employee-skills.service.js';
import { EmployeeSkill } from './entities/employee-skill.entity.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([EmployeeSkill, Employee]),
    EmployeesModule,
    EvaluationsModule,
  ],
  controllers: [EmployeeSkillsController],
  providers: [EmployeeSkillsService],
  exports: [EmployeeSkillsService],
})
export class EmployeeSkillsModule {}
