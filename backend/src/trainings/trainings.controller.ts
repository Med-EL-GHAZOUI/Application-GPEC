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
import { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import { Role } from '../common/enums/role.enum.js';
import type { Page } from '../common/pagination/paginate.js';
import {
  EmployeeTrainingResponseDto,
  EnrollEmployeeDto,
  ParticipantResponseDto,
  UpdateEnrollmentStatusDto,
} from './dto/enrollment.dto.js';
import {
  CreateTrainingDto,
  TrainingQueryDto,
  UpdateTrainingDto,
} from './dto/training.dto.js';
import { TrainingResponseDto } from './dto/training-response.dto.js';
import { EnrollmentsService } from './enrollments.service.js';
import { TrainingsService } from './trainings.service.js';

@ApiTags('trainings')
@ApiBearerAuth()
@Controller()
export class TrainingsController {
  constructor(
    private readonly trainingsService: TrainingsService,
    private readonly enrollmentsService: EnrollmentsService,
  ) {}

  // ---- Catalogue ---------------------------------------------------------

  @Get('trainings')
  @ApiOperation({
    summary:
      'Training catalogue (paginated; search title, skill or provider; filter by skill, status, level)',
  })
  findAll(
    @Query() query: TrainingQueryDto,
  ): Promise<Page<TrainingResponseDto>> {
    return this.trainingsService.findAll(query);
  }

  @Get('trainings/:id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TrainingResponseDto> {
    return this.trainingsService.findOne(id);
  }

  @Roles(Role.Admin, Role.Hr)
  @Post('trainings')
  create(@Body() dto: CreateTrainingDto): Promise<TrainingResponseDto> {
    return this.trainingsService.create(dto);
  }

  @Roles(Role.Admin, Role.Hr)
  @Patch('trainings/:id')
  @ApiOperation({
    summary: 'Update a training (null clears provider or start date)',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTrainingDto,
  ): Promise<TrainingResponseDto> {
    return this.trainingsService.update(id, dto);
  }

  @Roles(Role.Admin, Role.Hr)
  @Delete('trainings/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a training without enrollments' })
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.trainingsService.remove(id);
  }

  // ---- Enrollments -------------------------------------------------------

  @Roles(Role.Admin, Role.Hr)
  @Get('trainings/:id/enrollments')
  @ApiOperation({ summary: 'Participants of a training' })
  listParticipants(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PaginationQueryDto,
  ): Promise<Page<ParticipantResponseDto>> {
    return this.enrollmentsService.listParticipants(id, query);
  }

  @Roles(Role.Admin, Role.Hr)
  @Post('trainings/:id/enrollments')
  @ApiOperation({
    summary: 'Enroll an employee (training must be OPEN, with a free seat)',
  })
  enroll(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EnrollEmployeeDto,
  ): Promise<ParticipantResponseDto> {
    return this.enrollmentsService.enroll(id, dto.employeeId);
  }

  @Roles(Role.Admin, Role.Hr)
  @Patch('trainings/:id/enrollments/:employeeId')
  @ApiOperation({
    summary: 'Move an enrollment forward: IN_PROGRESS, COMPLETED or CANCELLED',
  })
  updateEnrollment(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Body() dto: UpdateEnrollmentStatusDto,
  ): Promise<ParticipantResponseDto> {
    return this.enrollmentsService.updateStatus(id, employeeId, dto.status);
  }

  @Get('employees/:employeeId/trainings')
  @ApiOperation({
    summary: 'Trainings of an employee (within the caller scope)',
  })
  listForEmployee(
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<EmployeeTrainingResponseDto[]> {
    return this.enrollmentsService.listForEmployee(employeeId, user);
  }
}
