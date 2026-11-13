import { ApiProperty } from '@nestjs/swagger';
import { EmployeeStatus } from '../../common/enums/domain.enums.js';
import type { Employee } from '../entities/employee.entity.js';

class NamedRefDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;
}

class PositionRefDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  title: string;
}

class ManagerRefDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  firstName: string;

  @ApiProperty()
  lastName: string;
}

/**
 * Employee as exposed by the API. The manager is reduced to an identity so
 * that reading one's own profile never reveals the manager's contact details.
 */
export class EmployeeResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  matricule: string;

  @ApiProperty()
  firstName: string;

  @ApiProperty()
  lastName: string;

  @ApiProperty()
  email: string;

  @ApiProperty({ nullable: true, type: String })
  phone: string | null;

  @ApiProperty({ example: '2024-09-01' })
  hireDate: string;

  @ApiProperty({ enum: EmployeeStatus })
  status: EmployeeStatus;

  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  userId: string | null;

  @ApiProperty({ type: NamedRefDto })
  department: NamedRefDto;

  @ApiProperty({ type: PositionRefDto, nullable: true })
  position: PositionRefDto | null;

  @ApiProperty({ type: ManagerRefDto, nullable: true })
  manager: ManagerRefDto | null;

  static from(employee: Employee): EmployeeResponseDto {
    return {
      id: employee.id,
      matricule: employee.matricule,
      firstName: employee.firstName,
      lastName: employee.lastName,
      email: employee.email,
      phone: employee.phone,
      hireDate: employee.hireDate,
      status: employee.status,
      userId: employee.userId,
      department: {
        id: employee.department.id,
        name: employee.department.name,
      },
      position: employee.position
        ? { id: employee.position.id, title: employee.position.title }
        : null,
      manager: employee.manager
        ? {
            id: employee.manager.id,
            firstName: employee.manager.firstName,
            lastName: employee.manager.lastName,
          }
        : null,
    };
  }
}
