import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import {
  DockerComposeEnvironment,
  type StartedDockerComposeEnvironment,
  Wait,
} from 'testcontainers';
import type { TestProject } from 'vitest/node';

const execute = promisify(execFile);
export default async function setup(project: TestProject) {
  const root = resolve(import.meta.dirname, '../../..');
  const reports = resolve(root, 'backend/test-reports');
  await mkdir(reports, { recursive: true });
  await Promise.all(
    [
      'containers.log',
      'container-lifecycle.json',
      'endpoints.json',
      'endpoints.md',
    ].map((file) => rm(resolve(reports, file), { force: true })),
  );
  const name = `minifinance-it-${randomUUID().slice(0, 8)}`;
  const environmentFile = resolve(
    root,
    'backend/tests/integration/support/compose.env',
  );
  const args = [
    'compose',
    '--project-name',
    name,
    '--env-file',
    environmentFile,
    '-f',
    resolve(root, 'compose.test.yaml'),
  ];
  let environment: StartedDockerComposeEnvironment | undefined;
  async function diagnostics() {
    const output: string[] = [];
    for (const command of [
      ['ps', '--all'],
      ['logs', '--no-color', '--tail', '100'],
    ]) {
      try {
        const result = await execute('docker', [...args, ...command], {
          timeout: 15000,
          maxBuffer: 1048576,
        });
        output.push(result.stdout, result.stderr);
      } catch {
        output.push(`Unable to collect Docker ${command[0]} diagnostics`);
      }
    }
    await writeFile(resolve(reports, 'containers.log'), output.join('\n'));
  }
  async function cleanup() {
    try {
      if (environment)
        await environment.down({ timeout: 30000, removeVolumes: true });
      else
        await execute(
          'docker',
          [...args, 'down', '--volumes', '--remove-orphans'],
          { timeout: 45000 },
        );
      // Verify that teardown removed both containers and project-labelled volumes.
      const [containers, volumes] = await Promise.all([
        execute(
          'docker',
          [
            'ps',
            '--all',
            '--quiet',
            '--filter',
            `label=com.docker.compose.project=${name}`,
          ],
          { timeout: 15000 },
        ),
        execute(
          'docker',
          [
            'volume',
            'ls',
            '--quiet',
            '--filter',
            `label=com.docker.compose.project=${name}`,
          ],
          { timeout: 15000 },
        ),
      ]);
      if (containers.stdout.trim() || volumes.stdout.trim())
        throw new Error('Test resources remain after teardown');
      await writeFile(
        resolve(reports, 'container-lifecycle.json'),
        JSON.stringify(
          {
            project: name,
            startupSucceeded: Boolean(environment),
            apiContainer: Boolean(environment),
            postgresContainer: Boolean(environment),
            migrations: Boolean(environment),
            removedContainers: true,
            removedVolumes: true,
          },
          null,
          2,
        ),
      );
    } catch {
      throw new Error(
        `Unable to clean test project ${name}; run docker compose --project-name ${name} --env-file backend/tests/integration/support/compose.env -f compose.test.yaml down --volumes --remove-orphans`,
      );
    }
  }
  try {
    // Never reuse services or addresses supplied by a developer's environment.
    environment = await new DockerComposeEnvironment(root, 'compose.test.yaml')
      .withProjectName(name)
      .withEnvironmentFile(environmentFile)
      .withEnvironment({ TEST_POSTGRES_PORT: '0', TEST_BACKEND_PORT: '0' })
      .withBuild()
      .withStartupTimeout(180000)
      .withWaitStrategy('postgres-1', Wait.forHealthCheck())
      .withWaitStrategy('backend-1', Wait.forHealthCheck())
      .up();
    const api = environment.getContainer('backend-1');
    const postgres = environment.getContainer('postgres-1');
    const address = (host: string) => (host.includes(':') ? `[${host}]` : host);
    project.provide(
      'apiBaseUrl',
      `http://${address(api.getHost())}:${api.getMappedPort(3000)}`,
    );
    project.provide(
      'databaseUrl',
      `postgresql://test_user:test-only-placeholder@${address(postgres.getHost())}:${postgres.getMappedPort(5432)}/minifinance_test`,
    );
    project.provide('composeProjectName', name);
    console.info(
      'Integration containers healthy; versioned migrations applied',
    );
  } catch {
    try {
      await diagnostics();
    } finally {
      await cleanup();
    }
    throw new Error(
      'Testcontainers startup failed. Start Docker with Linux containers and inspect backend/test-reports/containers.log. No development database was used.',
    );
  }
  return async () => {
    try {
      await diagnostics();
    } finally {
      await cleanup();
    }
  };
}
