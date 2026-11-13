import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Skill } from '../../skills/entities/skill.entity.js';
import { Position } from './position.entity.js';

/** Join entity Position N-N Skill carrying the minimum level required by the position. */
@Entity({ name: 'position_skills' })
@Unique('UQ_position_skills_position_skill', ['positionId', 'skillId'])
export class PositionSkill {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'position_id', type: 'uuid' })
  positionId: string;

  @ManyToOne(() => Position, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'position_id' })
  position: Relation<Position>;

  @Column({ name: 'skill_id', type: 'uuid' })
  skillId: string;

  @ManyToOne(() => Skill, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'skill_id' })
  skill: Relation<Skill>;

  @Column({ name: 'required_level', type: 'smallint' })
  requiredLevel: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
