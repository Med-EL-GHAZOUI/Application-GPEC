import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmployeesModule } from '../employees/employees.module.js';
import { Employee } from '../employees/entities/employee.entity.js';
import { Skill } from '../skills/entities/skill.entity.js';
import { SkillEvaluation } from './entities/skill-evaluation.entity.js';
import { EvaluationsController } from './evaluations.controller.js';
import { EvaluationsService } from './evaluations.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([SkillEvaluation, Employee, Skill]),
    EmployeesModule,
  ],
  controllers: [EvaluationsController],
  providers: [EvaluationsService],
  exports: [EvaluationsService],
})
export class EvaluationsModule {}
