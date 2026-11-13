import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator.js';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import { Role } from '../common/enums/role.enum.js';
import type { Page } from '../common/pagination/paginate.js';
import { DepartmentsService } from './departments.service.js';
import {
  CreateDepartmentDto,
  UpdateDepartmentDto,
} from './dto/department.dto.js';
import { Department } from './entities/department.entity.js';

@ApiTags('departments')
@ApiBearerAuth()
@Controller('departments')
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  @Get()
  @ApiOperation({ summary: 'List departments (paginated, searchable)' })
  findAll(@Query() query: PaginationQueryDto): Promise<Page<Department>> {
    return this.departmentsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<Department> {
    return this.departmentsService.findOne(id);
  }

  @Roles(Role.Admin, Role.Hr)
  @Post()
  create(@Body() dto: CreateDepartmentDto): Promise<Department> {
    return this.departmentsService.create(dto);
  }

  @Roles(Role.Admin, Role.Hr)
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDepartmentDto,
  ): Promise<Department> {
    return this.departmentsService.update(id, dto);
  }

  @Roles(Role.Admin, Role.Hr)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.departmentsService.remove(id);
  }
}
