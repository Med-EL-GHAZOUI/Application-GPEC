import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
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
  CreateEvaluationDto,
  EvaluationHistoryQueryDto,
} from './dto/evaluation.dto.js';
import {
  EvaluationResponseDto,
  EvolutionPointDto,
} from './dto/evaluation-response.dto.js';
import { EvaluationsService } from './evaluations.service.js';

@ApiTags('evaluations')
@ApiBearerAuth()
@Controller()
export class EvaluationsController {
  constructor(private readonly evaluationsService: EvaluationsService) {}

  @Roles(Role.Hr, Role.Manager)
  @Post('evaluations')
  @ApiOperation({
    summary:
      'Assess a skill (HR, or MANAGER for direct reports): appends to the history and updates the current level',
  })
  evaluate(
    @Body() dto: CreateEvaluationDto,
    @CurrentUser() user: AuthUser,
  ): Promise<EvaluationResponseDto> {
    return this.evaluationsService.evaluate(dto, user);
  }

  @Get('employees/:employeeId/evaluations')
  @ApiOperation({
    summary:
      'Evaluation history of an employee, newest first (within the caller scope)',
  })
  history(
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Query() query: EvaluationHistoryQueryDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Page<EvaluationResponseDto>> {
    return this.evaluationsService.history(employeeId, query, user);
  }

  @Get('employees/:employeeId/skills/:skillId/evolution')
  @ApiOperation({
    summary: 'Progression of an employee on one skill, oldest first',
  })
  evolution(
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Param('skillId', ParseUUIDPipe) skillId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<EvolutionPointDto[]> {
    return this.evaluationsService.evolution(employeeId, skillId, user);
  }
}
