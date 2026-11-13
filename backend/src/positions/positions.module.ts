import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Department } from '../departments/entities/department.entity.js';
import { Skill } from '../skills/entities/skill.entity.js';
import { PositionSkill } from './entities/position-skill.entity.js';
import { Position } from './entities/position.entity.js';
import { PositionsController } from './positions.controller.js';
import { PositionsService } from './positions.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Position, PositionSkill, Skill, Department]),
  ],
  controllers: [PositionsController],
  providers: [PositionsService],
  exports: [PositionsService],
})
export class PositionsModule {}
