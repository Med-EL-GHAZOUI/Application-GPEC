import type { TransformFnParams } from 'class-transformer';

/** Trims and lower-cases an email so that lookups and uniqueness are case-insensitive. */
export const normalizeEmail = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;
