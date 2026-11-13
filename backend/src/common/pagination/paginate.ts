import type { ObjectLiteral, SelectQueryBuilder } from 'typeorm';

export type Page<T> = {
  data: T[];
  total: number;
  page: number;
  limit: number;
};

type PageRequest = { page: number; limit: number };

export const toPage = <T>(
  data: T[],
  total: number,
  { page, limit }: PageRequest,
): Page<T> => ({ data, total, page, limit });

/** Applies server-side pagination to a query builder and returns the standard page envelope. */
export const paginate = async <T extends ObjectLiteral>(
  queryBuilder: SelectQueryBuilder<T>,
  request: PageRequest,
): Promise<Page<T>> => {
  const [data, total] = await queryBuilder
    .skip((request.page - 1) * request.limit)
    .take(request.limit)
    .getManyAndCount();
  return toPage(data, total, request);
};

/** Builds a `%text%` pattern for ILIKE, escaping the wildcards typed by the user. */
export const toLikePattern = (text: string): string =>
  `%${text.replace(/[\\%_]/g, '\\$&')}%`;
