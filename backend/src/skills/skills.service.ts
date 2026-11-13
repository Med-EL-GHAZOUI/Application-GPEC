import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  isForeignKeyViolation,
  isUniqueViolation,
} from '../common/database/pg-errors.js';
import {
  type Page,
  paginate,
  toLikePattern,
} from '../common/pagination/paginate.js';
import { PositionSkill } from '../positions/entities/position-skill.entity.js';
import {
  type CreateSkillDto,
  DEFAULT_SKILL_MAX_LEVEL,
  type SkillQueryDto,
  type UpdateSkillDto,
} from './dto/skill.dto.js';
import { Skill } from './entities/skill.entity.js';

@Injectable()
export class SkillsService {
  constructor(
    @InjectRepository(Skill) private readonly skills: Repository<Skill>,
    @InjectRepository(PositionSkill)
    private readonly positionSkills: Repository<PositionSkill>,
  ) {}

  findAll(query: SkillQueryDto): Promise<Page<Skill>> {
    const queryBuilder = this.skills
      .createQueryBuilder('skill')
      .orderBy('skill.name', 'ASC');

    if (query.search) {
      queryBuilder.andWhere('skill.name ILIKE :search', {
        search: toLikePattern(query.search),
      });
    }
    if (query.category) {
      queryBuilder.andWhere('skill.category = :category', {
        category: query.category,
      });
    }
    return paginate(queryBuilder, query);
  }

  async findOne(id: string): Promise<Skill> {
    const skill = await this.skills.findOne({ where: { id } });
    if (!skill) {
      throw new NotFoundException('Skill not found');
    }
    return skill;
  }

  async create(dto: CreateSkillDto): Promise<Skill> {
    try {
      return await this.skills.save(
        this.skills.create({
          name: dto.name,
          category: dto.category,
          description: dto.description ?? null,
          maxLevel: dto.maxLevel ?? DEFAULT_SKILL_MAX_LEVEL,
        }),
      );
    } catch (error) {
      throw this.translate(error);
    }
  }

  async update(id: string, dto: UpdateSkillDto): Promise<Skill> {
    const skill = await this.findOne(id);
    if (dto.maxLevel !== undefined) {
      await this.assertMaxLevelCoversRequirements(id, dto.maxLevel);
    }
    Object.assign(skill, dto);
    try {
      return await this.skills.save(skill);
    } catch (error) {
      throw this.translate(error);
    }
  }

  async remove(id: string): Promise<void> {
    const skill = await this.findOne(id);
    try {
      await this.skills.remove(skill);
    } catch (error) {
      throw this.translate(error);
    }
  }

  /** The maximum level cannot drop below a level a position already requires. */
  private async assertMaxLevelCoversRequirements(
    skillId: string,
    maxLevel: number,
  ): Promise<void> {
    const highestRequired = await this.positionSkills
      .createQueryBuilder('ps')
      .select('MAX(ps.requiredLevel)', 'max')
      .where('ps.skillId = :skillId', { skillId })
      .getRawOne<{ max: number | null }>();

    if (highestRequired?.max != null && highestRequired.max > maxLevel) {
      throw new ConflictException(
        `A position requires level ${highestRequired.max} of this skill`,
      );
    }
  }

  private translate(error: unknown): unknown {
    if (isUniqueViolation(error)) {
      return new ConflictException('A skill with this name already exists');
    }
    if (isForeignKeyViolation(error)) {
      return new ConflictException('Skill is still used by positions');
    }
    return error;
  }
}
