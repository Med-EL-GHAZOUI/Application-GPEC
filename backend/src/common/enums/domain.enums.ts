export enum EmployeeStatus {
  Active = 'ACTIVE',
  OnLeave = 'ON_LEAVE',
  Inactive = 'INACTIVE',
}

export enum PositionLevel {
  Junior = 'JUNIOR',
  Intermediate = 'INTERMEDIATE',
  Senior = 'SENIOR',
  Lead = 'LEAD',
  Manager = 'MANAGER',
}

export enum SkillCategory {
  Technical = 'TECHNICAL',
  Soft = 'SOFT',
}

/** How an employee level compares with the level required by the position. */
export enum GapStatus {
  Mastered = 'MASTERED',
  ToDevelop = 'TO_DEVELOP',
  AboveRequirement = 'ABOVE_REQUIREMENT',
}

export enum GapPriority {
  High = 'HIGH',
  Medium = 'MEDIUM',
  Low = 'LOW',
  None = 'NONE',
}

export enum TrainingStatus {
  Planned = 'PLANNED',
  Open = 'OPEN',
  InProgress = 'IN_PROGRESS',
  Completed = 'COMPLETED',
  Cancelled = 'CANCELLED',
}

export enum EnrollmentStatus {
  Enrolled = 'ENROLLED',
  InProgress = 'IN_PROGRESS',
  Completed = 'COMPLETED',
  Cancelled = 'CANCELLED',
}
