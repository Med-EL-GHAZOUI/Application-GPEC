/**
 * Aggregations of the dashboard, computed in SQL so that no figure requires
 * looping over employees in the application.
 *
 * Conventions shared by every query:
 * - `$1` is the scope: NULL for the whole company, or the employee id of a
 *   manager to restrict to their direct reports (same rule as AccessPolicy).
 * - Deleted employees never count; INACTIVE ones count as people but are left
 *   out of the gap analytics (they are no longer part of the workforce).
 * - A gap is `required level - current level`, with 0 for a skill never
 *   assessed: the same rule as gap-calculator.ts (checked by an e2e test).
 */

const IN_SCOPE = `e.deleted_at IS NULL AND ($1::uuid IS NULL OR e.manager_id = $1::uuid)`;

/** Required skills of the workforce, with the gap of each (employee, skill) pair. */
const GAPS_CTE = `
  WITH gaps AS (
    SELECT e.id AS employee_id,
           e.position_id,
           ps.skill_id,
           ps.required_level - COALESCE(es.level, 0) AS gap
    FROM employees e
    JOIN position_skills ps ON ps.position_id = e.position_id
    LEFT JOIN employee_skills es
      ON es.employee_id = e.id AND es.skill_id = ps.skill_id
    WHERE ${IN_SCOPE} AND e.status <> 'INACTIVE'
  )`;

