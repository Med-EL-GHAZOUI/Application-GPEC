import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { Employee } from '../../employees/entities/employee.entity.js';
import { Skill } from '../../skills/entities/skill.entity.js';

/**
 * One assessment of an employee for a skill. Append-only: rows are never
 * updated or deleted through the API, so the progression stays traceable
 * (2026: Angular 3, 2027: Angular 4).
 */
@Entity({ name: 'skill_evaluations' })
export class SkillEvaluation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'employee_id', type: 'uuid' })
  employeeId: string;

  @ManyToOne(() => Employee, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee: Relation<Employee>;

  @Column({ name: 'skill_id', type: 'uuid' })
  skillId: string;

  @ManyToOne(() => Skill, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'skill_id' })
  skill: Relation<Skill>;

  /** Null when the assessment was made by an account without employee record. */
  @Column({ name: 'evaluator_id', type: 'uuid', nullable: true })
  evaluatorId: string | null;

  @ManyToOne(() => Employee, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'evaluator_id' })
  evaluator: Relation<Employee> | null;

  @Column({ type: 'smallint' })
  level: number;

  /** ISO date (YYYY-MM-DD) the assessment refers to. */
  @Column({ name: 'evaluated_at', type: 'date' })
  evaluatedAt: string;

  @Column({ type: 'text', nullable: true })
  comment: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
