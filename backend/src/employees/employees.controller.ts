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
import type { AuthUser } from '../auth/auth-user.type.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Role } from '../common/enums/role.enum.js';
import type { Page } from '../common/pagination/paginate.js';
import {
  CreateEmployeeDto,
  EmployeeQueryDto,
  UpdateEmployeeDto,
} from './dto/employee.dto.js';
import { EmployeeResponseDto } from './dto/employee-response.dto.js';
import { EmployeesService } from './employees.service.js';

@ApiTags('employees')
@ApiBearerAuth()
@Controller('employees')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Roles(Role.Admin, Role.Hr, Role.Manager)
  @Get()
  @ApiOperation({
    summary: 'List employees (HR/ADMIN: all, MANAGER: direct reports only)',
  })
  findAll(
    @Query() query: EmployeeQueryDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Page<EmployeeResponseDto>> {
    return this.employeesService.findAll(query, user);
  }

  // Declared before ':id' so that "me" is not parsed as an identifier.
  @Get('me')
  @ApiOperation({ summary: 'Employee record linked to the current account' })
  findMine(@CurrentUser() user: AuthUser): Promise<EmployeeResponseDto> {
    return this.employeesService.findMine(user);
  }

  @Get(':id')
  @ApiOperation({ summary: "Employee profile (within the caller's scope)" })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<EmployeeResponseDto> {
    return this.employeesService.findOne(id, user);
  }

  @Roles(Role.Admin, Role.Hr)
  @Post()
  create(@Body() dto: CreateEmployeeDto): Promise<EmployeeResponseDto> {
    return this.employeesService.create(dto);
  }

  @Roles(Role.Admin, Role.Hr)
  @Patch(':id')
  @ApiOperation({
    summary: 'Update an employee (null clears position, manager or account)',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmployeeDto,
  ): Promise<EmployeeResponseDto> {
    return this.employeesService.update(id, dto);
  }

  @Roles(Role.Admin, Role.Hr)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete an employee' })
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.employeesService.remove(id);
  }
}
