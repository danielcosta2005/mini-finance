import { basename } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TestProject } from 'vitest/node';

const external = vi.hoisted(() => ({
  execute:
    vi.fn<
      (
        file: string,
        args: string[],
        options: unknown,
      ) => Promise<{ stdout: string; stderr: string }>
    >(),
  mkdir: vi.fn<(...args: unknown[]) => Promise<void>>(),
  rm: vi.fn<(...args: unknown[]) => Promise<void>>(),
  writeFile: vi.fn<(path: string, content: string) => Promise<void>>(),
  up: vi.fn<() => Promise<unknown>>(),
  down: vi.fn<(...args: unknown[]) => Promise<void>>(),
  construct: vi.fn<(...args: unknown[]) => void>(),
  projectName: vi.fn<(name: string) => void>(),
  environment: vi.fn<(values: Record<string, string>) => void>(),
  waitStrategy: vi.fn<(...args: unknown[]) => void>(),
}));

vi.mock('node:child_process', () => ({
  execFile: Object.assign(vi.fn(), {
    [Symbol.for('nodejs.util.promisify.custom')]: external.execute,
  }),
}));
vi.mock('node:fs/promises', () => ({
  mkdir: external.mkdir,
  rm: external.rm,
  writeFile: external.writeFile,
}));
vi.mock('testcontainers', () => ({
  DockerComposeEnvironment: class {
    constructor(...args: unknown[]) {
      external.construct(...args);
    }
    withProjectName(name: string) {
      external.projectName(name);
      return this;
    }
    withEnvironmentFile() {
      return this;
    }
    withEnvironment(values: Record<string, string>) {
      external.environment(values);
      return this;
    }
    withBuild() {
      return this;
    }
    withStartupTimeout() {
      return this;
    }
    withWaitStrategy(...args: unknown[]) {
      external.waitStrategy(...args);
      return this;
    }
    up() {
      return external.up();
    }
  },
  Wait: { forHealthCheck: () => 'health-check' },
}));

import setup from '../integration/global-setup.js';

function project() {
  const provide = vi.fn<TestProject['provide']>();
  return { value: { provide } as unknown as TestProject, provide };
}
function lifecycleReport() {
  const saved = external.writeFile.mock.calls.find(
    ([path]) => basename(path) === 'container-lifecycle.json',
  );
  expect(saved, 'Lifecycle report must be written').toBeDefined();
  return JSON.parse(saved?.[1] ?? '{}') as Record<string, unknown>;
}
function failDiagnostics() {
  external.writeFile.mockImplementation(async (path) => {
    if (basename(path) === 'containers.log')
      throw new Error('Fictitious diagnostic write failure');
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  external.mkdir.mockResolvedValue(undefined);
  external.rm.mockResolvedValue(undefined);
  external.writeFile.mockResolvedValue(undefined);
  external.execute.mockResolvedValue({ stdout: '', stderr: '' });
  external.down.mockResolvedValue(undefined);
  external.up.mockResolvedValue({
    down: external.down,
    getContainer: (service: string) => ({
      getHost: () => 'localhost',
      getMappedPort: () => (service === 'backend-1' ? 49181 : 49182),
    }),
  });
});

describe('integration infrastructure lifecycle', () => {
  it('attempts project-scoped cleanup even when startup and diagnostic writing fail', async () => {
    external.up.mockRejectedValue(new Error('Fictitious startup failure'));
    failDiagnostics();
    await expect(setup(project().value)).rejects.toThrow();
    const command = external.execute.mock.calls.find(([, args]) =>
      args.includes('down'),
    );
    expect(command?.[0]).toBe('docker');
    expect(command?.[1]).toEqual(
      expect.arrayContaining([
        '--project-name',
        external.projectName.mock.calls[0]?.[0],
        'down',
        '--volumes',
        '--remove-orphans',
      ]),
    );
    expect(external.down).not.toHaveBeenCalled();
  });

  it('does not report healthy containers or migrations after startup fails', async () => {
    external.up.mockRejectedValue(new Error('Fictitious migration failure'));
    const current = project();
    await expect(setup(current.value)).rejects.toThrow(
      'Testcontainers startup failed',
    );
    expect(current.provide).not.toHaveBeenCalled();
    expect(lifecycleReport()).toMatchObject({
      startupSucceeded: false,
      apiContainer: false,
      postgresContainer: false,
      migrations: false,
      removedContainers: true,
      removedVolumes: true,
    });
  });

  it('removes volumes during teardown even when diagnostic writing fails', async () => {
    const teardown = await setup(project().value);
    failDiagnostics();
    await expect(teardown()).rejects.toThrow(
      'Fictitious diagnostic write failure',
    );
    expect(external.down).toHaveBeenCalledExactlyOnceWith({
      timeout: 30000,
      removeVolumes: true,
    });
    expect(lifecycleReport()).toMatchObject({
      startupSucceeded: true,
      removedVolumes: true,
    });
  });

  it.each(['container', 'volume'])(
    'fails teardown when a project %s remains',
    async (resource) => {
      const teardown = await setup(project().value);
      external.execute.mockImplementation(async (_file, args) => ({
        stdout:
          args.includes('--filter') &&
          (resource === 'volume') === (args[0] === 'volume')
            ? 'fictitious-leftover\n'
            : '',
        stderr: '',
      }));
      await expect(teardown()).rejects.toThrow('Unable to clean test project');
      expect(
        external.writeFile.mock.calls.some(
          ([path]) => basename(path) === 'container-lifecycle.json',
        ),
      ).toBe(false);
      const checks = external.execute.mock.calls.filter(([, args]) =>
        args.includes('--filter'),
      );
      expect(checks).toHaveLength(2);
      for (const [, args] of checks)
        expect(args).toContain(
          `label=com.docker.compose.project=${external.projectName.mock.calls[0]?.[0]}`,
        );
    },
  );

  it('provides only discovered container addresses and requests random mapped ports', async () => {
    const current = project();
    const teardown = await setup(current.value);
    expect(external.environment).toHaveBeenCalledExactlyOnceWith({
      TEST_POSTGRES_PORT: '0',
      TEST_BACKEND_PORT: '0',
    });
    expect(external.waitStrategy.mock.calls.map(([name]) => name)).toEqual([
      'postgres-1',
      'backend-1',
    ]);
    expect(current.provide).toHaveBeenCalledWith(
      'apiBaseUrl',
      'http://localhost:49181',
    );
    const connection = current.provide.mock.calls.find(
      ([key]) => key === 'databaseUrl',
    )?.[1];
    expect(typeof connection).toBe('string');
    const address = new URL(String(connection));
    expect({ host: address.host, database: address.pathname }).toEqual({
      host: 'localhost:49182',
      database: '/minifinance_test',
    });
    await teardown();
    expect(lifecycleReport()).toMatchObject({
      startupSucceeded: true,
      migrations: true,
    });
  });
});
