import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { PDFDocument } from 'pdf-lib';

const require = createRequire(import.meta.url);
const built = await build({
  entryPoints: ['src/scanner/pdf.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
  external: ['pdf-lib'],
});
const module = { exports: {} };
new Function('require', 'module', 'exports', built.outputFiles[0].text)(
  require,
  module,
  module.exports,
);
const { pdfFromJpegs } = module.exports;

test('PDF visual com duas páginas funciona sem OCR', async () => {
  const jpeg = new Uint8Array(await readFile('tests/fixtures/portugues.jpg'));
  const bytes = await pdfFromJpegs([
    { jpeg, width: 1200, height: 320 },
    { jpeg, width: 1200, height: 320 },
  ]);
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 2);
  assert.ok(bytes.length > jpeg.length);
});
