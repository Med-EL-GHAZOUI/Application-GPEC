import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsUUID } from 'class-validator';
import { EnrollmentStatus } from '../../common/enums/domain.enums.js';
import type { EmployeeTraining } from '../entities/employee-training.entity.js';
import { TrainingSummaryDto } from './training-response.dto.js';

export class EnrollEmployeeDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  employeeId: string;
}

export class UpdateEnrollmentStatusDto {
  @ApiProperty({ enum: EnrollmentStatus })
  @IsEnum(EnrollmentStatus)
  status: EnrollmentStatus;
}

class ParticipantDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  firstName: string;

  @ApiProperty()
  lastName: string;
}

/** An enrollment seen from the training: who takes part. */
export class ParticipantResponseDto {
  @ApiProperty({ type: ParticipantDto })
  employee: ParticipantDto;

  @ApiProperty({ enum: EnrollmentStatus })
  status: EnrollmentStatus;

  @ApiProperty()
  enrolledAt: Date;

  @ApiProperty({ nullable: true, type: Date })
  completedAt: Date | null;

  static from(enrollment: EmployeeTraining): ParticipantResponseDto {
    return {
      employee: {
        id: enrollment.employee.id,
        firstName: enrollment.employee.firstName,
        lastName: enrollment.employee.lastName,
      },
      status: enrollment.status,
      enrolledAt: enrollment.enrolledAt,
      completedAt: enrollment.completedAt,
    };
  }
}

/** An enrollment seen from the employee: which training they follow. */
export class EmployeeTrainingResponseDto {
  @ApiProperty({ type: TrainingSummaryDto })
  training: TrainingSummaryDto;

  @ApiProperty({ enum: EnrollmentStatus })
  status: EnrollmentStatus;

  @ApiProperty()
  enrolledAt: Date;

  @ApiProperty({ nullable: true, type: Date })
  completedAt: Date | null;
}
