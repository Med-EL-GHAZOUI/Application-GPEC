import type { TransformFnParams } from 'class-transformer';

/** Trims string inputs; leaves any other value untouched for the validators to reject. */
export const trim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;
