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
import { Employee } from '../../employees/entities/employee.entity.js';
import { Skill } from '../../skills/entities/skill.entity.js';

/**
 * Current level of an employee for a skill (Employee N-N Skill).
 * The full history lives in SkillEvaluation (Phase 11).
 */
@Entity({ name: 'employee_skills' })
@Unique('UQ_employee_skills_employee_skill', ['employeeId', 'skillId'])
export class EmployeeSkill {
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

  @Column({ type: 'smallint' })
  level: number;

  /** ISO date (YYYY-MM-DD) of the assessment. */
  @Column({ name: 'evaluated_at', type: 'date' })
  evaluatedAt: string;

  @Column({ name: 'evaluator_id', type: 'uuid', nullable: true })
  evaluatorId: string | null;

  @ManyToOne(() => Employee, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'evaluator_id' })
  evaluator: Relation<Employee> | null;

  @Column({ type: 'text', nullable: true })
  comment: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
