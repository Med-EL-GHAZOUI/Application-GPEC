import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter.js';

const createHost = () => {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ originalUrl: '/api/test', method: 'GET' }),
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
};

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  it('formats an HttpException', () => {
    const { host, status, json } = createHost();
    filter.catch(new NotFoundException('Employee not found'), host);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 404,
        message: 'Employee not found',
        path: '/api/test',
      }),
    );
  });

  it('keeps validation messages as a list', () => {
    const { host, json } = createHost();
    filter.catch(new BadRequestException(['email must be an email']), host);

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ message: ['email must be an email'] }),
    );
  });

  it('hides the details of an unexpected error', () => {
    const { host, status, json } = createHost();
    filter.catch(new Error('password=secret leaked'), host);

    expect(status).toHaveBeenCalledWith(500);
    const body = json.mock.calls[0][0] as { message: string };
    expect(body.message).toBe('Internal server error');
  });
});
