import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
  UpdateDateColumn,
} from 'typeorm';
import { TrainingStatus } from '../../common/enums/domain.enums.js';
import { Skill } from '../../skills/entities/skill.entity.js';

@Entity({ name: 'trainings' })
@Index('IDX_trainings_status', ['status'])
export class Training {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'skill_id', type: 'uuid' })
  skillId: string;

  @ManyToOne(() => Skill, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'skill_id' })
  skill: Relation<Skill>;

  /** Level of the skill the training brings its participants to. */
  @Column({ name: 'target_level', type: 'smallint' })
  targetLevel: number;

  @Column({ name: 'duration_hours', type: 'int' })
  durationHours: number;

  @Column({ type: 'varchar', length: 150, nullable: true })
  provider: string | null;

  /** ISO date (YYYY-MM-DD). */
  @Column({ name: 'start_date', type: 'date', nullable: true })
  startDate: string | null;

  @Column({ type: 'int' })
  capacity: number;

  @Column({
    type: 'enum',
    enum: TrainingStatus,
    enumName: 'training_status',
    default: TrainingStatus.Planned,
  })
  status: TrainingStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
