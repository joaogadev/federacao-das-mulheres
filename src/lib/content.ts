import { createClient } from '@sanity/client';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { contentSchema, type Content } from './content-model';
import { apiVersion, contentQuery } from './sanity-query';

let contentPromise: Promise<Content> | undefined;

async function loadContent(): Promise<Content> {
  if (process.env.CONTENT_SOURCE === 'demo') {
    if (process.env.CF_PAGES || process.env.CI)
      throw new Error(
        'Conteúdo demonstrativo não é permitido em CI/Cloudflare.',
      );
    return contentSchema.parse(
      JSON.parse(await readFile(resolve('.cache/content-demo.json'), 'utf8')),
    );
  }
  const projectId = import.meta.env.SANITY_PROJECT_ID;
  const dataset = import.meta.env.SANITY_DATASET;
  if (import.meta.env.PROD) {
    const site = import.meta.env.SITE_URL;
    if (
      !site ||
      !site.startsWith('https://') ||
      new URL(site).hostname === 'example.pages.dev'
    ) {
      throw new Error(
        'Configure SITE_URL com o endereço HTTPS definitivo antes do build de produção.',
      );
    }
  }
  if (!projectId || !dataset) {
    throw new Error(
      'Configure SANITY_PROJECT_ID e SANITY_DATASET no .env. Para avaliação local sem conta, use npm run dev:demo ou npm run build:demo.',
    );
  }
  const client = createClient({
    projectId,
    dataset,
    apiVersion,
    useCdn: false,
    perspective: 'published',
    timeout: 30000,
  });
  // Do not catch failures or substitute legacy content: a failed build must not deploy.
  const data = await client.fetch(contentQuery);
  const parsed = contentSchema.safeParse(data);
  if (!parsed.success)
    throw new Error(
      `Conteúdo publicado inválido ou documento institucional ausente: ${parsed.error.message}`,
    );
  console.info(
    `Sanity (${dataset}): ${parsed.data.noticias.length} notícias, ${parsed.data.eventos.length} eventos, ${parsed.data.projetos.length} projetos e ${parsed.data.depoimentos.length} depoimentos publicados.`,
  );
  return parsed.data;
}

export function getContent(): Promise<Content> {
  if (import.meta.env.DEV) return loadContent();
  return (contentPromise ??= loadContent());
}

export async function getSite() {
  return (await getContent()).site;
}

export function getStudioUrl(): string | undefined {
  const value = import.meta.env.PUBLIC_SANITY_STUDIO_URL;
  if (!value) return undefined;
  const url = new URL(value);
  if (url.protocol !== 'https:')
    throw new Error('PUBLIC_SANITY_STUDIO_URL deve usar HTTPS.');
  return url.href;
}
