import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  isForeignKeyViolation,
  isUniqueViolation,
} from '../common/database/pg-errors.js';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import {
  type Page,
  paginate,
  toLikePattern,
} from '../common/pagination/paginate.js';
import type {
  CreateDepartmentDto,
  UpdateDepartmentDto,
} from './dto/department.dto.js';
import { Department } from './entities/department.entity.js';

@Injectable()
export class DepartmentsService {
  constructor(
    @InjectRepository(Department)
    private readonly departments: Repository<Department>,
  ) {}

  findAll(query: PaginationQueryDto): Promise<Page<Department>> {
    const queryBuilder = this.departments
      .createQueryBuilder('department')
      .orderBy('department.name', 'ASC');

    if (query.search) {
      queryBuilder.where('department.name ILIKE :search', {
        search: toLikePattern(query.search),
      });
    }
    return paginate(queryBuilder, query);
  }

  async findOne(id: string): Promise<Department> {
    const department = await this.departments.findOne({ where: { id } });
    if (!department) {
      throw new NotFoundException('Department not found');
    }
    return department;
  }

  async create(dto: CreateDepartmentDto): Promise<Department> {
    try {
      return await this.departments.save(
        this.departments.create({
          name: dto.name,
          description: dto.description ?? null,
        }),
      );
    } catch (error) {
      throw this.translate(error);
    }
  }

  async update(id: string, dto: UpdateDepartmentDto): Promise<Department> {
    const department = await this.findOne(id);
    Object.assign(department, dto);
    try {
      return await this.departments.save(department);
    } catch (error) {
      throw this.translate(error);
    }
  }

  async remove(id: string): Promise<void> {
    const department = await this.findOne(id);
    try {
      await this.departments.remove(department);
    } catch (error) {
      throw this.translate(error);
    }
  }

  private translate(error: unknown): unknown {
    if (isUniqueViolation(error)) {
      return new ConflictException(
        'A department with this name already exists',
      );
    }
    if (isForeignKeyViolation(error)) {
      return new ConflictException(
        'Department is still used by employees or positions',
      );
    }
    return error;
  }
}
