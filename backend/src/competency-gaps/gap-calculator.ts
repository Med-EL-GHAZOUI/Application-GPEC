import { GapPriority, GapStatus } from '../common/enums/domain.enums.js';
import type { SkillCategory } from '../common/enums/domain.enums.js';

/** Gap from which a development need is a high priority. */
export const HIGH_PRIORITY_GAP = 3;
export const MEDIUM_PRIORITY_GAP = 2;

/** Level assumed for a required skill that has never been assessed. */
export const NOT_EVALUATED_LEVEL = 0;

export type SkillGapInput = {
  skill: {
    id: string;
    name: string;
    category: SkillCategory;
    maxLevel: number;
  };
  requiredLevel: number;
  /** Null when the employee has never been assessed on this skill. */
  currentLevel: number | null;
  evaluatedAt: string | null;
};

export type SkillGap = {
  skill: SkillGapInput['skill'];
  currentLevel: number;
  requiredLevel: number;
  /** requiredLevel - currentLevel: positive means a development need. */
  gap: number;
  status: GapStatus;
  priority: GapPriority;
  evaluatedAt: string | null;
};

export type GapSummary = {
  requiredSkills: number;
  toDevelop: number;
  mastered: number;
  aboveRequirement: number;
  /** Sum of the positive gaps: how much development the employee needs overall. */
  totalGap: number;
};

export const computeGap = (
  requiredLevel: number,
  currentLevel: number,
): number => requiredLevel - currentLevel;

export const statusOf = (gap: number): GapStatus => {
  if (gap > 0) {
    return GapStatus.ToDevelop;
  }
  return gap === 0 ? GapStatus.Mastered : GapStatus.AboveRequirement;
};

/** Only a development need has a priority; it grows with the gap. */
export const priorityOf = (gap: number): GapPriority => {
  if (gap >= HIGH_PRIORITY_GAP) {
    return GapPriority.High;
  }
  if (gap >= MEDIUM_PRIORITY_GAP) {
    return GapPriority.Medium;
  }
  return gap > 0 ? GapPriority.Low : GapPriority.None;
};

export const buildSkillGap = (input: SkillGapInput): SkillGap => {
  const currentLevel = input.currentLevel ?? NOT_EVALUATED_LEVEL;
  const gap = computeGap(input.requiredLevel, currentLevel);

  return {
    skill: input.skill,
    currentLevel,
    requiredLevel: input.requiredLevel,
    gap,
    status: statusOf(gap),
    priority: priorityOf(gap),
    evaluatedAt: input.evaluatedAt,
  };
};

/** Largest gap first, then alphabetical so that the order is stable. */
export const sortByUrgency = (gaps: SkillGap[]): SkillGap[] =>
  [...gaps].sort(
    (a, b) => b.gap - a.gap || a.skill.name.localeCompare(b.skill.name),
  );

export const summarize = (gaps: SkillGap[]): GapSummary => ({
  requiredSkills: gaps.length,
  toDevelop: gaps.filter((item) => item.status === GapStatus.ToDevelop).length,
  mastered: gaps.filter((item) => item.status === GapStatus.Mastered).length,
  aboveRequirement: gaps.filter(
    (item) => item.status === GapStatus.AboveRequirement,
  ).length,
  totalGap: gaps.reduce((sum, item) => sum + Math.max(item.gap, 0), 0),
});
