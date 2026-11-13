import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { AuthUser } from '../auth/auth-user.type.js';
import {
  isForeignKeyViolation,
  isUniqueViolation,
} from '../common/database/pg-errors.js';
import { EmployeeStatus } from '../common/enums/domain.enums.js';
import { Role } from '../common/enums/role.enum.js';
import {
  type Page,
  paginate,
  toLikePattern,
  toPage,
} from '../common/pagination/paginate.js';
import { Department } from '../departments/entities/department.entity.js';
import { Position } from '../positions/entities/position.entity.js';
import { UsersService } from '../users/users.service.js';
import { AccessPolicy } from './access-policy.service.js';
import type {
  CreateEmployeeDto,
  EmployeeQueryDto,
  UpdateEmployeeDto,
} from './dto/employee.dto.js';
import { EmployeeResponseDto } from './dto/employee-response.dto.js';
import { Employee } from './entities/employee.entity.js';

const MAX_MANAGEMENT_DEPTH = 50;

/** Anything that can tell whether a row with a given id exists (any repository). */
type ExistenceChecker = {
  exists(options: { where: { id: string } }): Promise<boolean>;
};

type EmployeeReferences = Pick<
  UpdateEmployeeDto,
  'departmentId' | 'positionId' | 'managerId' | 'userId'
>;

@Injectable()
export class EmployeesService {
  constructor(
    @InjectRepository(Employee)
    private readonly employees: Repository<Employee>,
    @InjectRepository(Department)
    private readonly departments: Repository<Department>,
    @InjectRepository(Position)
    private readonly positions: Repository<Position>,
    private readonly usersService: UsersService,
    private readonly accessPolicy: AccessPolicy,
  ) {}

  async findAll(
    query: EmployeeQueryDto,
    user: AuthUser,
  ): Promise<Page<EmployeeResponseDto>> {
    const queryBuilder = this.employees
      .createQueryBuilder('employee')
      .leftJoinAndSelect('employee.department', 'department')
      .leftJoinAndSelect('employee.position', 'position')
      .leftJoinAndSelect('employee.manager', 'manager')
      .orderBy('employee.lastName', 'ASC')
      .addOrderBy('employee.firstName', 'ASC');

    if (user.role === Role.Manager) {
      const ownEmployeeId = await this.accessPolicy.findEmployeeIdByUserId(
        user.id,
      );
      if (!ownEmployeeId) {
        return toPage([], 0, query);
      }
      queryBuilder.andWhere('employee.managerId = :ownEmployeeId', {
        ownEmployeeId,
      });
    }

    this.applyFilters(queryBuilder, query);

    const page = await paginate(queryBuilder, query);
    return toPage(
      page.data.map((employee) => EmployeeResponseDto.from(employee)),
      page.total,
      query,
    );
  }

  async findOne(id: string, user: AuthUser): Promise<EmployeeResponseDto> {
    await this.accessPolicy.assertCanAccessEmployee(user, id);
    return this.loadDetailed(id);
  }

  async findMine(user: AuthUser): Promise<EmployeeResponseDto> {
    const ownEmployeeId = await this.accessPolicy.findEmployeeIdByUserId(
      user.id,
    );
    if (!ownEmployeeId) {
      throw new NotFoundException(
        'No employee record is linked to this account',
      );
    }
    return this.loadDetailed(ownEmployeeId);
  }

  async create(dto: CreateEmployeeDto): Promise<EmployeeResponseDto> {
    await this.assertReferences(dto);

    try {
      const saved = await this.employees.save(
        this.employees.create({
          matricule: dto.matricule,
          firstName: dto.firstName,
          lastName: dto.lastName,
          email: dto.email,
          phone: dto.phone ?? null,
          hireDate: dto.hireDate,
          status: dto.status ?? EmployeeStatus.Active,
          departmentId: dto.departmentId,
          positionId: dto.positionId ?? null,
          managerId: dto.managerId ?? null,
          userId: dto.userId ?? null,
        }),
      );
      return await this.loadDetailed(saved.id);
    } catch (error) {
      throw this.translate(error);
    }
  }

  async update(
    id: string,
    dto: UpdateEmployeeDto,
  ): Promise<EmployeeResponseDto> {
    const employee = await this.findEntity(id);
    await this.assertReferences(dto, id);

    Object.assign(employee, dto);
    try {
      await this.employees.save(employee);
      return await this.loadDetailed(id);
    } catch (error) {
      throw this.translate(error);
    }
  }

