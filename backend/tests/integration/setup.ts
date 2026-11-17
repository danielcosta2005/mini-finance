import { inject } from 'vitest';

// Legacy schema tests receive the same generated addresses as the HTTP tests.
process.env.INTEGRATION_DATABASE_URL = inject('databaseUrl');
process.env.INTEGRATION_API_URL = inject('apiBaseUrl');
