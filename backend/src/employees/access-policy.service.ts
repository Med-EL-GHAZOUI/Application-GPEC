import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { AuthUser } from '../auth/auth-user.type.js';
import { Role } from '../common/enums/role.enum.js';
import { Employee } from './entities/employee.entity.js';

/**
 * Scope rules on top of the role check, in one place:
 * - ADMIN and HR reach every employee;
 * - MANAGER reaches their own record and their direct reports;
 * - EMPLOYEE reaches their own record only.
 */
@Injectable()
export class AccessPolicy {
  constructor(
    @InjectRepository(Employee)
    private readonly employees: Repository<Employee>,
  ) {}

  async findEmployeeIdByUserId(userId: string): Promise<string | null> {
    const employee = await this.employees.findOne({
      where: { userId },
      select: { id: true },
    });
    return employee?.id ?? null;
  }

  async canAccessEmployee(
    user: AuthUser,
    employeeId: string,
  ): Promise<boolean> {
    if (user.role === Role.Admin || user.role === Role.Hr) {
      return true;
    }

    const ownEmployeeId = await this.findEmployeeIdByUserId(user.id);
    if (!ownEmployeeId) {
      return false;
    }
    if (ownEmployeeId === employeeId) {
      return true;
    }
    if (user.role === Role.Manager) {
      return this.employees.exists({
        where: { id: employeeId, managerId: ownEmployeeId },
      });
    }
    return false;
  }

  async assertCanAccessEmployee(
    user: AuthUser,
    employeeId: string,
  ): Promise<void> {
    if (!(await this.canAccessEmployee(user, employeeId))) {
      throw new ForbiddenException('You cannot access this employee');
    }
  }
}
