import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth-user.type.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { CompetencyGapsService } from './competency-gaps.service.js';
import { EmployeeGapsResponseDto } from './dto/gaps-response.dto.js';

@ApiTags('competency-gaps')
@ApiBearerAuth()
@Controller('employees/:employeeId/gaps')
export class CompetencyGapsController {
  constructor(private readonly competencyGapsService: CompetencyGapsService) {}

  @Get()
  @ApiOperation({
    summary:
      'Competency gaps of an employee against their position (within the caller scope)',
  })
  forEmployee(
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<EmployeeGapsResponseDto> {
    return this.competencyGapsService.forEmployee(employeeId, user);
  }
}
