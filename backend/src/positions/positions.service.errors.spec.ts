import { ConflictException, NotFoundException } from '@nestjs/common';
import { PositionsService } from './positions.service.js';

const build = (
  options: {
    departmentExists?: boolean;
    saveError?: unknown;
    removeError?: unknown;
  } = {},
) => {
  const stored = {
    id: 'position-1',
    title: 'Engineer',
    departmentId: 'department-1',
    department: {},
  };
  const positions = {
    findOne: vi.fn().mockResolvedValue(stored),
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
  const departments = {
    exists: vi.fn().mockResolvedValue(options.departmentExists ?? true),
  };
  const service = new PositionsService(
    positions as never,
    {} as never,
    {} as never,
    departments as never,
  );
  return { service, positions, stored };
};

describe('PositionsService.update', () => {
  it('moves the position to another department', async () => {
    const { service, positions } = build();

    await service.update('position-1', { departmentId: 'department-2' });

    expect(positions.save).toHaveBeenCalledWith(
      expect.objectContaining({ departmentId: 'department-2' }),
    );
  });

  it('answers 404 when the target department does not exist, without saving', async () => {
    const { service, positions } = build({ departmentExists: false });

    await expect(
      service.update('position-1', { departmentId: 'ghost' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(positions.save).not.toHaveBeenCalled();
  });

  it('does not check any department when none is given', async () => {
    const { service, positions } = build({ departmentExists: false });

    await service.update('position-1', { title: 'Senior Engineer' });

    expect(positions.save).toHaveBeenCalledOnce();
  });

  it('turns a unique violation (same title in the department) into a 409', async () => {
    const { service } = build({
      saveError: { driverError: { code: '23505' } },
    });

    await expect(
      service.update('position-1', { title: 'Taken' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('PositionsService.remove', () => {
  it('turns a foreign key violation (still assigned) into a 409', async () => {
    const { service } = build({
      removeError: { driverError: { code: '23503' } },
    });

    await expect(service.remove('position-1')).rejects.toThrow(
      'still assigned',
    );
  });

  it('lets any other error through, unchanged', async () => {
    const { service } = build({ removeError: new Error('boom') });

    await expect(service.remove('position-1')).rejects.toThrow('boom');
  });
});
