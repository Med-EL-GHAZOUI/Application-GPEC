import { ConflictException, NotFoundException } from '@nestjs/common';
import { SkillsService } from './skills.service.js';

const UNIQUE = { driverError: { code: '23505' } };
const FOREIGN_KEY = { driverError: { code: '23503' } };

/** A repository whose query builder answers `MAX(...)` with the given value. */
const maxOf = (max: number | null) => {
  const queryBuilder: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ['select', 'where']) {
    queryBuilder[method] = vi.fn(() => queryBuilder);
  }
  queryBuilder.getRawOne = vi.fn().mockResolvedValue({ max });
  return { createQueryBuilder: vi.fn(() => queryBuilder) };
};

type Levels = {
  required?: number | null;
  held?: number | null;
  target?: number | null;
};

const build = (
  options: Levels & {
    found?: boolean;
    saveError?: unknown;
    removeError?: unknown;
  } = {},
) => {
  const stored = { id: 'skill-1', name: 'Angular', maxLevel: 5 };
  const skills = {
    findOne: vi.fn().mockResolvedValue(options.found === false ? null : stored),
    create: vi.fn((data: object) => data),
    save: vi.fn(async (row: object) => {
      if (options.saveError) {
        throw options.saveError;
      }
      return row;
    }),
    remove: vi.fn(async () => {
      if (options.removeError) {
        throw options.removeError;
      }
    }),
  };
  const service = new SkillsService(
    skills as never,
    maxOf(options.required ?? null) as never,
    maxOf(options.held ?? null) as never,
    maxOf(options.target ?? null) as never,
  );
  return { service, skills };
};

describe('SkillsService.create', () => {
  it('defaults the maximum level to 5 and the description to null', async () => {
    const { service, skills } = build();

    await service.create({ name: 'Docker', category: 'TECHNICAL' as never });

    expect(skills.save).toHaveBeenCalledWith(
      expect.objectContaining({ maxLevel: 5, description: null }),
    );
  });

  it('turns a duplicate name into a 409', async () => {
    const { service } = build({ saveError: UNIQUE });

    await expect(
      service.create({ name: 'Docker', category: 'TECHNICAL' as never }),
    ).rejects.toThrow('already exists');
  });
});

describe('SkillsService.update: the maximum level cannot drop below what is in use', () => {
  it('refuses a level below one that a position requires', async () => {
    const { service, skills } = build({ required: 4 });

    await expect(service.update('skill-1', { maxLevel: 3 })).rejects.toThrow(
      'A position requires level 4',
    );
    expect(skills.save).not.toHaveBeenCalled();
  });

  it('refuses a level below one that an employee holds', async () => {
    const { service } = build({ held: 5 });

    await expect(service.update('skill-1', { maxLevel: 4 })).rejects.toThrow(
      'An employee holds level 5',
    );
  });

  it('refuses a level below the target of a training', async () => {
    const { service } = build({ target: 5 });

    await expect(service.update('skill-1', { maxLevel: 4 })).rejects.toThrow(
      'A training targets level 5',
    );
  });

  it('accepts a level equal to the highest one in use', async () => {
    const { service, skills } = build({ required: 3, held: 4, target: 4 });

    await service.update('skill-1', { maxLevel: 4 });

    expect(skills.save).toHaveBeenCalledOnce();
  });

  it('does not look at any usage when the maximum level is not changed', async () => {
    const { service, skills } = build({ required: 5, held: 5, target: 5 });

    await service.update('skill-1', { description: 'Reworded' });

    expect(skills.save).toHaveBeenCalledOnce();
  });

  it('turns a duplicate name into a 409', async () => {
    const { service } = build({ saveError: UNIQUE });

    await expect(
      service.update('skill-1', { name: 'Taken' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('SkillsService.remove', () => {
  it('refuses a skill that is still used (409)', async () => {
    const { service } = build({ removeError: FOREIGN_KEY });

    await expect(service.remove('skill-1')).rejects.toThrow('still used');
  });

  it('lets an unexpected database error through, unchanged', async () => {
    const { service } = build({ removeError: new Error('connection lost') });

    await expect(service.remove('skill-1')).rejects.toThrow('connection lost');
  });

  it('answers 404 for an unknown skill', async () => {
    const { service } = build({ found: false });

    await expect(service.remove('ghost')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
