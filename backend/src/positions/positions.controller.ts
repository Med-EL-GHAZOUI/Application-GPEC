import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Role } from '../common/enums/role.enum.js';
import type { Page } from '../common/pagination/paginate.js';
import {
  AddPositionSkillDto,
  CreatePositionDto,
  PositionQueryDto,
  UpdatePositionDto,
  UpdatePositionSkillDto,
} from './dto/position.dto.js';
import { PositionSkillResponseDto } from './dto/position-skill-response.dto.js';
import { Position } from './entities/position.entity.js';
import { PositionsService } from './positions.service.js';

@ApiTags('positions')
@ApiBearerAuth()
@Controller('positions')
export class PositionsController {
  constructor(private readonly positionsService: PositionsService) {}

  @Get()
  @ApiOperation({
    summary: 'List positions (paginated; filter by title, department, level)',
  })
  findAll(@Query() query: PositionQueryDto): Promise<Page<Position>> {
    return this.positionsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<Position> {
    return this.positionsService.findOne(id);
  }

  @Roles(Role.Admin, Role.Hr)
  @Post()
  create(@Body() dto: CreatePositionDto): Promise<Position> {
    return this.positionsService.create(dto);
  }

  @Roles(Role.Admin, Role.Hr)
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePositionDto,
  ): Promise<Position> {
    return this.positionsService.update(id, dto);
  }

  @Roles(Role.Admin, Role.Hr)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.positionsService.remove(id);
  }

  @Get(':id/skills')
  @ApiOperation({
    summary: 'Skills required by the position, with minimum levels',
  })
  listSkills(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PositionSkillResponseDto[]> {
    return this.positionsService.listSkills(id);
  }

  @Roles(Role.Admin, Role.Hr)
  @Post(':id/skills')
  @ApiOperation({
    summary: 'Require a skill at a minimum level for this position',
  })
  addSkill(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddPositionSkillDto,
  ): Promise<PositionSkillResponseDto> {
    return this.positionsService.addSkill(id, dto);
  }

  @Roles(Role.Admin, Role.Hr)
  @Patch(':id/skills/:skillId')
  updateSkill(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('skillId', ParseUUIDPipe) skillId: string,
    @Body() dto: UpdatePositionSkillDto,
  ): Promise<PositionSkillResponseDto> {
    return this.positionsService.updateSkill(id, skillId, dto.requiredLevel);
  }

  @Roles(Role.Admin, Role.Hr)
  @Delete(':id/skills/:skillId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeSkill(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('skillId', ParseUUIDPipe) skillId: string,
  ): Promise<void> {
    return this.positionsService.removeSkill(id, skillId);
  }
}
