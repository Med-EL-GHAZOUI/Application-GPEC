import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  EmployeeStatus,
  EnrollmentStatus,
  TrainingStatus,
} from '../common/enums/domain.enums.js';
import { EmployeeTraining } from './entities/employee-training.entity.js';
import {
  ENROLLMENT_TRANSITIONS,
  EnrollmentsService,
} from './enrollments.service.js';

const TRAINING_ID = 'training-1';
const EMPLOYEE_ID = 'employee-1';

type Setup = {
  training?: { status: TrainingStatus; capacity: number } | null;
  employee?: { id: string; status: EmployeeStatus } | null;
  existing?: { status: EnrollmentStatus } | null;
  taken?: number;
};

const build = (setup: Setup = {}) => {
  const training =
    setup.training === undefined
      ? { id: TRAINING_ID, status: TrainingStatus.Open, capacity: 2 }
      : setup.training;
  const employee =
    setup.employee === undefined
      ? { id: EMPLOYEE_ID, status: EmployeeStatus.Active }
      : setup.employee;

  // Fake transaction manager: answers the reads and records the writes.
  const manager = {
    findOne: vi.fn(async (entity: unknown) => {
      if (entity === EmployeeTraining) {
        return setup.existing ?? null;
      }
      return entity === Object(entity) && 'name' in (entity as object)
        ? (entity as { name: string }).name === 'Training'
          ? training
          : employee
        : null;
    }),
    count: vi.fn().mockResolvedValue(setup.taken ?? 0),
    create: vi.fn((_entity: unknown, data: object) => ({ ...data })),
    save: vi.fn(async (row: object) => row),
  };
  const dataSource = {
    transaction: vi.fn(async (work: (m: typeof manager) => unknown) =>
      work(manager),
    ),
  };
  const enrollments = {
    findOneOrFail: vi.fn().mockResolvedValue({
      employee: { id: EMPLOYEE_ID, firstName: 'A', lastName: 'B' },
      status: EnrollmentStatus.Enrolled,
      enrolledAt: new Date(),
      completedAt: null,
    }),
    findOne: vi.fn(),
    save: vi.fn(async (row: object) => row),
  };

  const service = new EnrollmentsService(
    dataSource as never,
    enrollments as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { service, manager, dataSource, enrollments };
};

describe('EnrollmentsService.enroll', () => {
  it('enrolls an employee in an open training with a free seat', async () => {
    const { service, manager } = build({ taken: 1 });

    await service.enroll(TRAINING_ID, EMPLOYEE_ID);

    expect(manager.save).toHaveBeenCalledWith({
      trainingId: TRAINING_ID,
      employeeId: EMPLOYEE_ID,
    });
  });

  it('locks the training row so that concurrent enrollments cannot exceed the capacity', async () => {
    const { service, manager } = build();

    await service.enroll(TRAINING_ID, EMPLOYEE_ID);

    const lockedRead = manager.findOne.mock.calls.find(
      ([, options]) => (options as { lock?: unknown })?.lock,
    );
    expect(lockedRead?.[1]).toMatchObject({
      lock: { mode: 'pessimistic_write' },
    });
  });

  it.each([
    TrainingStatus.Planned,
    TrainingStatus.InProgress,
    TrainingStatus.Completed,
    TrainingStatus.Cancelled,
  ])(
    'refuses a training that is %s (only OPEN accepts enrollments)',
    async (status) => {
      const { service, manager } = build({ training: { status, capacity: 5 } });

      await expect(service.enroll(TRAINING_ID, EMPLOYEE_ID)).rejects.toThrow(
        'not open',
      );
      expect(manager.save).not.toHaveBeenCalled();
    },
  );

  it('refuses a full training', async () => {
    const { service, manager } = build({ taken: 2 });

    await expect(service.enroll(TRAINING_ID, EMPLOYEE_ID)).rejects.toThrow(
      'full',
    );
    expect(manager.save).not.toHaveBeenCalled();
  });

  it.each([
    EnrollmentStatus.Enrolled,
    EnrollmentStatus.InProgress,
    EnrollmentStatus.Completed,
  ])('refuses a second enrollment when the first is %s', async (status) => {
    const { service } = build({ existing: { status } });

    await expect(
      service.enroll(TRAINING_ID, EMPLOYEE_ID),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('reactivates a cancelled enrollment instead of creating a duplicate', async () => {
    const existing = {
      status: EnrollmentStatus.Cancelled,
      completedAt: new Date(),
    };
    const { service, manager } = build({ existing });

    await service.enroll(TRAINING_ID, EMPLOYEE_ID);

    expect(existing).toMatchObject({
      status: EnrollmentStatus.Enrolled,
      completedAt: null,
    });
    expect(manager.save).toHaveBeenCalledWith(existing);
    expect(manager.create).not.toHaveBeenCalled();
  });

  it('refuses an inactive employee', async () => {
    const { service } = build({
      employee: { id: EMPLOYEE_ID, status: EmployeeStatus.Inactive },
    });

    await expect(service.enroll(TRAINING_ID, EMPLOYEE_ID)).rejects.toThrow(
      'inactive',
    );
  });

  it('answers 404 for an unknown training or employee', async () => {
    await expect(
      build({ training: null }).service.enroll(TRAINING_ID, EMPLOYEE_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      build({ employee: null }).service.enroll(TRAINING_ID, EMPLOYEE_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('EnrollmentsService.updateStatus', () => {
  const withEnrollment = (status: EnrollmentStatus) => {
    const built = build();
    const enrollment = { status, completedAt: null as Date | null };
    built.enrollments.findOne.mockResolvedValue(enrollment);
    return { ...built, enrollment };
  };

  it.each([
    [EnrollmentStatus.Enrolled, EnrollmentStatus.InProgress],
    [EnrollmentStatus.Enrolled, EnrollmentStatus.Completed],
    [EnrollmentStatus.Enrolled, EnrollmentStatus.Cancelled],
    [EnrollmentStatus.InProgress, EnrollmentStatus.Completed],
    [EnrollmentStatus.InProgress, EnrollmentStatus.Cancelled],
  ])('allows %s -> %s', async (from, to) => {
    const { service, enrollment } = withEnrollment(from);
    await service.updateStatus(TRAINING_ID, EMPLOYEE_ID, to);
    expect(enrollment.status).toBe(to);
  });

  it.each([
    [EnrollmentStatus.InProgress, EnrollmentStatus.Enrolled],
    [EnrollmentStatus.Completed, EnrollmentStatus.Cancelled],
    [EnrollmentStatus.Completed, EnrollmentStatus.InProgress],
    [EnrollmentStatus.Cancelled, EnrollmentStatus.Enrolled],
    [EnrollmentStatus.Cancelled, EnrollmentStatus.Completed],
  ])('refuses %s -> %s', async (from, to) => {
    const { service, enrollments } = withEnrollment(from);

    await expect(
      service.updateStatus(TRAINING_ID, EMPLOYEE_ID, to),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(enrollments.save).not.toHaveBeenCalled();
  });

  it('stamps the completion date, and only then', async () => {
    const completed = withEnrollment(EnrollmentStatus.InProgress);
    await completed.service.updateStatus(
      TRAINING_ID,
      EMPLOYEE_ID,
      EnrollmentStatus.Completed,
    );
    expect(completed.enrollment.completedAt).toBeInstanceOf(Date);

    const cancelled = withEnrollment(EnrollmentStatus.Enrolled);
    await cancelled.service.updateStatus(
      TRAINING_ID,
      EMPLOYEE_ID,
      EnrollmentStatus.Cancelled,
    );
    expect(cancelled.enrollment.completedAt).toBeNull();
  });

  it('answers 404 for an unknown enrollment', async () => {
    const { service, enrollments } = build();
    enrollments.findOne.mockResolvedValue(null);

    await expect(
      service.updateStatus(
        TRAINING_ID,
        EMPLOYEE_ID,
        EnrollmentStatus.Completed,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('keeps COMPLETED and CANCELLED final', () => {
    expect(ENROLLMENT_TRANSITIONS[EnrollmentStatus.Completed]).toEqual([]);
    expect(ENROLLMENT_TRANSITIONS[EnrollmentStatus.Cancelled]).toEqual([]);
  });
});
