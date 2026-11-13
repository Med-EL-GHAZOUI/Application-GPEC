import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth-user.type.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Role } from '../common/enums/role.enum.js';
import { DashboardService } from './dashboard.service.js';
import {
  DashboardQueryDto,
  EvolutionQueryDto,
} from './dto/dashboard-query.dto.js';
import {
  DashboardResponseDto,
  EvolutionPointDto,
} from './dto/dashboard-response.dto.js';

@ApiTags('dashboard')
@ApiBearerAuth()
@Roles(Role.Admin, Role.Hr, Role.Manager)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  @ApiOperation({
    summary:
      'HR dashboard: totals, gaps, charts data (ADMIN/HR: company, MANAGER: direct reports)',
  })
  getDashboard(
    @Query() query: DashboardQueryDto,
    @CurrentUser() user: AuthUser,
  ): Promise<DashboardResponseDto> {
    return this.dashboardService.getDashboard(query, user);
  }

  @Get('skills-evolution')
  @ApiOperation({
    summary: 'Monthly evolution of assessed levels, for one skill or all',
  })
  getSkillsEvolution(
    @Query() query: EvolutionQueryDto,
    @CurrentUser() user: AuthUser,
  ): Promise<EvolutionPointDto[]> {
    return this.dashboardService.getSkillsEvolution(query, user);
  }
}
