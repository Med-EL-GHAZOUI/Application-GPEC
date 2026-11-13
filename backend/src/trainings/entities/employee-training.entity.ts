import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
  Unique,
} from 'typeorm';
import { EnrollmentStatus } from '../../common/enums/domain.enums.js';
import { Employee } from '../../employees/entities/employee.entity.js';
import { Training } from './training.entity.js';

/**
 * Enrollment of an employee in a training (Employee N-N Training).
 * One row per pair: a cancelled enrollment is reactivated rather than duplicated.
 */
@Entity({ name: 'employee_trainings' })
@Unique('UQ_employee_trainings_employee_training', ['employeeId', 'trainingId'])
export class EmployeeTraining {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'employee_id', type: 'uuid' })
  employeeId: string;

  @ManyToOne(() => Employee, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee: Relation<Employee>;

  @Column({ name: 'training_id', type: 'uuid' })
  trainingId: string;

  @ManyToOne(() => Training, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'training_id' })
  training: Relation<Training>;

  @Column({
    type: 'enum',
    enum: EnrollmentStatus,
    enumName: 'enrollment_status',
    default: EnrollmentStatus.Enrolled,
  })
  status: EnrollmentStatus;

  @Column({
    name: 'enrolled_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  enrolledAt: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;
}
