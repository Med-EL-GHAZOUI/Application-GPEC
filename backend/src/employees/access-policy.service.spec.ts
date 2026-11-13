import type { Repository } from 'typeorm';
import type { AuthUser } from '../auth/auth-user.type.js';
import { Role } from '../common/enums/role.enum.js';
import { AccessPolicy } from './access-policy.service.js';
import type { Employee } from './entities/employee.entity.js';

const user = (role: Role): AuthUser => ({
  id: 'user-1',
  email: 'user@company.com',
  role,
});

const build = (options: {
  ownEmployeeId?: string;
  isDirectReport?: boolean;
}) => {
  const employees = {
    findOne: vi
      .fn()
      .mockResolvedValue(
        options.ownEmployeeId ? { id: options.ownEmployeeId } : null,
      ),
    exists: vi.fn().mockResolvedValue(options.isDirectReport ?? false),
  };
  return {
    employees,
    policy: new AccessPolicy(employees as unknown as Repository<Employee>),
  };
};

describe('AccessPolicy', () => {
  it.each([Role.Admin, Role.Hr])('%s reaches any employee', async (role) => {
    const { policy, employees } = build({});
    await expect(policy.canAccessEmployee(user(role), 'anyone')).resolves.toBe(
      true,
    );
    expect(employees.findOne).not.toHaveBeenCalled();
  });

  it('lets an employee read their own record', async () => {
    const { policy } = build({ ownEmployeeId: 'emp-1' });
    await expect(
      policy.canAccessEmployee(user(Role.Employee), 'emp-1'),
    ).resolves.toBe(true);
  });

  it('refuses an employee another record, even a direct colleague', async () => {
    const { policy, employees } = build({
      ownEmployeeId: 'emp-1',
      isDirectReport: true,
    });
    await expect(
      policy.canAccessEmployee(user(Role.Employee), 'emp-2'),
    ).resolves.toBe(false);
    expect(employees.exists).not.toHaveBeenCalled();
  });

  it('lets a manager read a direct report', async () => {
    const { policy, employees } = build({
      ownEmployeeId: 'mgr-1',
      isDirectReport: true,
    });
    await expect(
      policy.canAccessEmployee(user(Role.Manager), 'emp-2'),
    ).resolves.toBe(true);
    expect(employees.exists).toHaveBeenCalledWith({
      where: { id: 'emp-2', managerId: 'mgr-1' },
    });
  });

  it('refuses a manager someone outside their team', async () => {
    const { policy } = build({ ownEmployeeId: 'mgr-1', isDirectReport: false });
    await expect(
      policy.canAccessEmployee(user(Role.Manager), 'emp-9'),
    ).resolves.toBe(false);
  });

  it('refuses an account that is not linked to any employee', async () => {
    const { policy } = build({});
    await expect(
      policy.canAccessEmployee(user(Role.Manager), 'emp-1'),
    ).resolves.toBe(false);
  });

  it('throws Forbidden from assertCanAccessEmployee', async () => {
    const { policy } = build({ ownEmployeeId: 'emp-1' });
    await expect(
      policy.assertCanAccessEmployee(user(Role.Employee), 'emp-2'),
    ).rejects.toThrow('You cannot access this employee');
  });
});
