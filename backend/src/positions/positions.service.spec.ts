import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PositionsService } from './positions.service.js';

const POSITION_ID = 'position-1';
const SKILL_ID = 'skill-1';

const build = (
  skill: { id: string; name: string; maxLevel: number } | null,
) => {
  const positions = {
    findOne: vi.fn().mockResolvedValue({ id: POSITION_ID, department: {} }),
  };
  const positionSkills = {
    create: vi.fn((entity: unknown) => entity),
    save: vi.fn().mockResolvedValue(undefined),
    findOne: vi.fn().mockResolvedValue({
      skill: skill ?? {
        id: SKILL_ID,
        name: 'Angular',
        category: 'TECHNICAL',
        maxLevel: 5,
      },
      requiredLevel: 4,
    }),
  };
  const skills = { findOne: vi.fn().mockResolvedValue(skill) };
  const departments = { exists: vi.fn().mockResolvedValue(true) };

  const service = new PositionsService(
    positions as never,
    positionSkills as never,
    skills as never,
    departments as never,
  );
  return { service, positionSkills };
};

describe('PositionsService.addSkill', () => {
  it('rejects a required level above the skill maximum', async () => {
    const { service, positionSkills } = build({
      id: SKILL_ID,
      name: 'Angular',
      maxLevel: 5,
    });

    await expect(
      service.addSkill(POSITION_ID, { skillId: SKILL_ID, requiredLevel: 6 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(positionSkills.save).not.toHaveBeenCalled();
  });

  it('accepts a level equal to the skill maximum', async () => {
    const { service, positionSkills } = build({
      id: SKILL_ID,
      name: 'Angular',
      maxLevel: 5,
    });

    await service.addSkill(POSITION_ID, {
      skillId: SKILL_ID,
      requiredLevel: 5,
    });

    expect(positionSkills.save).toHaveBeenCalledWith({
      positionId: POSITION_ID,
      skillId: SKILL_ID,
      requiredLevel: 5,
    });
  });

  it('rejects an unknown skill with 404', async () => {
    const { service } = build(null);

    await expect(
      service.addSkill(POSITION_ID, { skillId: SKILL_ID, requiredLevel: 3 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
