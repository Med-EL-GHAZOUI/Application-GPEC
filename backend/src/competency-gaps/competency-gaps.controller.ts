import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth-user.type.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Role } from '../common/enums/role.enum.js';
import { CompetencyGapsService } from './competency-gaps.service.js';
import {
  EmployeeGapsResponseDto,
  TrainingRecommendationsResponseDto,
} from './dto/gaps-response.dto.js';

@ApiTags('competency-gaps')
@ApiBearerAuth()
@Controller('employees/:employeeId')
export class CompetencyGapsController {
  constructor(private readonly competencyGapsService: CompetencyGapsService) {}

  @Get('gaps')
  @ApiOperation({
    summary:
      'Competency gaps of an employee against their position, with the recommended training (within the caller scope)',
  })
  forEmployee(
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<EmployeeGapsResponseDto> {
    return this.competencyGapsService.forEmployee(employeeId, user);
  }

  @Roles(Role.Admin, Role.Hr, Role.Manager)
  @Get('training-recommendations')
  @ApiOperation({
    summary:
      'Ranked training alternatives for each skill to develop (HR, MANAGER for their team, ADMIN)',
  })
  recommendations(
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<TrainingRecommendationsResponseDto> {
    return this.competencyGapsService.recommendationsForEmployee(
      employeeId,
      user,
    );
  }
}
