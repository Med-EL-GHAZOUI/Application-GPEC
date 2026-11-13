import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmployeesModule } from '../employees/employees.module.js';
import { Employee } from '../employees/entities/employee.entity.js';
import { Skill } from '../skills/entities/skill.entity.js';
import { EnrollmentsService } from './enrollments.service.js';
import { EmployeeTraining } from './entities/employee-training.entity.js';
import { Training } from './entities/training.entity.js';
import { TrainingRecommendationsService } from './training-recommendations.service.js';
import { TrainingsController } from './trainings.controller.js';
import { TrainingsService } from './trainings.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Training, EmployeeTraining, Skill, Employee]),
    EmployeesModule,
  ],
  controllers: [TrainingsController],
  providers: [
    TrainingsService,
    EnrollmentsService,
    TrainingRecommendationsService,
  ],
  // Recommendations are consumed by the competency gaps module.
  exports: [TrainingRecommendationsService, TrainingsService],
})
export class TrainingsModule {}
