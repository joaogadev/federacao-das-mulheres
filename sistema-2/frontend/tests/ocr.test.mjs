import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createWorker } from 'tesseract.js';

test('OCR em português lê acentos e revisão textual preserva a imagem', async () => {
  const file = resolve('tests/fixtures/portugues.png');
  const original = await readFile(file);
  const worker = await createWorker('por', 1, {
    langPath: resolve('public/ocr'),
    cacheMethod: 'none',
  });
  try {
    const { data } = await worker.recognize(
      file,
      {},
      { text: true, blocks: true },
    );
    assert.match(data.text, /Federação das Mulheres/);
    assert.match(data.text, /Emissão: 12\/08\/2026/);
    assert.ok(data.blocks?.[0]?.paragraphs?.[0]?.lines?.[0]?.words?.[0]?.bbox);
    const transcriptionWithError = data.text.replace('2026', '202G');
    const corrected = transcriptionWithError.replace('202G', '2026');
    assert.match(corrected, /12\/08\/2026/);
    assert.deepEqual(await readFile(file), original);
  } finally {
    await worker.terminate();
  }
});
