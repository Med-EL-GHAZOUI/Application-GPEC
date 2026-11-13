import {
  BadRequestException,
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
import { Department } from '../departments/entities/department.entity.js';
import { Skill } from '../skills/entities/skill.entity.js';
import type {
  AddPositionSkillDto,
  CreatePositionDto,
  PositionQueryDto,
  UpdatePositionDto,
} from './dto/position.dto.js';
import { PositionSkillResponseDto } from './dto/position-skill-response.dto.js';
import { PositionSkill } from './entities/position-skill.entity.js';
import { Position } from './entities/position.entity.js';

@Injectable()
export class PositionsService {
  constructor(
    @InjectRepository(Position)
    private readonly positions: Repository<Position>,
    @InjectRepository(PositionSkill)
    private readonly positionSkills: Repository<PositionSkill>,
    @InjectRepository(Skill) private readonly skills: Repository<Skill>,
    @InjectRepository(Department)
    private readonly departments: Repository<Department>,
  ) {}

  findAll(query: PositionQueryDto): Promise<Page<Position>> {
    const queryBuilder = this.positions
      .createQueryBuilder('position')
      .leftJoinAndSelect('position.department', 'department')
      .orderBy('position.title', 'ASC');

    if (query.search) {
      queryBuilder.andWhere('position.title ILIKE :search', {
        search: toLikePattern(query.search),
      });
    }
    if (query.departmentId) {
      queryBuilder.andWhere('position.departmentId = :departmentId', {
        departmentId: query.departmentId,
      });
    }
    if (query.level) {
      queryBuilder.andWhere('position.level = :level', { level: query.level });
    }
    return paginate(queryBuilder, query);
  }

  async findOne(id: string): Promise<Position> {
    const position = await this.positions.findOne({
      where: { id },
      relations: { department: true },
    });
    if (!position) {
      throw new NotFoundException('Position not found');
    }
    return position;
  }

  async create(dto: CreatePositionDto): Promise<Position> {
    await this.assertDepartmentExists(dto.departmentId);
    try {
      const created = await this.positions.save(
        this.positions.create({
          title: dto.title,
          level: dto.level,
          departmentId: dto.departmentId,
          description: dto.description ?? null,
        }),
      );
      return await this.findOne(created.id);
    } catch (error) {
      throw this.translate(error);
    }
  }

  async update(id: string, dto: UpdatePositionDto): Promise<Position> {
    const position = await this.findOne(id);
    if (dto.departmentId) {
      await this.assertDepartmentExists(dto.departmentId);
    }
    const { departmentId, ...fields } = dto;
    Object.assign(position, fields);
    if (departmentId) {
      position.departmentId = departmentId;
      position.department = { id: departmentId } as Department;
    }
    try {
      await this.positions.save(position);
      return await this.findOne(id);
    } catch (error) {
      throw this.translate(error);
    }
  }

  async remove(id: string): Promise<void> {
    const position = await this.findOne(id);
    try {
      await this.positions.remove(position);
    } catch (error) {
      throw this.translate(error);
    }
  }

  async listSkills(positionId: string): Promise<PositionSkillResponseDto[]> {
    await this.findOne(positionId);
    const links = await this.positionSkills.find({
      where: { positionId },
      relations: { skill: true },
      order: { skill: { name: 'ASC' } },
    });
    return links.map((link) => PositionSkillResponseDto.from(link));
  }

  async addSkill(
    positionId: string,
    { skillId, requiredLevel }: AddPositionSkillDto,
  ): Promise<PositionSkillResponseDto> {
    await this.findOne(positionId);
    const skill = await this.findSkill(skillId);
    this.assertLevelWithinSkill(requiredLevel, skill);

    try {
      await this.positionSkills.save(
        this.positionSkills.create({ positionId, skillId, requiredLevel }),
      );
    } catch (error) {
      throw this.translate(error);
    }
    return this.getSkillLink(positionId, skillId);
  }

  async updateSkill(
    positionId: string,
    skillId: string,
    requiredLevel: number,
  ): Promise<PositionSkillResponseDto> {
    const link = await this.findLink(positionId, skillId);
    this.assertLevelWithinSkill(requiredLevel, link.skill);
    link.requiredLevel = requiredLevel;
    await this.positionSkills.save(link);
    return this.getSkillLink(positionId, skillId);
  }

  async removeSkill(positionId: string, skillId: string): Promise<void> {
    const link = await this.findLink(positionId, skillId);
    await this.positionSkills.remove(link);
  }

  private async getSkillLink(
    positionId: string,
    skillId: string,
  ): Promise<PositionSkillResponseDto> {
    return PositionSkillResponseDto.from(
      await this.findLink(positionId, skillId),
    );
  }

  private async findLink(
    positionId: string,
    skillId: string,
  ): Promise<PositionSkill> {
    const link = await this.positionSkills.findOne({
      where: { positionId, skillId },
      relations: { skill: true },
    });
    if (!link) {
      throw new NotFoundException('This skill is not required by the position');
    }
    return link;
  }

  private async findSkill(skillId: string): Promise<Skill> {
    const skill = await this.skills.findOne({ where: { id: skillId } });
    if (!skill) {
      throw new NotFoundException('Skill not found');
    }
    return skill;
  }

  private async assertDepartmentExists(departmentId: string): Promise<void> {
    if (!(await this.departments.exists({ where: { id: departmentId } }))) {
      throw new NotFoundException('Department not found');
    }
  }

  private assertLevelWithinSkill(requiredLevel: number, skill: Skill): void {
    if (requiredLevel > skill.maxLevel) {
      throw new BadRequestException(
        `requiredLevel cannot exceed the maximum level of ${skill.name} (${skill.maxLevel})`,
      );
    }
  }

  private translate(error: unknown): unknown {
    if (isUniqueViolation(error)) {
      return new ConflictException(
        'This position already exists in the department, or the skill is already required',
      );
    }
    if (isForeignKeyViolation(error)) {
      return new ConflictException('Position is still assigned to employees');
    }
    return error;
  }
}
