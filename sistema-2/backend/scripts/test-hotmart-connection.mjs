import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const envFiles = [resolve(process.cwd(), '../../.env'), resolve(process.cwd(), '.env')]
  .filter(existsSync)
  .map((file) => `--env-file=${file}`);

const result = spawnSync(
  process.execPath,
  [
    ...envFiles,
    '--test',
    'tests/hotmart-connection.test.mjs',
  ],
  {
    env: { ...process.env, HOTMART_CONNECTION_TESTS: 'true' },
    stdio: 'inherit',
  },
);

if (result.error) {
  console.error('Não foi possível iniciar o teste de conexão Hotmart.');
  process.exitCode = 1;
} else {
  process.exitCode = result.status ?? 1;
}
