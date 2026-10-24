import { mkdir, writeFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { createClient } from '@sanity/client';
import { readLegacy } from './legacy.mjs';

const mode = process.argv[2];
if (mode && !['--import', '--verify', '--verify-drafts'].includes(mode))
  throw new Error('Use sem argumentos, --import, --verify ou --verify-drafts.');
const { documents, manifest } = await readLegacy();
await mkdir('migration/output', { recursive: true });
await writeFile(
  'migration/output/content.ndjson',
  documents
    .map((doc) => JSON.stringify({ ...doc, _id: `drafts.${doc._id}` }))
    .join('\n') + '\n',
);
await writeFile(
  'migration/output/manifest.json',
  JSON.stringify(
    {
      sources: manifest,
      documents: documents.map(({ _id, _type }) => ({ _id, _type })),
    },
    null,
    2,
  ),
);
console.log(
  `${documents.length} documentos preparados como rascunhos; ${manifest.length} fontes preservadas. Confira migration/output/.`,
);

if (mode) {
  const {
    SANITY_PROJECT_ID: projectId,
    SANITY_DATASET: dataset,
    SANITY_API_WRITE_TOKEN: token,
  } = process.env;
  if (!projectId || !dataset || !token)
    throw new Error(
      'Configure SANITY_PROJECT_ID, SANITY_DATASET e SANITY_API_WRITE_TOKEN no .env local.',
    );
  const client = createClient({
    projectId,
    dataset,
    token,
    apiVersion: '2025-02-19',
    useCdn: false,
    perspective: 'raw',
  });
  const ids = documents.flatMap(({ _id }) => [_id, `drafts.${_id}`]);
  const existing = await client.fetch('*[_id in $ids]', { ids });
  if (mode === '--import') {
    // Never overwrite an existing published document or an editor's draft.
    const pending = documents.filter(
      (doc) =>
        !existing.some(
          (remote) =>
            remote._id === doc._id || remote._id === `drafts.${doc._id}`,
        ),
    );
    const oldIds = pending
      .filter((doc) => doc._id !== 'institucional')
      .flatMap((doc) => {
        const oldId = doc._id.replace(`${doc._type}-`, `${doc._type}.`);
        return [oldId, `drafts.${oldId}`];
      });
    if (oldIds.length) {
      const oldDocuments = await client.fetch('*[_id in $ids]{_id}', {
        ids: oldIds,
      });
      if (oldDocuments.length)
        throw new Error(
          `Há ${oldDocuments.length} documentos da migração anterior com IDs pontuados. Revise-os manualmente antes de importar, para não duplicar conteúdo ou perder edições.`,
        );
    }
    if (pending.length) {
      let transaction = client.transaction();
      for (const doc of pending)
        transaction = transaction.createIfNotExists({
          ...doc,
          _id: `drafts.${doc._id}`,
        });
      await transaction.commit();
    }
    console.log(
      `${pending.length} rascunhos criados; ${documents.length - pending.length} documentos existentes preservados. Execute npm run ${existing.some((doc) => doc._id === 'institucional') ? 'migrate:verify-drafts' : 'migrate:verify'} antes de editar.`,
    );
  } else {
    const failures = [];
    const checkedDocuments =
      mode === '--verify-drafts'
        ? documents.filter((doc) => doc._id !== 'institucional')
        : documents;
    for (const doc of checkedDocuments) {
      const draft = existing.find((item) => item._id === `drafts.${doc._id}`);
      const remote =
        mode === '--verify-drafts'
          ? draft
          : (draft ?? existing.find((item) => item._id === doc._id));
      if (!remote) {
        failures.push(`${doc._id}: ausente`);
        continue;
      }
      for (const [field, value] of Object.entries(doc)) {
        if (field !== '_id' && !isDeepStrictEqual(remote[field], value))
          failures.push(`${doc._id}: campo ${field} diferente`);
      }
    }
    if (failures.length)
      throw new Error(
        `Migração não conferida:\n${failures.join('\n')}\nNenhum original foi removido.`,
      );
    console.log(
      `Conferência concluída: todos os campos de ${checkedDocuments.length} documentos correspondem aos originais.`,
    );
  }
}
