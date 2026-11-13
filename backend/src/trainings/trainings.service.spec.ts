import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { TrainingsService } from './trainings.service.js';

const SKILL = {
  id: 'skill-1',
  name: 'Angular',
  category: 'TECHNICAL',
  maxLevel: 4,
};

const build = (options: { skill?: object | null; enrolled?: number } = {}) => {
  const trainings = {
    findOne: vi.fn().mockResolvedValue({
      id: 'training-1',
      skillId: SKILL.id,
      skill: SKILL,
      targetLevel: 3,
      capacity: 10,
    }),
    create: vi.fn((data: object) => data),
    save: vi.fn(async (row: object) => ({ id: 'training-1', ...row })),
    remove: vi.fn().mockResolvedValue(undefined),
  };
  const enrollments = {
    count: vi.fn().mockResolvedValue(options.enrolled ?? 0),
  };
  const skills = {
    findOne: vi
      .fn()
      .mockResolvedValue(options.skill === undefined ? SKILL : options.skill),
  };
  const service = new TrainingsService(
    trainings as never,
    enrollments as never,
    skills as never,
  );
  // findOne() after a write re-reads the training and its seat counts.
  vi.spyOn(service, 'countActiveEnrollments').mockResolvedValue(new Map());
  return { service, trainings, enrollments, skills };
};

const dto = {
  title: 'Angular Advanced',
  skillId: SKILL.id,
  targetLevel: 4,
  durationHours: 14,
  capacity: 12,
};

describe('TrainingsService.create', () => {
  it('accepts a target level equal to the skill maximum', async () => {
    const { service, trainings } = build();
    await service.create(dto);
    expect(trainings.save).toHaveBeenCalledOnce();
  });

  it('rejects a target level above the skill maximum', async () => {
    const { service, trainings } = build();

    await expect(
      service.create({ ...dto, targetLevel: 5 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(trainings.save).not.toHaveBeenCalled();
  });

  it('answers 404 for an unknown skill', async () => {
    const { service } = build({ skill: null });
    await expect(service.create(dto)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('stores optional fields as null', async () => {
    const { service, trainings } = build();
    await service.create(dto);
    expect(trainings.save).toHaveBeenCalledWith(
      expect.objectContaining({
        description: null,
        provider: null,
        startDate: null,
      }),
    );
  });
});

describe('TrainingsService.update', () => {
  it('refuses a capacity below the active enrollments', async () => {
    const { service, trainings } = build({ enrolled: 6 });

    await expect(
      service.update('training-1', { capacity: 5 }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(trainings.save).not.toHaveBeenCalled();
  });

  it('accepts a capacity equal to the active enrollments', async () => {
    const { service, trainings } = build({ enrolled: 6 });
    await service.update('training-1', { capacity: 6 });
    expect(trainings.save).toHaveBeenCalledOnce();
  });

  it('revalidates the target level against the skill when it changes', async () => {
    const { service } = build();
    await expect(
      service.update('training-1', { targetLevel: 5 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('TrainingsService.remove', () => {
  it('turns a foreign key violation into a 409 pointing to CANCELLED', async () => {
    const { service, trainings } = build();
    trainings.remove.mockRejectedValue({ driverError: { code: '23503' } });

    await expect(service.remove('training-1')).rejects.toThrow('CANCELLED');
  });

  it('lets unexpected errors through', async () => {
    const { service, trainings } = build();
    trainings.remove.mockRejectedValue(new Error('boom'));

    await expect(service.remove('training-1')).rejects.toThrow('boom');
  });
});
