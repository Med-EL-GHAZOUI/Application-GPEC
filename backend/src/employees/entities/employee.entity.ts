import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { EmployeeStatus } from '../../common/enums/domain.enums.js';
import { Department } from '../../departments/entities/department.entity.js';
import { Position } from '../../positions/entities/position.entity.js';
import { User } from '../../users/entities/user.entity.js';

// Matricule and email are unique among active employees only, so that they
// can be reused once an employee has been (soft) deleted.
@Entity({ name: 'employees' })
@Index('UQ_employees_matricule_active', ['matricule'], {
  unique: true,
  where: '"deleted_at" IS NULL',
})
@Index('UQ_employees_email_active', ['email'], {
  unique: true,
  where: '"deleted_at" IS NULL',
})
@Unique('UQ_employees_user_id', ['userId'])
export class Employee {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 30 })
  matricule: string;

  @Column({ name: 'first_name', type: 'varchar', length: 100 })
  firstName: string;

  @Column({ name: 'last_name', type: 'varchar', length: 100 })
  lastName: string;

  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phone: string | null;

  /** ISO date (YYYY-MM-DD). */
  @Column({ name: 'hire_date', type: 'date' })
  hireDate: string;

  @Column({
    type: 'enum',
    enum: EmployeeStatus,
    enumName: 'employee_status',
    default: EmployeeStatus.Active,
  })
  status: EmployeeStatus;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user: Relation<User> | null;

  @Column({ name: 'department_id', type: 'uuid' })
  departmentId: string;

  @ManyToOne(() => Department, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'department_id' })
  department: Relation<Department>;

  @Column({ name: 'position_id', type: 'uuid', nullable: true })
  positionId: string | null;

  @ManyToOne(() => Position, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'position_id' })
  position: Relation<Position> | null;

  @Column({ name: 'manager_id', type: 'uuid', nullable: true })
  managerId: string | null;

  @ManyToOne(() => Employee, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'manager_id' })
  manager: Relation<Employee> | null;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
