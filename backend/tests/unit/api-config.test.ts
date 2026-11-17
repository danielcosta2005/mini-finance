import { describe, expect, it } from 'vitest';
import { parseApiConfig } from '../../src/config/api.js';

describe('API configuration', () => {
  it('uses development defaults when explicitly given an empty environment', () => {
    expect(parseApiConfig({})).toEqual({
      origins: ['http://localhost:5173', 'http://127.0.0.1:5173'],
      production: false,
      sessionTtlSeconds: 604800,
      timeZone: 'America/Sao_Paulo',
      cookieName: 'minifinance_session',
    });
  });
  it('parses exact HTTPS origins, timezone and TTL in production', () => {
    expect(
      parseApiConfig({
        NODE_ENV: 'production',
        APP_ORIGINS: 'https://app.example.com, https://portal.example.com:8443',
        SESSION_TTL_SECONDS: '300',
        APP_TIME_ZONE: 'UTC',
      }),
    ).toEqual({
      origins: ['https://app.example.com', 'https://portal.example.com:8443'],
      production: true,
      sessionTtlSeconds: 300,
      timeZone: 'UTC',
      cookieName: '__Host-minifinance_session',
    });
  });
  it('supports explicit production mode regardless of NODE_ENV', () => {
    expect(
      parseApiConfig(
        { NODE_ENV: 'production', APP_ORIGINS: 'http://app.example.com' },
        false,
      ).production,
    ).toBe(false);
    expect(() => parseApiConfig({ NODE_ENV: 'development' }, true)).toThrow(
      'APP_ORIGINS is required in production',
    );
  });
  it.each([undefined, ''])(
    'requires configured origins in production case %#',
    (origin) => {
      const input: NodeJS.ProcessEnv = { NODE_ENV: 'production' };
      if (origin !== undefined) input.APP_ORIGINS = origin;
      expect(() => parseApiConfig(input)).toThrow(
        'APP_ORIGINS is required in production',
      );
    },
  );
  it('accepts HTTP origins in development', () => {
    expect(
      parseApiConfig({ APP_ORIGINS: 'http://app.example.com:8080' }).origins,
    ).toEqual(['http://app.example.com:8080']);
  });
  it.each([
    'http://app.example.com',
    '*',
    'https://*.example.com',
    'https://app.example.com/path',
    'https://app.example.com/',
    'https://person:placeholder@example.com',
    'https://app.example.com?query=1',
    'https://app.example.com#fragment',
    'file:///example',
    'invalid-origin',
    'https://app.example.com,',
    ' ',
    'https://APP.example.com',
    'https://app.example.com:443',
  ])('rejects nonexact production origin case %#', (origin) => {
    expect(() => parseApiConfig({ APP_ORIGINS: origin }, true)).toThrow(
      'Invalid APP_ORIGINS configuration',
    );
  });
  it.each(['299', '2592001', '1.5', 'invalid', '', '-1'])(
    'rejects invalid session TTL case %#',
    (ttl) => {
      expect(() => parseApiConfig({ SESSION_TTL_SECONDS: ttl })).toThrow(
        'Invalid API environment configuration',
      );
    },
  );
  it('accepts the maximum TTL and reports invalid timezone by configuration name', () => {
    expect(
      parseApiConfig({ SESSION_TTL_SECONDS: '2592000' }).sessionTtlSeconds,
    ).toBe(2592000);
    expect(() => parseApiConfig({ APP_TIME_ZONE: 'Fictional/Zone' })).toThrow(
      'Invalid APP_TIME_ZONE configuration',
    );
  });
  it('does not include supplied configuration values in validation errors', () => {
    const marker = 'fictitious-invalid-config-value';
    for (const input of [
      { SESSION_TTL_SECONDS: marker },
      { APP_TIME_ZONE: marker },
      { APP_ORIGINS: marker },
    ]) {
      try {
        parseApiConfig(input);
        expect.fail('Invalid configuration must throw');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect(String(error)).not.toContain(marker);
      }
    }
  });
});
