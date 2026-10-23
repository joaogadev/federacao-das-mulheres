import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { parse, evaluate } from 'groq-js';
import {
  readLegacy,
  demoContent,
  markdownToBlocks,
} from '../scripts/legacy.mjs';
import { contentSchema, bodySchema, imageUrl } from '../src/lib/content-model';
import { contentQuery } from '../src/lib/sanity-query';
import { renderBody } from '../src/lib/rich-text';
import { upcomingEvents, formatDate } from '../src/lib/format';

test('migração preserva os 12 documentos, campos institucionais e textos originais', async () => {
  const { documents, manifest } = await readLegacy();
  assert.equal(documents.length, 12);
  assert.equal(manifest.length, 12);
  assert.equal(new Set(documents.map((doc) => doc._id)).size, 12);
  const data = contentSchema.parse(demoContent(documents));
  assert.deepEqual(
    [
      data.noticias.length,
      data.eventos.length,
      data.projetos.length,
      data.depoimentos.length,
    ],
    [3, 2, 3, 3],
  );
  for (const entry of manifest.filter((item) => item.file.endsWith('.md'))) {
    const original = await readFile(`migration/legacy/${entry.file}`, 'utf8');
    const slug = entry.file.split('/').at(-1)!.replace('.md', '');
    const document = documents.find((doc) => doc._id.endsWith(`.${slug}`))!;
    const paragraphs = original
      .split('---')[2]
      .trim()
      .split(/\r?\n\s*\r?\n/);
    assert.deepEqual(
      document.body.map((block: { children: { text: string }[] }) =>
        block.children.map((span) => span.text).join(''),
      ),
      paragraphs,
    );
    if (document.slug) assert.equal(document.slug.current, slug);
  }
});

test('consulta real exclui rascunhos e versões, resolve imagens e preserva ordenação', async () => {
  const { documents } = await readLegacy();
  const noticia = documents.find((doc) => doc._type === 'noticia')!;
  const asset = {
    _id: 'image-test-800x600-png',
    _type: 'sanity.imageAsset',
    url: 'https://cdn.sanity.io/images/test/production/test-800x600.png',
  };
  const published = {
    ...noticia,
    image: { asset: { _ref: asset._id }, alt: 'Mulheres reunidas' },
  };
  const dataset = documents
    .filter((doc) => doc._id !== noticia._id)
    .concat([
      published,
      asset,
      { ...noticia, _id: `drafts.${noticia._id}`, title: 'NÃO PUBLICADO' },
      {
        ...noticia,
        _id: `versions.release.${noticia._id}`,
        title: 'VERSÃO FUTURA',
      },
    ]);
  const result = await (await evaluate(parse(contentQuery), { dataset })).get();
  const content = contentSchema.parse(result);
  assert.equal(content.noticias.length, 3);
  assert.equal(content.noticias[0].slug, 'roda-de-conversa');
  assert.equal(
    content.noticias.find((item) => item._id === noticia._id)?.image?.alt,
    'Mulheres reunidas',
  );
  assert.ok(!JSON.stringify(content).includes('NÃO PUBLICADO'));
  assert.ok(!JSON.stringify(content).includes('VERSÃO FUTURA'));
  assert.match(
    imageUrl({ url: asset.url, alt: 'Imagem' }, 640)!,
    /w=640&fit=max&auto=format/,
  );
});

test('conteúdo ausente, duplicado ou inválido impede publicação; listas vazias são válidas', async () => {
  const base = demoContent((await readLegacy()).documents);
  assert.throws(() => contentSchema.parse({ ...base, site: null }));
  assert.throws(() =>
    contentSchema.parse({
      ...base,
      noticias: [...base.noticias, base.noticias[0]],
    }),
  );
  assert.throws(() =>
    contentSchema.parse({
      ...base,
      noticias: [{ ...base.noticias[0], date: '2026-02-30' }],
    }),
  );
  assert.throws(() =>
    contentSchema.parse({
      ...base,
      noticias: [{ ...base.noticias[0], slug: '../admin' }],
    }),
  );
  assert.throws(() =>
    contentSchema.parse({
      ...base,
      noticias: [{ ...base.noticias[0], _id: 'drafts.teste' }],
    }),
  );
  assert.throws(() =>
    contentSchema.parse({
      ...base,
      site: { ...base.site, donationUrl: 'javascript:alert(1)' },
    }),
  );
  assert.throws(() =>
    contentSchema.parse({
      ...base,
      noticias: [
        {
          ...base.noticias[0],
          image: { url: 'https://cdn.sanity.io/images/a/b/c.png', alt: '' },
        },
      ],
    }),
  );
  assert.doesNotThrow(() =>
    contentSchema.parse({
      ...base,
      noticias: [],
      eventos: [],
      projetos: [],
      depoimentos: [],
    }),
  );
});

test('Portable Text preserva formatação e escapa conteúdo HTML', () => {
  const body = bodySchema.parse(
    markdownToBlocks(
      '## Seção\n\nUm **texto forte** com *ênfase* e [link](https://example.org).\n\n- Primeiro\n- Segundo',
    ),
  );
  const html = renderBody(body);
  assert.match(html, /<h2>Seção<\/h2>/);
  assert.match(html, /<strong>texto forte<\/strong>/);
  assert.match(html, /<em>ênfase<\/em>/);
  assert.match(html, /<ul>/);
  const malicious = bodySchema.parse([
    {
      _type: 'block',
      _key: 'a',
      children: [
        {
          _type: 'span',
          _key: 'b',
          text: '<script>alert(1)</script>',
          marks: [],
        },
      ],
      markDefs: [],
    },
  ]);
  assert.ok(!renderBody(malicious).includes('<script>'));
  assert.throws(() =>
    markdownToBlocks('<iframe src="https://example.org"></iframe>'),
  );
  assert.throws(() => markdownToBlocks('![Imagem](/uploads/teste.jpg)'));
  assert.throws(() => markdownToBlocks('[Link](javascript:alert)'));
});

test('próximos eventos considera o dia de Fortaleza e mantém a data sem deslocamento', () => {
  const events = [
    { date: '2026-10-24' },
    { date: '2026-10-22' },
    { date: '2026-10-23' },
  ];
  assert.deepEqual(upcomingEvents(events, new Date('2026-10-24T01:00:00Z')), [
    { date: '2026-10-23' },
    { date: '2026-10-24' },
  ]);
  assert.match(formatDate('2027-03-13'), /13 de março de 2027/);
});
