import { describe, expect, it } from 'vitest';
import { app } from '../../src/app.js';

describe('GET /health', () => {
  it('returns HTTP 200 and JSON without requiring a server or database', async () => {
    const response = await app.request('/health');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toEqual({ status: 'ok' });
  });
});
