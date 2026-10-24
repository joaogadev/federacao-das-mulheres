import { createClient } from '@sanity/client';

const { SANITY_PROJECT_ID: projectId, SANITY_DATASET: dataset } = process.env;
if (!projectId || !dataset) {
  throw new Error('Configure SANITY_PROJECT_ID e SANITY_DATASET no .env.');
}

const options = {
  projectId,
  dataset,
  apiVersion: '2025-02-19',
  useCdn: false,
};
const query = `*[_type in ["institucional", "noticia", "evento", "projeto", "depoimento"]]{_id, _type}`;

for (const [label, extra] of [
  ['Leitura pública', { perspective: 'published' }],
  ...(process.env.SANITY_API_WRITE_TOKEN
    ? [
        [
          'Todos os documentos (incluindo rascunhos)',
          { perspective: 'raw', token: process.env.SANITY_API_WRITE_TOKEN },
        ],
      ]
    : []),
]) {
  const docs = await createClient({ ...options, ...extra }).fetch(query);
  console.log(`${label}: ${docs.length}`);
  for (const doc of docs) console.log(`  ${doc._type}: ${doc._id}`);
}

if (process.env.SANITY_API_WRITE_TOKEN) {
  const response = await fetch(
    `https://${projectId}.api.sanity.io/v2025-02-19/hooks/projects/${projectId}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.SANITY_API_WRITE_TOKEN}`,
      },
    },
  );
  if (response.ok) {
    const hooks = await response.json();
    console.log(`Webhooks configurados: ${hooks.length}`);
    for (const hook of hooks) {
      console.log(
        `  ${hook.name}: dataset=${hook.dataset}, ativo=${!hook.isDisabled}, metodo=${hook.httpMethod ?? 'POST'}, eventos=${(hook.rule?.on ?? []).join(',')}`,
      );
    }
  } else {
    console.log(
      `Webhooks: não foi possível consultar a configuração (HTTP ${response.status}).`,
    );
  }
}
