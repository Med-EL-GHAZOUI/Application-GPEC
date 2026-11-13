import {
  GapPriority,
  GapStatus,
  SkillCategory,
} from '../common/enums/domain.enums.js';
import {
  buildSkillGap,
  computeGap,
  priorityOf,
  sortByUrgency,
  statusOf,
  summarize,
  type SkillGap,
} from './gap-calculator.js';

const skill = (name: string) => ({
  id: `id-${name}`,
  name,
  category: SkillCategory.Technical,
  maxLevel: 5,
});

const gapOf = (
  name: string,
  requiredLevel: number,
  currentLevel: number | null,
) =>
  buildSkillGap({
    skill: skill(name),
    requiredLevel,
    currentLevel,
    evaluatedAt: currentLevel === null ? null : '2026-01-01',
  });

describe('computeGap', () => {
  it('is the required level minus the current level (spec example: 4 vs 2 = 2)', () => {
    expect(computeGap(4, 2)).toBe(2);
  });

  it.each([
    [3, 3, 0],
    [1, 5, -4],
    [5, 1, 4],
  ])('required %i, current %i gives %i', (required, current, expected) => {
    expect(computeGap(required, current)).toBe(expected);
  });
});

describe('statusOf', () => {
  it.each([
    [-3, GapStatus.AboveRequirement],
    [-1, GapStatus.AboveRequirement],
    [0, GapStatus.Mastered],
    [1, GapStatus.ToDevelop],
    [4, GapStatus.ToDevelop],
  ])('gap %i is %s', (gap, status) => {
    expect(statusOf(gap)).toBe(status);
  });
});

describe('priorityOf', () => {
  it.each([
    [-2, GapPriority.None],
    [0, GapPriority.None],
    [1, GapPriority.Low],
    [2, GapPriority.Medium],
    [3, GapPriority.High],
    [4, GapPriority.High],
    [9, GapPriority.High],
  ])('gap %i has priority %s', (gap, priority) => {
    expect(priorityOf(gap)).toBe(priority);
  });
});

describe('buildSkillGap', () => {
  it('describes a development need', () => {
    expect(gapOf('Angular', 4, 2)).toMatchObject({
      currentLevel: 2,
      requiredLevel: 4,
      gap: 2,
      status: GapStatus.ToDevelop,
      priority: GapPriority.Medium,
      evaluatedAt: '2026-01-01',
    });
  });

  it('counts a skill that was never assessed as level 0, and says so', () => {
    expect(gapOf('Docker', 3, null)).toMatchObject({
      currentLevel: 0,
      gap: 3,
      status: GapStatus.ToDevelop,
      priority: GapPriority.High,
      evaluatedAt: null,
    });
  });

  it('describes a mastered skill without priority', () => {
    expect(gapOf('SQL', 2, 2)).toMatchObject({
      gap: 0,
      status: GapStatus.Mastered,
      priority: GapPriority.None,
    });
  });

  it('describes a level above the need with a negative gap and no priority', () => {
    expect(gapOf('Communication', 3, 5)).toMatchObject({
      gap: -2,
      status: GapStatus.AboveRequirement,
      priority: GapPriority.None,
    });
  });
});

describe('sortByUrgency', () => {
  it('puts the largest gap first, then sorts by name', () => {
    const sorted = sortByUrgency([
      gapOf('SQL', 2, 2),
      gapOf('Angular', 4, 2),
      gapOf('Docker', 3, null),
      gapOf('Java', 4, 2),
      gapOf('Communication', 3, 4),
    ]);

    expect(sorted.map((item) => item.skill.name)).toEqual([
      'Docker',
      'Angular',
      'Java',
      'SQL',
      'Communication',
    ]);
  });

  it('does not mutate its input', () => {
    const input = [gapOf('B', 1, 1), gapOf('A', 3, 0)];
    sortByUrgency(input);
    expect(input.map((item) => item.skill.name)).toEqual(['B', 'A']);
  });
});

describe('summarize', () => {
  it('counts each status and sums only the positive gaps', () => {
    const gaps: SkillGap[] = [
      gapOf('Docker', 3, null), // +3
      gapOf('Angular', 4, 2), // +2
      gapOf('SQL', 2, 2), // 0
      gapOf('Communication', 3, 4), // -1, ignored in the total
    ];

    expect(summarize(gaps)).toEqual({
      requiredSkills: 4,
      toDevelop: 2,
      mastered: 1,
      aboveRequirement: 1,
      totalGap: 5,
    });
  });

  it('handles a position without required skills', () => {
    expect(summarize([])).toEqual({
      requiredSkills: 0,
      toDevelop: 0,
      mastered: 0,
      aboveRequirement: 0,
      totalGap: 0,
    });
  });
});
