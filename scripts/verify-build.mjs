import assert from 'node:assert/strict';
import { readFile, access, readdir } from 'node:fs/promises';
import { join } from 'node:path';

async function walk(directory) {
  const paths = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) paths.push(...(await walk(path)));
    else if (path.endsWith('.html')) paths.push(path);
  }
  return paths;
}
const pages = await walk('dist');
assert.equal(
  pages.length,
  17,
  'A demonstração deve gerar 17 páginas, incluindo /admin/ e 404.',
);
for (const path of pages) {
  const html = await readFile(path, 'utf8');
  assert.match(html, /lang="pt-BR"/);
  assert.match(html, /rel="canonical"/);
  assert.match(html, /name="description"/);
  assert.match(html, /<h1[ >]/);
  assert.ok(
    !/decap|unpkg\.com|api\.sanity\.io/i.test(html),
    `Dependência editorial no site: ${path}`,
  );
  for (const [, url] of html.matchAll(/(?:href|src)="(\/[^"?#]*)/g)) {
    await access(join('dist', url.endsWith('/') ? `${url}index.html` : url));
  }
}
console.log(
  `${pages.length} páginas verificadas: metadados, navegação e assets locais íntegros; sem chamadas ao CMS no navegador.`,
);
