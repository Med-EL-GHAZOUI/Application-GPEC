import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmployeeSkill } from '../employee-skills/entities/employee-skill.entity.js';
import { Training } from '../trainings/entities/training.entity.js';
import { PositionSkill } from '../positions/entities/position-skill.entity.js';
import { Skill } from './entities/skill.entity.js';
import { SkillsController } from './skills.controller.js';
import { SkillsService } from './skills.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Skill, PositionSkill, EmployeeSkill, Training]),
  ],
  controllers: [SkillsController],
  providers: [SkillsService],
  exports: [SkillsService],
})
export class SkillsModule {}
