import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth-user.type.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Role } from '../common/enums/role.enum.js';
import { EmployeeSkillResponseDto } from './dto/employee-skill-response.dto.js';
import { SetEmployeeSkillDto } from './dto/employee-skill.dto.js';
import { EmployeeSkillsService } from './employee-skills.service.js';

@ApiTags('employee-skills')
@ApiBearerAuth()
@Controller('employees/:employeeId/skills')
export class EmployeeSkillsController {
  constructor(private readonly employeeSkillsService: EmployeeSkillsService) {}

  @Get()
  @ApiOperation({
    summary:
      'Skills of an employee with current levels (within the caller scope)',
  })
  list(
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<EmployeeSkillResponseDto[]> {
    return this.employeeSkillsService.list(employeeId, user);
  }

  @Roles(Role.Hr, Role.Manager)
  @Put(':skillId')
  @ApiOperation({
    summary:
      'Set the level of a skill (HR, or MANAGER for their direct reports)',
  })
  set(
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Param('skillId', ParseUUIDPipe) skillId: string,
    @Body() dto: SetEmployeeSkillDto,
    @CurrentUser() user: AuthUser,
  ): Promise<EmployeeSkillResponseDto> {
    return this.employeeSkillsService.set(employeeId, skillId, dto, user);
  }

  @Roles(Role.Admin, Role.Hr)
  @Delete(':skillId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a skill from an employee' })
  remove(
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Param('skillId', ParseUUIDPipe) skillId: string,
  ): Promise<void> {
    return this.employeeSkillsService.remove(employeeId, skillId);
  }
}
