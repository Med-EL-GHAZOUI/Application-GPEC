import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Not, Repository } from 'typeorm';
import type { AuthUser } from '../auth/auth-user.type.js';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import {
  EmployeeStatus,
  EnrollmentStatus,
  TrainingStatus,
} from '../common/enums/domain.enums.js';
import { type Page, paginate, toPage } from '../common/pagination/paginate.js';
import { AccessPolicy } from '../employees/access-policy.service.js';
import { Employee } from '../employees/entities/employee.entity.js';
import {
  EmployeeTrainingResponseDto,
  ParticipantResponseDto,
} from './dto/enrollment.dto.js';
import { TrainingSummaryDto } from './dto/training-response.dto.js';
import { EmployeeTraining } from './entities/employee-training.entity.js';
import { Training } from './entities/training.entity.js';
import { TrainingsService } from './trainings.service.js';

/** Allowed moves of an enrollment; COMPLETED and CANCELLED are final. */
export const ENROLLMENT_TRANSITIONS: Record<
  EnrollmentStatus,
  EnrollmentStatus[]
> = {
  [EnrollmentStatus.Enrolled]: [
    EnrollmentStatus.InProgress,
    EnrollmentStatus.Completed,
    EnrollmentStatus.Cancelled,
  ],
  [EnrollmentStatus.InProgress]: [
    EnrollmentStatus.Completed,
    EnrollmentStatus.Cancelled,
  ],
  [EnrollmentStatus.Completed]: [],
  [EnrollmentStatus.Cancelled]: [],
};

@Injectable()
export class EnrollmentsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(EmployeeTraining)
    private readonly enrollments: Repository<EmployeeTraining>,
    @InjectRepository(Employee)
    private readonly employees: Repository<Employee>,
    @InjectRepository(Training)
    private readonly trainings: Repository<Training>,
    private readonly trainingsService: TrainingsService,
    private readonly accessPolicy: AccessPolicy,
  ) {}

  /**
   * Enrolls an employee. The training row is locked for the duration of the
   * transaction, so that two simultaneous enrollments can never exceed the
   * capacity. A cancelled enrollment is reactivated instead of duplicated.
   */
  async enroll(
    trainingId: string,
    employeeId: string,
  ): Promise<ParticipantResponseDto> {
    await this.dataSource.transaction(async (manager) => {
      const training = await manager.findOne(Training, {
        where: { id: trainingId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!training) {
        throw new NotFoundException('Training not found');
      }
      if (training.status !== TrainingStatus.Open) {
        throw new ConflictException('This training is not open for enrollment');
      }

      const employee = await manager.findOne(Employee, {
        where: { id: employeeId },
        select: { id: true, status: true },
      });
      if (!employee) {
        throw new NotFoundException('Employee not found');
      }
      if (employee.status === EmployeeStatus.Inactive) {
        throw new ConflictException('An inactive employee cannot be enrolled');
      }

      const existing = await manager.findOne(EmployeeTraining, {
        where: { trainingId, employeeId },
      });
      if (existing && existing.status !== EnrollmentStatus.Cancelled) {
        throw new ConflictException('The employee is already enrolled');
      }

      const taken = await manager.count(EmployeeTraining, {
        where: { trainingId, status: Not(EnrollmentStatus.Cancelled) },
      });
      if (taken >= training.capacity) {
        throw new ConflictException('This training is full');
      }

      if (existing) {
        existing.status = EnrollmentStatus.Enrolled;
        existing.enrolledAt = new Date();
        existing.completedAt = null;
        await manager.save(existing);
      } else {
        await manager.save(
          manager.create(EmployeeTraining, { trainingId, employeeId }),
        );
      }
    });

    return this.getParticipant(trainingId, employeeId);
  }

  async updateStatus(
    trainingId: string,
    employeeId: string,
    status: EnrollmentStatus,
  ): Promise<ParticipantResponseDto> {
    const enrollment = await this.findEnrollment(trainingId, employeeId);

    if (!ENROLLMENT_TRANSITIONS[enrollment.status].includes(status)) {
      throw new ConflictException(
        `An enrollment ${enrollment.status} cannot become ${status}`,
      );
    }
    enrollment.status = status;
    enrollment.completedAt =
      status === EnrollmentStatus.Completed ? new Date() : null;
    await this.enrollments.save(enrollment);

    return this.getParticipant(trainingId, employeeId);
  }

  async listParticipants(
    trainingId: string,
    query: PaginationQueryDto,
  ): Promise<Page<ParticipantResponseDto>> {
    await this.assertTrainingExists(trainingId);

    const queryBuilder = this.enrollments
      .createQueryBuilder('enrollment')
      .innerJoinAndSelect('enrollment.employee', 'employee')
      .where('enrollment.trainingId = :trainingId', { trainingId })
      .orderBy('employee.lastName', 'ASC')
      .addOrderBy('employee.firstName', 'ASC');

    const page = await paginate(queryBuilder, query);
    return toPage(
      page.data.map((enrollment) => ParticipantResponseDto.from(enrollment)),
      page.total,
      query,
    );
  }

  /** The trainings of one employee, newest enrollment first (within the caller scope). */
  async listForEmployee(
    employeeId: string,
    user: AuthUser,
  ): Promise<EmployeeTrainingResponseDto[]> {
    await this.accessPolicy.assertCanAccessEmployee(user, employeeId);
    if (!(await this.employees.exists({ where: { id: employeeId } }))) {
      throw new NotFoundException('Employee not found');
    }

    const rows = await this.enrollments.find({
      where: { employeeId },
      relations: { training: { skill: true } },
      order: { enrolledAt: 'DESC' },
    });
    const counts = await this.trainingsService.countActiveEnrollments(
      rows.map((row) => row.trainingId),
    );

    return rows.map((row) => ({
      training: TrainingSummaryDto.from(
        row.training,
        counts.get(row.trainingId) ?? 0,
      ),
      status: row.status,
      enrolledAt: row.enrolledAt,
      completedAt: row.completedAt,
    }));
  }

  private async getParticipant(
    trainingId: string,
    employeeId: string,
  ): Promise<ParticipantResponseDto> {
    const enrollment = await this.enrollments.findOneOrFail({
      where: { trainingId, employeeId },
      relations: { employee: true },
    });
    return ParticipantResponseDto.from(enrollment);
  }

  private async findEnrollment(
    trainingId: string,
    employeeId: string,
  ): Promise<EmployeeTraining> {
    const enrollment = await this.enrollments.findOne({
      where: { trainingId, employeeId },
    });
    if (!enrollment) {
      throw new NotFoundException('Enrollment not found');
    }
    return enrollment;
  }

  private async assertTrainingExists(trainingId: string): Promise<void> {
    if (!(await this.trainings.exists({ where: { id: trainingId } }))) {
      throw new NotFoundException('Training not found');
    }
  }
}