  /**
   * Soft delete (history is kept). The linked login account is disabled and
   * unlinked so that a former employee can no longer sign in.
   */
  async remove(id: string): Promise<void> {
    const employee = await this.findEntity(id);

    const directReports = await this.employees.count({
      where: { managerId: id },
    });
    if (directReports > 0) {
      throw new ConflictException(
        'Employee still manages active employees: reassign them first',
      );
    }

    if (employee.userId) {
      await this.usersService.deactivate(employee.userId);
      await this.employees.update({ id }, { userId: null });
    }
    await this.employees.softDelete(id);
  }

  private applyFilters(
    queryBuilder: ReturnType<Repository<Employee>['createQueryBuilder']>,
    query: EmployeeQueryDto,
  ): void {
    if (query.search) {
      queryBuilder.andWhere(
        `(employee.firstName ILIKE :search
          OR employee.lastName ILIKE :search
          OR employee.email ILIKE :search
          OR employee.matricule ILIKE :search
          OR department.name ILIKE :search
          OR position.title ILIKE :search)`,
        { search: toLikePattern(query.search) },
      );
    }
    if (query.departmentId) {
      queryBuilder.andWhere('employee.departmentId = :departmentId', {
        departmentId: query.departmentId,
      });
    }
    if (query.positionId) {
      queryBuilder.andWhere('employee.positionId = :positionId', {
        positionId: query.positionId,
      });
    }
    if (query.managerId) {
      queryBuilder.andWhere('employee.managerId = :managerId', {
        managerId: query.managerId,
      });
    }
    if (query.status) {
      queryBuilder.andWhere('employee.status = :status', {
        status: query.status,
      });
    }
  }

  private async findEntity(id: string): Promise<Employee> {
    const employee = await this.employees.findOne({ where: { id } });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }
    return employee;
  }

  private async loadDetailed(id: string): Promise<EmployeeResponseDto> {
    const employee = await this.employees.findOne({
      where: { id },
      relations: { department: true, position: true, manager: true },
    });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }
    return EmployeeResponseDto.from(employee);
  }

  /** Every referenced record must exist; rules R6 (no self/cyclic management) and 1 account = 1 employee. */
  private async assertReferences(
    references: EmployeeReferences,
    employeeId?: string,
  ): Promise<void> {
    const { departmentId, positionId, managerId, userId } = references;

    if (departmentId) {
      await this.assertExists(this.departments, departmentId, 'Department');
    }
    if (positionId) {
      await this.assertExists(this.positions, positionId, 'Position');
    }
    if (userId) {
      await this.assertUserAvailable(userId, employeeId);
    }
    if (managerId) {
      await this.assertValidManager(managerId, employeeId);
    }
  }

  private async assertExists(
    repository: ExistenceChecker,
    id: string,
    label: string,
  ): Promise<void> {
    if (!(await repository.exists({ where: { id } }))) {
      throw new NotFoundException(`${label} not found`);
    }
  }

  private async assertUserAvailable(
    userId: string,
    employeeId?: string,
  ): Promise<void> {
    if (!(await this.usersService.findById(userId))) {
      throw new NotFoundException('User not found');
    }
    const owner = await this.employees.findOne({
      where: { userId },
      select: { id: true },
    });
    if (owner && owner.id !== employeeId) {
      throw new ConflictException(
        'This user account is already linked to an employee',
      );
    }
  }

  private async assertValidManager(
    managerId: string,
    employeeId?: string,
  ): Promise<void> {
    if (employeeId && managerId === employeeId) {
      throw new BadRequestException('An employee cannot be their own manager');
    }
    await this.assertExists(this.employees, managerId, 'Manager');

    if (!employeeId) {
      return;
    }
    // Walk up the management chain: it must never lead back to this employee.
    let currentId: string | null = managerId;
    for (let depth = 0; currentId && depth < MAX_MANAGEMENT_DEPTH; depth += 1) {
      if (currentId === employeeId) {
        throw new BadRequestException(
          'This manager assignment creates a management cycle',
        );
      }
      const current: Employee | null = await this.employees.findOne({
        where: { id: currentId },
        select: { id: true, managerId: true },
      });
      currentId = current?.managerId ?? null;
    }
  }

  private translate(error: unknown): unknown {
    if (isUniqueViolation(error)) {
      return new ConflictException(
        'Matricule, email or user account is already used by another employee',
      );
    }
    if (isForeignKeyViolation(error)) {
      return new BadRequestException('A referenced record does not exist');
    }
    return error;
  }
}
