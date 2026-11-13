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
  CreateSkillDto,
  SkillQueryDto,
  UpdateSkillDto,
} from './dto/skill.dto.js';
import { Skill } from './entities/skill.entity.js';
import { SkillsService } from './skills.service.js';

@ApiTags('skills')
@ApiBearerAuth()
@Controller('skills')
export class SkillsController {
  constructor(private readonly skillsService: SkillsService) {}

  @Get()
  @ApiOperation({
    summary: 'List skills (paginated; filter by name or category)',
  })
  findAll(@Query() query: SkillQueryDto): Promise<Page<Skill>> {
    return this.skillsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<Skill> {
    return this.skillsService.findOne(id);
  }

  @Roles(Role.Admin, Role.Hr)
  @Post()
  create(@Body() dto: CreateSkillDto): Promise<Skill> {
    return this.skillsService.create(dto);
  }

  @Roles(Role.Admin, Role.Hr)
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSkillDto,
  ): Promise<Skill> {
    return this.skillsService.update(id, dto);
  }

  @Roles(Role.Admin, Role.Hr)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.skillsService.remove(id);
  }
}
