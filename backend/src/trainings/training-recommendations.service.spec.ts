import { TrainingStatus } from '../common/enums/domain.enums.js';
import { TrainingRecommendationsService } from './training-recommendations.service.js';

const training = (
  id: string,
  skillId: string,
  targetLevel: number,
  startDate: string | null = null,
) => ({
  id,
  title: `Training ${id}`,
  skillId,
  skill: { id: skillId, name: `Skill ${skillId}`, category: 'TECHNICAL' },
  targetLevel,
  durationHours: 10,
  provider: null,
  startDate,
  capacity: 10,
  status: TrainingStatus.Open,
});

const build = (candidates: ReturnType<typeof training>[]) => {
  const queryBuilder: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ['innerJoinAndSelect', 'where', 'andWhere']) {
    queryBuilder[method] = vi.fn(() => queryBuilder);
  }
  queryBuilder.getMany = vi.fn().mockResolvedValue(candidates);

  const trainings = { createQueryBuilder: vi.fn(() => queryBuilder) };
  const trainingsService = {
    countActiveEnrollments: vi.fn().mockResolvedValue(new Map([['t-adv', 3]])),
  };
  const service = new TrainingRecommendationsService(
    trainings as never,
    trainingsService as never,
  );
  return { service, queryBuilder, trainings, trainingsService };
};

describe('TrainingRecommendationsService.recommend', () => {
  it('returns the best training per skill, ranked by closeness to the requirement', async () => {
    const { service } = build([
      training('t-basic', 'angular', 3),
      training('t-adv', 'angular', 4),
      training('t-docker', 'docker', 3),
    ]);

    const result = await service.recommend(
      'employee-1',
      [
        { skillId: 'angular', currentLevel: 2, requiredLevel: 4 },
        { skillId: 'docker', currentLevel: 0, requiredLevel: 3 },
      ],
      1,
    );

    expect(result.get('angular')?.map((item) => item.id)).toEqual(['t-adv']);
    expect(result.get('docker')?.map((item) => item.id)).toEqual(['t-docker']);
  });

  it('never proposes a training that does not raise the current level', async () => {
    const { service } = build([training('t-low', 'angular', 2)]);

    const result = await service.recommend(
      'employee-1',
      [{ skillId: 'angular', currentLevel: 2, requiredLevel: 4 }],
      5,
    );

    expect(result.get('angular')).toEqual([]);
  });

  it('caps the number of alternatives per skill', async () => {
    const { service } = build([
      training('t1', 'angular', 3),
      training('t2', 'angular', 4),
      training('t3', 'angular', 5),
    ]);

    const result = await service.recommend(
      'employee-1',
      [{ skillId: 'angular', currentLevel: 1, requiredLevel: 4 }],
      2,
    );

    expect(result.get('angular')).toHaveLength(2);
  });

  it('exposes the free seats of the recommended training', async () => {
    const { service } = build([training('t-adv', 'angular', 4)]);

    const result = await service.recommend(
      'employee-1',
      [{ skillId: 'angular', currentLevel: 2, requiredLevel: 4 }],
      1,
    );

    expect(result.get('angular')?.[0].availableSeats).toBe(7); // capacity 10, 3 taken
  });

  it('does not query anything when there is no development need', async () => {
    const { service, trainings } = build([]);

    const result = await service.recommend('employee-1', [], 1);

    expect(result.size).toBe(0);
    expect(trainings.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('filters capacity, history and status in a single query', async () => {
    const { service, trainings, queryBuilder } = build([]);

    await service.recommend(
      'employee-1',
      [
        { skillId: 'angular', currentLevel: 1, requiredLevel: 3 },
        { skillId: 'docker', currentLevel: 0, requiredLevel: 2 },
      ],
      1,
    );

    expect(trainings.createQueryBuilder).toHaveBeenCalledOnce();
    const conditions = queryBuilder.andWhere.mock.calls
      .map(([sql]) => String(sql))
      .join(' ');
    expect(conditions).toContain('< training.capacity');
    expect(conditions).toContain('NOT EXISTS');
    expect(queryBuilder.where.mock.calls[0][1]).toEqual({
      skillIds: ['angular', 'docker'],
    });
  });
});
