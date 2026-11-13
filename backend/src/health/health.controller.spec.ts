import { ServiceUnavailableException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  it('reports ok when the database answers', async () => {
    const dataSource = {
      query: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    };
    const controller = new HealthController(
      dataSource as unknown as DataSource,
    );

    await expect(controller.check()).resolves.toEqual({
      status: 'ok',
      database: 'up',
    });
  });

  it('throws 503 when the database is unreachable', async () => {
    const dataSource = { query: vi.fn().mockRejectedValue(new Error('down')) };
    const controller = new HealthController(
      dataSource as unknown as DataSource,
    );

    await expect(controller.check()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
