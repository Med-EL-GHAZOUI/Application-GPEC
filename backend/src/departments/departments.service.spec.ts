import { ConflictException, NotFoundException } from '@nestjs/common';
import { DepartmentsService } from './departments.service.js';

const UNIQUE = { driverError: { code: '23505' } };
const FOREIGN_KEY = { driverError: { code: '23503' } };

const build = (
  options: { found?: boolean; saveError?: unknown; removeError?: unknown } = {},
) => {
  const stored = { id: 'department-1', name: 'IT', description: null };
  const departments = {
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
  return { service: new DepartmentsService(departments as never), departments };
};

describe('DepartmentsService', () => {
  it('stores a missing description as null', async () => {
    const { service, departments } = build();

    await service.create({ name: 'Finance' });

    expect(departments.save).toHaveBeenCalledWith({
      name: 'Finance',
      description: null,
    });
  });

  it('turns a duplicate name into a 409, on creation and on update', async () => {
    const created = build({ saveError: UNIQUE }).service.create({ name: 'IT' });
    const updated = build({ saveError: UNIQUE }).service.update(
      'department-1',
      { name: 'IT' },
    );

    await expect(created).rejects.toBeInstanceOf(ConflictException);
    await expect(updated).rejects.toThrow('already exists');
  });

  it('refuses to delete a department still in use (409)', async () => {
    const { service } = build({ removeError: FOREIGN_KEY });

    await expect(service.remove('department-1')).rejects.toThrow('still used');
  });

  it('lets an unexpected database error through, unchanged', async () => {
    const { service } = build({ removeError: new Error('connection lost') });

    await expect(service.remove('department-1')).rejects.toThrow(
      'connection lost',
    );
  });

  it('answers 404 for an unknown department', async () => {
    const { service } = build({ found: false });

    await expect(service.findOne('ghost')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.update('ghost', { name: 'x' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.remove('ghost')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
