import { spawnSync } from 'node:child_process';
import { createServer } from 'node:net';

const project = `minifinance-e2e-${process.pid}`;
const compose = ['compose', '-p', project, '-f', '../compose.test.yaml'];
const server = createServer();
const port = await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    if (!address || typeof address === 'string') return reject(new Error('Porta inválida'));
    const number = address.port;
    server.close(() => resolve(number));
  });
});
const env = {
  ...process.env,
  TEST_POSTGRES_PORT: String(port),
  E2E_DATABASE_URL: `postgresql://test_user:test-only-placeholder@127.0.0.1:${port}/minifinance_test`,
};
function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit', env });
  if (result.error) throw result.error;
  return result.status ?? 1;
}
let started = false;
let code = 1;
try {
  started = true;
  code = run('docker', [...compose, 'up', '--detach', '--wait', 'postgres']);
  if (code === 0) {
    code = run(process.execPath, ['./node_modules/@playwright/test/cli.js', 'test', ...process.argv.slice(2)]);
  }
} finally {
  if (started) run('docker', [...compose, 'down', '--volumes', '--remove-orphans']);
}
process.exitCode = code;
