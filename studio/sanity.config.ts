import { defineConfig } from 'sanity';
import { structureTool } from 'sanity/structure';
import { ptBRLocale } from '@sanity/locale-pt-br';
import { schemaTypes } from './schemaTypes';

const projectId = process.env.SANITY_STUDIO_PROJECT_ID;
const dataset = process.env.SANITY_STUDIO_DATASET;
if (!projectId || !dataset)
  throw new Error(
    'Preencha studio/.env com SANITY_STUDIO_PROJECT_ID e SANITY_STUDIO_DATASET.',
  );

export default defineConfig({
  name: 'federacao',
  title: 'Federação das Mulheres',
  projectId,
  dataset,
  plugins: [
    ptBRLocale(),
    structureTool({
      structure: (S) =>
        S.list()
          .title('Conteúdos do site')
          .items([
            S.listItem()
              .title('Informações da Federação')
              .id('institucional')
              .child(
                S.document()
                  .schemaType('institucional')
                  .documentId('institucional')
                  .title('Informações da Federação'),
              ),
            S.divider(),
            ...S.documentTypeListItems().filter(
              (item) => item.getId() !== 'institucional',
            ),
          ]),
    }),
  ],
  schema: {
    types: schemaTypes,
    templates: (templates) =>
      templates.filter((item) => item.schemaType !== 'institucional'),
  },
  document: {
    actions: (actions, context) =>
      context.schemaType === 'institucional'
        ? actions.filter(
            ({ action }) =>
              action &&
              ['publish', 'discardChanges', 'restore'].includes(action),
          )
        : actions,
    newDocumentOptions: (options) =>
      options.filter((item) => item.templateId !== 'institucional'),
  },
});