export const DASHBOARD_QUERIES = {
  /** params: [scope] */
  totals: `
    SELECT
      (SELECT count(*) FROM employees e WHERE ${IN_SCOPE})::int AS employees,
      (SELECT count(*) FROM employees e
        WHERE ${IN_SCOPE} AND e.status = 'ACTIVE')::int AS active_employees,
      (CASE WHEN $1::uuid IS NULL
        THEN (SELECT count(*) FROM departments)
        ELSE (SELECT count(DISTINCT e.department_id) FROM employees e WHERE ${IN_SCOPE})
      END)::int AS departments,
      (CASE WHEN $1::uuid IS NULL
        THEN (SELECT count(*) FROM positions)
        ELSE (SELECT count(DISTINCT e.position_id) FROM employees e WHERE ${IN_SCOPE})
      END)::int AS positions,
      (SELECT count(*) FROM skills)::int AS skills,
      (SELECT count(*) FROM trainings)::int AS trainings,
      (SELECT count(*) FROM trainings WHERE status = 'IN_PROGRESS')::int AS trainings_in_progress,
      (SELECT count(DISTINCT et.employee_id)
         FROM employee_trainings et
         JOIN employees e ON e.id = et.employee_id
        WHERE et.status = 'IN_PROGRESS' AND ${IN_SCOPE})::int AS employees_in_training`,

  /** params: [scope]. Departments without employee are listed (with 0) company-wide. */
  employeesByDepartment: `
    SELECT d.id, d.name, count(e.id)::int AS employees
    FROM departments d
    LEFT JOIN employees e
      ON e.department_id = d.id
     AND e.deleted_at IS NULL
     AND ($1::uuid IS NULL OR e.manager_id = $1::uuid)
    GROUP BY d.id, d.name
    ORDER BY employees DESC, d.name`,

  /** params: [scope, limit]. Demand = employees whose position requires the skill. */
  demandedSkills: `
    SELECT s.id, s.name, s.category,
           count(DISTINCT g.employee_id)::int AS employees,
           count(DISTINCT g.position_id)::int AS positions
    FROM (${GAPS_CTE} SELECT * FROM gaps) g
    JOIN skills s ON s.id = g.skill_id
    GROUP BY s.id, s.name, s.category
    ORDER BY employees DESC, positions DESC, s.name
    LIMIT $2`,

  /** params: [scope, limit]. Only skills where somebody has a gap. */
  deficientSkills: `
    SELECT s.id, s.name, s.category,
           count(*)::int AS employees_requiring,
           (count(*) FILTER (WHERE g.gap > 0))::int AS employees_to_develop,
           COALESCE(sum(g.gap) FILTER (WHERE g.gap > 0), 0)::int AS total_gap
    FROM (${GAPS_CTE} SELECT * FROM gaps) g
    JOIN skills s ON s.id = g.skill_id
    GROUP BY s.id, s.name, s.category
    HAVING count(*) FILTER (WHERE g.gap > 0) > 0
    ORDER BY total_gap DESC, employees_to_develop DESC, s.name
    LIMIT $2`,

  /** params: [scope, highPriorityGap]. Skills where somebody has a high-priority gap. */
  criticalSkills: `
    SELECT s.id, s.name, s.category,
           count(DISTINCT g.employee_id)::int AS employees_in_high_priority_gap,
           max(g.gap)::int AS largest_gap
    FROM (${GAPS_CTE} SELECT * FROM gaps) g
    JOIN skills s ON s.id = g.skill_id
    WHERE g.gap >= $2
    GROUP BY s.id, s.name, s.category
    ORDER BY employees_in_high_priority_gap DESC, largest_gap DESC, s.name`,

  /** params: [scope, highPriorityGap, limit]. Largest total gap first. */
  employeesWithGaps: `
    SELECT e.id, e.first_name, e.last_name,
           d.name AS department, p.title AS position,
           COALESCE(sum(g.gap) FILTER (WHERE g.gap > 0), 0)::int AS total_gap,
           (count(*) FILTER (WHERE g.gap >= $2))::int AS high_priority_gaps,
           (count(*) FILTER (WHERE g.gap > 0))::int AS skills_to_develop
    FROM (${GAPS_CTE} SELECT * FROM gaps) g
    JOIN employees e ON e.id = g.employee_id
    JOIN departments d ON d.id = e.department_id
    JOIN positions p ON p.id = e.position_id
    GROUP BY e.id, e.first_name, e.last_name, d.name, p.title
    HAVING count(*) FILTER (WHERE g.gap > 0) > 0
    ORDER BY total_gap DESC, high_priority_gaps DESC, e.last_name, e.first_name
    LIMIT $3`,

  /** params: [scope, highPriorityGap] */
  gapSummary: `
    ${GAPS_CTE}
    SELECT
      (count(DISTINCT employee_id) FILTER (WHERE gap > 0))::int AS employees_with_gaps,
      (count(DISTINCT employee_id) FILTER (WHERE gap >= $2))::int AS employees_with_high_priority_gap
    FROM gaps`,

  /** params: none. The catalogue is readable by every role. */
  trainingsByStatus: `
    SELECT status::text AS status, count(*)::int AS count
    FROM trainings
    GROUP BY status`,

  /**
   * params: [scope, skillId or NULL, months].
   * Average level of the assessments recorded each month, over the last
   * `months` months; months without any assessment are returned empty.
   */
  skillsEvolution: `
    SELECT to_char(m.month, 'YYYY-MM') AS month,
           ROUND(AVG(se.level)::numeric, 2)::float8 AS average_level,
           COUNT(se.id)::int AS evaluations
    FROM generate_series(
           (date_trunc('month', current_date) - make_interval(months => $3::int - 1))::date,
           date_trunc('month', current_date)::date,
           interval '1 month'
         ) AS m(month)
    LEFT JOIN (
      SELECT ev.id, ev.level, ev.evaluated_at
      FROM skill_evaluations ev
      JOIN employees e ON e.id = ev.employee_id AND ${IN_SCOPE}
      WHERE $2::uuid IS NULL OR ev.skill_id = $2::uuid
    ) se
      ON se.evaluated_at >= m.month::date
     AND se.evaluated_at < (m.month + interval '1 month')::date
    GROUP BY m.month
    ORDER BY m.month`,

  /** params: [skillId] */
  skillExists: `SELECT 1 FROM skills WHERE id = $1::uuid`,
} as const;
