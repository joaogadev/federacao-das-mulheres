import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { readLegacy, demoContent } from './legacy.mjs';

if (process.env.CI || process.env.CF_PAGES)
  throw new Error('Demonstração permitida somente localmente.');
const command = process.argv[2];
if (!['dev', 'build', 'check'].includes(command))
  throw new Error('Comando de demonstração inválido.');
await mkdir('.cache', { recursive: true });
const { documents } = await readLegacy();
await writeFile(
  '.cache/content-demo.json',
  JSON.stringify(demoContent(documents)),
);
console.log(
  'DEMONSTRAÇÃO LOCAL: conteúdos fictícios preservados; não publicar este build.',
);
const child = spawn(
  process.execPath,
  ['node_modules/astro/astro.js', command, ...process.argv.slice(3)],
  {
    stdio: 'inherit',
    env: { ...process.env, CONTENT_SOURCE: 'demo' },
  },
);
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
