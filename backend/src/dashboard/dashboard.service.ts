import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { AuthUser } from '../auth/auth-user.type.js';
import { HIGH_PRIORITY_GAP } from '../competency-gaps/gap-calculator.js';
import {
  type SkillCategory,
  TrainingStatus,
} from '../common/enums/domain.enums.js';
import { Role } from '../common/enums/role.enum.js';
import { AccessPolicy } from '../employees/access-policy.service.js';
import { DASHBOARD_QUERIES as Q } from './dashboard.queries.js';
import type {
  DashboardQueryDto,
  EvolutionQueryDto,
} from './dto/dashboard-query.dto.js';
import type {
  DashboardResponseDto,
  DashboardScope,
  EvolutionPointDto,
  TrainingStatusCountDto,
} from './dto/dashboard-response.dto.js';

/** Matches no employee: a manager without employee record sees an empty team. */
export const NO_MATCH_ID = '00000000-0000-0000-0000-000000000000';

const TRAINING_STATUS_ORDER = [
  TrainingStatus.Planned,
  TrainingStatus.Open,
  TrainingStatus.InProgress,
  TrainingStatus.Completed,
  TrainingStatus.Cancelled,
];

type Scope = { kind: DashboardScope; managerId: string | null };

type SkillRow = { id: string; name: string; category: SkillCategory };
const toSkill = (row: SkillRow) => ({
  id: row.id,
  name: row.name,
  category: row.category,
});

@Injectable()
export class DashboardService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly accessPolicy: AccessPolicy,
  ) {}

  /**
   * Everything the HR dashboard shows. ADMIN and HR see the whole company;
   * a MANAGER sees their direct reports only. Every figure comes from a SQL
   * aggregation, run in parallel.
   */
  async getDashboard(
    query: DashboardQueryDto,
    user: AuthUser,
  ): Promise<DashboardResponseDto> {
    const scope = await this.resolveScope(user);
    const managerId = scope.managerId;
    const { limit, months, skillId } = query;

    const [
      totals,
      gapSummary,
      byDepartment,
      demanded,
      deficient,
      critical,
      employeesWithGaps,
      trainingsByStatus,
      skillsEvolution,
    ] = await Promise.all([
      this.dataSource.query(Q.totals, [managerId]),
      this.dataSource.query(Q.gapSummary, [managerId, HIGH_PRIORITY_GAP]),
      this.dataSource.query(Q.employeesByDepartment, [managerId]),
      this.dataSource.query(Q.demandedSkills, [managerId, limit]),
      this.dataSource.query(Q.deficientSkills, [managerId, limit]),
      this.dataSource.query(Q.criticalSkills, [managerId, HIGH_PRIORITY_GAP]),
      this.dataSource.query(Q.employeesWithGaps, [
        managerId,
        HIGH_PRIORITY_GAP,
        limit,
      ]),
      this.dataSource.query(Q.trainingsByStatus, []),
      this.queryEvolution(managerId, skillId ?? null, months),
    ]);

    const [totalsRow] = totals;
    const [summaryRow] = gapSummary;

    return {
      scope: scope.kind,
      generatedAt: new Date(),
      totals: {
        employees: totalsRow.employees,
        activeEmployees: totalsRow.active_employees,
        departments: totalsRow.departments,
        positions: totalsRow.positions,
        skills: totalsRow.skills,
        trainings: totalsRow.trainings,
        trainingsInProgress: totalsRow.trainings_in_progress,
        employeesInTraining: totalsRow.employees_in_training,
      },
      gaps: {
        employeesWithGaps: summaryRow.employees_with_gaps,
        employeesWithHighPriorityGap:
          summaryRow.employees_with_high_priority_gap,
        criticalSkills: critical.length,
      },
      employeesByDepartment: byDepartment
        // Company-wide, empty departments are shown; for a team they are noise.
        .filter(
          (row: { employees: number }) =>
            scope.kind === 'COMPANY' || row.employees > 0,
        )
        .map((row: { id: string; name: string; employees: number }) => ({
          department: { id: row.id, name: row.name },
          employees: row.employees,
        })),
      demandedSkills: demanded.map(
        (row: SkillRow & { employees: number; positions: number }) => ({
          skill: toSkill(row),
          employees: row.employees,
          positions: row.positions,
        }),
      ),
      deficientSkills: deficient.map(
        (
          row: SkillRow & {
            employees_requiring: number;
            employees_to_develop: number;
            total_gap: number;
          },
        ) => ({
          skill: toSkill(row),
          employeesRequiring: row.employees_requiring,
          employeesToDevelop: row.employees_to_develop,
          totalGap: row.total_gap,
        }),
      ),
      criticalSkills: critical.slice(0, limit).map(
        (
          row: SkillRow & {
            employees_in_high_priority_gap: number;
            largest_gap: number;
          },
        ) => ({
          skill: toSkill(row),
          employeesInHighPriorityGap: row.employees_in_high_priority_gap,
          largestGap: row.largest_gap,
        }),
      ),
      employeesWithGaps: employeesWithGaps.map(
        (row: {
          id: string;
          first_name: string;
          last_name: string;
          department: string;
          position: string;
          total_gap: number;
          high_priority_gaps: number;
          skills_to_develop: number;
        }) => ({
          employee: {
            id: row.id,
            firstName: row.first_name,
            lastName: row.last_name,
          },
          department: row.department,
          position: row.position,
          totalGap: row.total_gap,
          highPriorityGaps: row.high_priority_gaps,
          skillsToDevelop: row.skills_to_develop,
        }),
      ),
      trainingsByStatus: this.fillStatuses(trainingsByStatus),
      skillsEvolution,
    };
  }

  /** Monthly progression of the assessed levels, for one skill or all of them. */
  async getSkillsEvolution(
    query: EvolutionQueryDto,
    user: AuthUser,
  ): Promise<EvolutionPointDto[]> {
    const scope = await this.resolveScope(user);
    return this.queryEvolution(
      scope.managerId,
      query.skillId ?? null,
      query.months,
    );
  }

  private async queryEvolution(
    managerId: string | null,
    skillId: string | null,
    months: number,
  ): Promise<EvolutionPointDto[]> {
    if (skillId) {
      const found = await this.dataSource.query(Q.skillExists, [skillId]);
      if (found.length === 0) {
        throw new NotFoundException('Skill not found');
      }
    }
    const rows: {
      month: string;
      average_level: number | null;
      evaluations: number;
    }[] = await this.dataSource.query(Q.skillsEvolution, [
      managerId,
      skillId,
      months,
    ]);
    return rows.map((row) => ({
      month: row.month,
      averageLevel: row.average_level,
      evaluations: row.evaluations,
    }));
  }

  private async resolveScope(user: AuthUser): Promise<Scope> {
    if (user.role !== Role.Manager) {
      return { kind: 'COMPANY', managerId: null };
    }
    const ownEmployeeId = await this.accessPolicy.findEmployeeIdByUserId(
      user.id,
    );
    return { kind: 'TEAM', managerId: ownEmployeeId ?? NO_MATCH_ID };
  }

  /** Every status appears, even with no training, so that a chart never misses a bar. */
  private fillStatuses(
    rows: { status: TrainingStatus; count: number }[],
  ): TrainingStatusCountDto[] {
    const counts = new Map(rows.map((row) => [row.status, row.count]));
    return TRAINING_STATUS_ORDER.map((status) => ({
      status,
      count: counts.get(status) ?? 0,
    }));
  }
}
