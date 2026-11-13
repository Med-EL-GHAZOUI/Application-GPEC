import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user.type.js';
import { Role } from '../common/enums/role.enum.js';
import type { UsersService } from '../users/users.service.js';
import type { AccessPolicy } from './access-policy.service.js';
import { EmployeesService } from './employees.service.js';

type Row = { id: string; managerId: string | null; userId?: string | null };

const build = (rows: Row[] = []) => {
  const byId = (id: string) => rows.find((row) => row.id === id) ?? null;

  const queryBuilder: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of [
    'leftJoinAndSelect',
    'orderBy',
    'addOrderBy',
    'andWhere',
    'skip',
    'take',
  ]) {
    queryBuilder[method] = vi.fn(() => queryBuilder);
  }
  queryBuilder.getManyAndCount = vi.fn().mockResolvedValue([[], 0]);

  const employees = {
    findOne: vi.fn(async ({ where }: { where: { id?: string } }) =>
      where.id ? byId(where.id) : null,
    ),
    exists: vi.fn(
      async ({ where }: { where: { id: string } }) => byId(where.id) !== null,
    ),
    count: vi.fn().mockResolvedValue(0),
    update: vi.fn().mockResolvedValue(undefined),
    softDelete: vi.fn().mockResolvedValue(undefined),
    save: vi.fn(async (entity: unknown) => entity),
    create: vi.fn((entity: unknown) => entity),
    createQueryBuilder: vi.fn(() => queryBuilder),
  };
  const departments = { exists: vi.fn().mockResolvedValue(true) };
  const positions = { exists: vi.fn().mockResolvedValue(true) };
  const usersService = {
    deactivate: vi.fn().mockResolvedValue(undefined),
    findById: vi.fn().mockResolvedValue({ id: 'user-1' }),
  };
  const accessPolicy = {
    findEmployeeIdByUserId: vi.fn().mockResolvedValue(null),
    assertCanAccessEmployee: vi.fn().mockResolvedValue(undefined),
  };

  const service = new EmployeesService(
    employees as never,
    departments as never,
    positions as never,
    usersService as unknown as UsersService,
    accessPolicy as unknown as AccessPolicy,
  );
  return {
    service,
    employees,
    departments,
    usersService,
    accessPolicy,
    queryBuilder,
  };
};

const manager: AuthUser = {
  id: 'user-m',
  email: 'm@company.com',
  role: Role.Manager,
};

describe('EmployeesService', () => {
  describe('manager assignment (R6)', () => {
    it('rejects an employee set as their own manager', async () => {
      const { service } = build([{ id: 'a', managerId: null }]);
      await expect(
        service.update('a', { managerId: 'a' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an assignment that closes a management cycle', async () => {
      // c reports to b, b reports to a: making c the manager of a loops.
      const { service } = build([
        { id: 'a', managerId: null },
        { id: 'b', managerId: 'a' },
        { id: 'c', managerId: 'b' },
      ]);
      await expect(service.update('a', { managerId: 'c' })).rejects.toThrow(
        /cycle/,
      );
    });

    it('rejects an unknown manager with 404', async () => {
      const { service } = build([{ id: 'a', managerId: null }]);
      await expect(
        service.update('a', { managerId: 'ghost' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('create', () => {
    it('rejects an unknown department', async () => {
      const { service, departments } = build();
      departments.exists.mockResolvedValue(false);

      await expect(
        service.create({
          matricule: 'E1',
          firstName: 'A',
          lastName: 'B',
          email: 'a@b.co',
          hireDate: '2024-01-01',
          departmentId: 'missing',
        }),
      ).rejects.toThrow('Department not found');
    });
  });

  describe('remove', () => {
    it('refuses to delete an employee who still manages someone', async () => {
      const { service, employees } = build([{ id: 'a', managerId: null }]);
      employees.count.mockResolvedValue(2);

      await expect(service.remove('a')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(employees.softDelete).not.toHaveBeenCalled();
    });

    it('soft-deletes and disables the linked account', async () => {
      const { service, employees, usersService } = build([
        { id: 'a', managerId: null, userId: 'user-1' },
      ]);

      await service.remove('a');

      expect(usersService.deactivate).toHaveBeenCalledWith('user-1');
      expect(employees.update).toHaveBeenCalledWith(
        { id: 'a' },
        { userId: null },
      );
      expect(employees.softDelete).toHaveBeenCalledWith('a');
    });

    it('answers 404 for an unknown employee', async () => {
      const { service } = build();
      await expect(service.remove('ghost')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('findAll', () => {
    it('returns an empty page for a manager without employee record, without querying', async () => {
      const { service, queryBuilder } = build();
      const page = await service.findAll({ page: 1, limit: 10 }, manager);

      expect(page).toEqual({ data: [], total: 0, page: 1, limit: 10 });
      expect(queryBuilder.getManyAndCount).not.toHaveBeenCalled();
    });

    it('restricts a manager to their direct reports', async () => {
      const { service, accessPolicy, queryBuilder } = build();
      accessPolicy.findEmployeeIdByUserId.mockResolvedValue('mgr-1');

      await service.findAll({ page: 1, limit: 10 }, manager);

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'employee.managerId = :ownEmployeeId',
        { ownEmployeeId: 'mgr-1' },
      );
    });

    it('does not scope HR', async () => {
      const { service, accessPolicy } = build();
      await service.findAll(
        { page: 1, limit: 10 },
        { id: 'u', email: 'hr@company.com', role: Role.Hr },
      );
      expect(accessPolicy.findEmployeeIdByUserId).not.toHaveBeenCalled();
    });
  });
});
