const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';

const codeOf = (error: unknown): string | undefined =>
  (error as { driverError?: { code?: string } } | null)?.driverError?.code;

export const isUniqueViolation = (error: unknown): boolean =>
  codeOf(error) === UNIQUE_VIOLATION;

export const isForeignKeyViolation = (error: unknown): boolean =>
  codeOf(error) === FOREIGN_KEY_VIOLATION;
