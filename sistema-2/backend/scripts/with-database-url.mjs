import { spawn } from 'node:child_process';
import { databaseUrl } from './database-url.mjs';

const [command, ...args] = process.argv.slice(2);
if (!command) throw new Error('Informe o comando a executar.');

const child = spawn(command, args, {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: databaseUrl(process.env) },
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on('exit', (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
