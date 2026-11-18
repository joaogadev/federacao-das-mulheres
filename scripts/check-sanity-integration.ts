import { createClient } from '@sanity/client';
import { contentSchema } from '../src/lib/content-model';
import { apiVersion, contentQuery } from '../src/lib/sanity-query';

const projectId = process.env.SANITY_PROJECT_ID;
const dataset = process.env.SANITY_DATASET;

if (!projectId || !dataset) {
  throw new Error('SANITY_PROJECT_ID e SANITY_DATASET são obrigatórios.');
}

const client = createClient({
  projectId,
  dataset,
  apiVersion,
  useCdn: false,
  perspective: 'published',
  timeout: 30_000,
});

let result: unknown;
try {
  result = await client.fetch(contentQuery);
} catch (error) {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String(error.code)
      : 'falha de rede ou resposta';
  throw new Error(`Não foi possível consultar o Sanity (${code}).`);
}
const parsed = contentSchema.safeParse(result);

if (!parsed.success) {
  throw new Error(
    `A consulta publicada do Sanity não atende ao contrato do site: ${parsed.error.message}`,
  );
}

console.info(
  `Integração Sanity OK (${dataset}): documento institucional válido; ${parsed.data.noticias.length} notícias, ${parsed.data.eventos.length} eventos, ${parsed.data.projetos.length} projetos e ${parsed.data.depoimentos.length} depoimentos.`,
);
