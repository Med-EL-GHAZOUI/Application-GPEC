/** The only fields the ranking needs: keeps this logic free of any framework. */
export type RankableTraining = {
  title: string;
  targetLevel: number;
  /** ISO date (YYYY-MM-DD) or null when not scheduled yet. */
  startDate: string | null;
};

export type GapNeed = {
  currentLevel: number;
  requiredLevel: number;
};

/**
 * Picks and orders the trainings that answer a skill gap.
 *
 * A training is useful only if it brings the employee above their current
 * level. Among those, the closest to the level required by the position comes
 * first; at equal distance, one that reaches the requirement beats one that
 * falls short; then the earliest start (unscheduled last), then the title so
 * that the order is stable.
 */
export const rankTrainings = <T extends RankableTraining>(
  candidates: T[],
  { currentLevel, requiredLevel }: GapNeed,
): T[] =>
  candidates
    .filter((training) => training.targetLevel > currentLevel)
    .sort(
      (a, b) =>
        Math.abs(a.targetLevel - requiredLevel) -
          Math.abs(b.targetLevel - requiredLevel) ||
        reachesRequirement(b, requiredLevel) -
          reachesRequirement(a, requiredLevel) ||
        compareStartDates(a.startDate, b.startDate) ||
        a.title.localeCompare(b.title),
    );

const reachesRequirement = (
  training: RankableTraining,
  requiredLevel: number,
): number => (training.targetLevel >= requiredLevel ? 1 : 0);

const compareStartDates = (a: string | null, b: string | null): number => {
  if (a === b) {
    return 0;
  }
  if (a === null) {
    return 1;
  }
  if (b === null) {
    return -1;
  }
  return a < b ? -1 : 1;
};
