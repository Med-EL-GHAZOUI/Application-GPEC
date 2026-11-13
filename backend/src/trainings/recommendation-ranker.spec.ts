import {
  rankTrainings,
  type RankableTraining,
} from './recommendation-ranker.js';

const training = (
  title: string,
  targetLevel: number,
  startDate: string | null = null,
): RankableTraining => ({ title, targetLevel, startDate });

const titles = (list: RankableTraining[]) => list.map((item) => item.title);

describe('rankTrainings', () => {
  it('recommends the training that reaches the requirement (spec example: level 2, required 4)', () => {
    const ranked = rankTrainings(
      [training('Angular Basics', 3), training('Angular Advanced', 4)],
      { currentLevel: 2, requiredLevel: 4 },
    );
    expect(ranked[0].title).toBe('Angular Advanced');
  });

  it('drops trainings that do not bring the employee above their current level', () => {
    const ranked = rankTrainings(
      [training('Intro', 1), training('Same level', 2), training('Next', 3)],
      { currentLevel: 2, requiredLevel: 4 },
    );
    expect(titles(ranked)).toEqual(['Next']);
  });

  it('orders by distance to the required level', () => {
    const ranked = rankTrainings(
      [training('A3', 3), training('A5', 5), training('A4', 4)],
      { currentLevel: 1, requiredLevel: 4 },
    );
    expect(ranked[0].title).toBe('A4');
  });

  it('prefers a training that reaches the requirement over one that falls short at equal distance', () => {
    const ranked = rankTrainings(
      [training('Short (3)', 3), training('Reaches (5)', 5)],
      { currentLevel: 1, requiredLevel: 4 },
    );
    expect(titles(ranked)).toEqual(['Reaches (5)', 'Short (3)']);
  });

  it('breaks ties by earliest start date, unscheduled last', () => {
    const ranked = rankTrainings(
      [
        training('Unscheduled', 4),
        training('Later', 4, '2026-09-01'),
        training('Sooner', 4, '2026-03-01'),
      ],
      { currentLevel: 1, requiredLevel: 4 },
    );
    expect(titles(ranked)).toEqual(['Sooner', 'Later', 'Unscheduled']);
  });

  it('finally breaks ties by title so that the order is stable', () => {
    const ranked = rankTrainings(
      [training('Beta', 4, '2026-03-01'), training('Alpha', 4, '2026-03-01')],
      { currentLevel: 1, requiredLevel: 4 },
    );
    expect(titles(ranked)).toEqual(['Alpha', 'Beta']);
  });

  it('returns nothing when no training is useful', () => {
    expect(
      rankTrainings([training('Low', 1)], {
        currentLevel: 3,
        requiredLevel: 5,
      }),
    ).toEqual([]);
    expect(rankTrainings([], { currentLevel: 0, requiredLevel: 3 })).toEqual(
      [],
    );
  });

  it('works from level 0 (skill never assessed)', () => {
    const ranked = rankTrainings(
      [training('Fundamentals', 1), training('Pro', 3)],
      {
        currentLevel: 0,
        requiredLevel: 3,
      },
    );
    expect(ranked[0].title).toBe('Pro');
  });

  it('does not mutate its input', () => {
    const input = [training('B', 4), training('A', 3)];
    rankTrainings(input, { currentLevel: 1, requiredLevel: 4 });
    expect(titles(input)).toEqual(['B', 'A']);
  });
});
