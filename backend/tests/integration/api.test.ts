import { afterAll } from 'vitest';
import './api/auth.cases.js';
import './api/ledger.cases.js';
import './api/cards.cases.js';
import './api/planning.cases.js';
import { verifyEndpointCoverage } from './support/endpoint-coverage.js';

afterAll(async () => {
  await verifyEndpointCoverage();
});
