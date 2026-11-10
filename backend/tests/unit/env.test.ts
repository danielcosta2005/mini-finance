import { describe, expect, it } from 'vitest';
import { parseEnvironment } from '../../src/config/env.js';

// Fictitious connection; these tests never access a database.
const databaseUrl =
  'postgresql://placeholder:placeholder@localhost:5432/example';

describe('environment validation', () => {
  it('provides development defaults while preserving the database URL', () => {
    expect(parseEnvironment({ DATABASE_URL: databaseUrl })).toEqual({
      NODE_ENV: 'development',
      HOST: '0.0.0.0',
      PORT: 3000,
      DATABASE_URL: databaseUrl,
    });
  });

  it.each(['', '0', '-1', '65536', '3.5', 'invalid'])(
    'rejects invalid port %j',
    (port) => {
      expect(() =>
        parseEnvironment({ DATABASE_URL: databaseUrl, PORT: port }),
      ).toThrow('PORT');
    },
  );

  it.each([
    undefined,
    '',
    'invalid',
    'https://example.invalid/db',
    'postgresql://localhost',
  ])('rejects a missing or invalid PostgreSQL URL', (url) => {
    const input: NodeJS.ProcessEnv = {};
    if (url !== undefined) input.DATABASE_URL = url;
    expect(() => parseEnvironment(input)).toThrow('DATABASE_URL');
  });

  it('converts a configured port and accepts production', () => {
    expect(
      parseEnvironment({
        DATABASE_URL: databaseUrl,
        PORT: '4000',
        NODE_ENV: 'production',
      }),
    ).toMatchObject({ PORT: 4000, NODE_ENV: 'production' });
  });

  it('rejects an invalid execution environment', () => {
    expect(() =>
      parseEnvironment({ DATABASE_URL: databaseUrl, NODE_ENV: 'invalid' }),
    ).toThrow('NODE_ENV');
  });

  it('reports field names without exposing supplied values', () => {
    const invalidValue = 'placeholder-sensitive-value';
    try {
      parseEnvironment({ DATABASE_URL: invalidValue });
      expect.fail('Invalid environment must be rejected');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain('DATABASE_URL');
      expect((error as Error).message).not.toContain(invalidValue);
    }
  });
});
