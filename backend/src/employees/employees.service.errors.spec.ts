import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { UsersService } from '../users/users.service.js';
import type { AccessPolicy } from './access-policy.service.js';
import { EmployeesService } from './employees.service.js';

const dto = {
  matricule: 'E1',
  firstName: 'A',
  lastName: 'B',
  email: 'a@b.co',
  hireDate: '2024-01-01',
  departmentId: 'department-1',
};

const build = (
  options: {
    saveError?: unknown;
    user?: object | null;
    owner?: object | null;
  } = {},
) => {
  const employees = {
    findOne: vi.fn().mockResolvedValue(options.owner ?? null),
    exists: vi.fn().mockResolvedValue(true),
    create: vi.fn((data: object) => data),
    save: vi.fn(async (row: object) => {
      if (options.saveError) {
        throw options.saveError;
      }
      return { id: 'employee-1', ...row };
    }),
  };
  const usersService = {
    findById: vi
      .fn()
      .mockResolvedValue(
        options.user === undefined ? { id: 'user-1' } : options.user,
      ),
  };
  const service = new EmployeesService(
    employees as never,
    { exists: vi.fn().mockResolvedValue(true) } as never,
    { exists: vi.fn().mockResolvedValue(true) } as never,
    usersService as unknown as UsersService,
    {} as unknown as AccessPolicy,
  );
  return { service, employees };
};

describe('EmployeesService.create: database errors', () => {
  it('turns a unique violation (a concurrent duplicate) into a 409', async () => {
    const { service } = build({
      saveError: { driverError: { code: '23505' } },
    });

    await expect(service.create(dto)).rejects.toBeInstanceOf(ConflictException);
  });

  it('turns a foreign key violation (a record deleted meanwhile) into a 400', async () => {
    const { service } = build({
      saveError: { driverError: { code: '23503' } },
    });

    await expect(service.create(dto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('lets any other error through, unchanged', async () => {
    const { service } = build({ saveError: new Error('connection lost') });

    await expect(service.create(dto)).rejects.toThrow('connection lost');
  });
});

describe('EmployeesService.create: login account', () => {
  it('answers 404 when the account does not exist', async () => {
    const { service, employees } = build({ user: null });

    await expect(
      service.create({ ...dto, userId: 'ghost' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(employees.save).not.toHaveBeenCalled();
  });

  it('answers 409 when the account already belongs to another employee', async () => {
    const { service, employees } = build({ owner: { id: 'someone-else' } });

    await expect(service.create({ ...dto, userId: 'user-1' })).rejects.toThrow(
      'already linked',
    );
    expect(employees.save).not.toHaveBeenCalled();
  });
});
