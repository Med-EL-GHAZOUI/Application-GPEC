import { validateEnv } from './env.validation.js';

const validEnv = {
  NODE_ENV: 'test',
  PORT: '3000',
  DATABASE_HOST: 'localhost',
  DATABASE_PORT: '5432',
  DATABASE_USER: 'gpec',
  DATABASE_PASSWORD: 'secret',
  DATABASE_NAME: 'gpec',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  CORS_ORIGIN: 'http://localhost:4200',
};

describe('validateEnv', () => {
  it('accepts a complete configuration and converts numbers', () => {
    const result = validateEnv(validEnv);
    expect(result.PORT).toBe(3000);
    expect(result.DATABASE_PORT).toBe(5432);
    expect(result.JWT_ACCESS_TTL).toBe('15m');
  });

  it('rejects a missing required variable', () => {
    const { DATABASE_PASSWORD: _omitted, ...incomplete } = validEnv;
    expect(() => validateEnv(incomplete)).toThrow(/DATABASE_PASSWORD/);
  });

  it('rejects a JWT secret shorter than 32 characters', () => {
    expect(() =>
      validateEnv({ ...validEnv, JWT_ACCESS_SECRET: 'short' }),
    ).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('rejects an invalid NODE_ENV', () => {
    expect(() => validateEnv({ ...validEnv, NODE_ENV: 'staging' })).toThrow(
      /NODE_ENV/,
    );
  });
});
