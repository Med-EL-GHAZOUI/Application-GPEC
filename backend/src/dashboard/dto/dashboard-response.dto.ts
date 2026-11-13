import { ApiProperty } from '@nestjs/swagger';
import {
  SkillCategory,
  TrainingStatus,
} from '../../common/enums/domain.enums.js';

export type DashboardScope = 'COMPANY' | 'TEAM';

class SkillRefDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ enum: SkillCategory })
  category: SkillCategory;
}

class DepartmentRefDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;
}

export class DashboardTotalsDto {
  @ApiProperty({ description: 'Employees in scope (deleted ones excluded)' })
  employees: number;

  @ApiProperty()
  activeEmployees: number;

  @ApiProperty({
    description: 'Company: all departments. Team: those of the team.',
  })
  departments: number;

  @ApiProperty({
    description: 'Company: all positions. Team: those of the team.',
  })
  positions: number;

  @ApiProperty({ description: 'Skills of the catalogue' })
  skills: number;

  @ApiProperty({ description: 'Trainings of the catalogue' })
  trainings: number;

  @ApiProperty()
  trainingsInProgress: number;

  @ApiProperty({
    description: 'Employees in scope with a training in progress',
  })
  employeesInTraining: number;
}

export class DashboardGapsDto {
  @ApiProperty({
    description: 'Workforce employees with at least one gap to develop',
  })
  employeesWithGaps: number;

  @ApiProperty({ description: 'Employees with at least one HIGH priority gap' })
  employeesWithHighPriorityGap: number;

  @ApiProperty({ description: 'Skills where somebody has a HIGH priority gap' })
  criticalSkills: number;
}

export class DepartmentHeadcountDto {
  @ApiProperty({ type: DepartmentRefDto })
  department: DepartmentRefDto;

  @ApiProperty()
  employees: number;
}

export class DemandedSkillDto {
  @ApiProperty({ type: SkillRefDto })
  skill: SkillRefDto;

  @ApiProperty({ description: 'Employees whose position requires this skill' })
  employees: number;

  @ApiProperty({
    description: 'Distinct positions (held by these employees) requiring it',
  })
  positions: number;
}

export class DeficientSkillDto {
  @ApiProperty({ type: SkillRefDto })
  skill: SkillRefDto;

  @ApiProperty()
  employeesRequiring: number;

  @ApiProperty()
  employeesToDevelop: number;

  @ApiProperty({ description: 'Sum of the positive gaps on this skill' })
  totalGap: number;
}

export class CriticalSkillDto {
  @ApiProperty({ type: SkillRefDto })
  skill: SkillRefDto;

  @ApiProperty()
  employeesInHighPriorityGap: number;

  @ApiProperty()
  largestGap: number;
}

class EmployeeRefDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  firstName: string;

  @ApiProperty()
  lastName: string;
}

export class EmployeeWithGapsDto {
  @ApiProperty({ type: EmployeeRefDto })
  employee: EmployeeRefDto;

  @ApiProperty()
  department: string;

  @ApiProperty()
  position: string;

  @ApiProperty({ description: 'Sum of the positive gaps' })
  totalGap: number;

  @ApiProperty()
  highPriorityGaps: number;

  @ApiProperty()
  skillsToDevelop: number;
}

export class TrainingStatusCountDto {
  @ApiProperty({ enum: TrainingStatus })
  status: TrainingStatus;

  @ApiProperty()
  count: number;
}

export class EvolutionPointDto {
  @ApiProperty({ example: '2026-03' })
  month: string;

  @ApiProperty({
    nullable: true,
    type: Number,
    description:
      'Average level of the assessments of the month, null when there were none',
  })
  averageLevel: number | null;

  @ApiProperty({ description: 'Number of assessments recorded in the month' })
  evaluations: number;
}

export class DashboardResponseDto {
  @ApiProperty({ enum: ['COMPANY', 'TEAM'] })
  scope: DashboardScope;

  @ApiProperty()
  generatedAt: Date;

  @ApiProperty({ type: DashboardTotalsDto })
  totals: DashboardTotalsDto;

  @ApiProperty({ type: DashboardGapsDto })
  gaps: DashboardGapsDto;

  @ApiProperty({ type: [DepartmentHeadcountDto] })
  employeesByDepartment: DepartmentHeadcountDto[];

  @ApiProperty({ type: [DemandedSkillDto] })
  demandedSkills: DemandedSkillDto[];

  @ApiProperty({ type: [DeficientSkillDto] })
  deficientSkills: DeficientSkillDto[];

  @ApiProperty({ type: [CriticalSkillDto] })
  criticalSkills: CriticalSkillDto[];

  @ApiProperty({ type: [EmployeeWithGapsDto] })
  employeesWithGaps: EmployeeWithGapsDto[];

  @ApiProperty({
    type: [TrainingStatusCountDto],
    description: 'One entry per status, zeros included',
  })
  trainingsByStatus: TrainingStatusCountDto[];

  @ApiProperty({
    type: [EvolutionPointDto],
    description: 'Oldest month first, one entry per month',
  })
  skillsEvolution: EvolutionPointDto[];
}
