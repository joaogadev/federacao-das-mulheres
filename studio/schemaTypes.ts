import { defineArrayMember, defineField, defineType } from 'sanity';

const body = defineType({
  name: 'body',
  title: 'Texto',
  type: 'array',
  of: [
    defineArrayMember({
      type: 'block',
      styles: [
        { title: 'Parágrafo', value: 'normal' },
        { title: 'Título de seção', value: 'h2' },
        { title: 'Subtítulo', value: 'h3' },
        { title: 'Citação', value: 'blockquote' },
      ],
      lists: [
        { title: 'Marcadores', value: 'bullet' },
        { title: 'Numeração', value: 'number' },
      ],
      marks: {
        decorators: [
          { title: 'Negrito', value: 'strong' },
          { title: 'Itálico', value: 'em' },
        ],
        annotations: [
          {
            name: 'link',
            title: 'Link',
            type: 'object',
            fields: [
              defineField({
                name: 'href',
                title: 'Endereço do link',
                type: 'url',
                validation: (Rule) =>
                  Rule.required().uri({ scheme: ['http', 'https'] }),
              }),
            ],
          },
        ],
      },
    }),
  ],
});

const title = defineField({
  name: 'title',
  title: 'Título',
  type: 'string',
  validation: (Rule) => Rule.required().max(150),
});
const slug = defineField({
  name: 'slug',
  title: 'Endereço da página',
  type: 'slug',
  description:
    'Clique em Gerar após preencher o título. Após publicar, evite alterar para não quebrar links já compartilhados.',
  options: { source: 'title', maxLength: 96 },
  validation: (Rule) =>
    Rule.required().custom(
      (value) =>
        !value?.current ||
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.current) ||
        'Use letras minúsculas sem acentos, números e hífens.',
    ),
});
const description = defineField({
  name: 'description',
  title: 'Resumo',
  type: 'text',
  rows: 3,
  description:
    'Apresentação curta exibida na listagem e nos resultados de busca.',
  validation: (Rule) => Rule.required().max(300),
});
const date = defineField({
  name: 'date',
  title: 'Data',
  type: 'date',
  options: { dateFormat: 'DD/MM/YYYY' },
  validation: (Rule) => Rule.required(),
});
const image = defineField({
  name: 'image',
  title: 'Imagem de capa',
  type: 'image',
  description:
    'Opcional. Use uma imagem autorizada para divulgação pública. Prefira JPG, PNG ou WebP.',
  options: { accept: 'image/jpeg,image/png,image/webp' },
  fields: [
    defineField({
      name: 'alt',
      title: 'Descrição da imagem',
      type: 'string',
      description:
        'Descreva brevemente o que aparece na imagem para quem utiliza leitor de tela.',
      validation: (Rule) =>
        Rule.custom((value, context) =>
          (context.parent as { asset?: unknown })?.asset && !value?.trim()
            ? 'Descreva a imagem enviada.'
            : true,
        ),
    }),
  ],
});
const content = defineField({
  name: 'body',
  title: 'Conteúdo',
  type: 'body',
  validation: (Rule) => Rule.required().min(1),
});
const preview = {
  select: { title: 'title', subtitle: 'description', media: 'image' },
};
const noticia = defineType({
  name: 'noticia',
  title: 'Notícias',
  type: 'document',
  fields: [title, slug, description, date, image, content],
  initialValue: () => ({
    date: new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Fortaleza',
    }).format(new Date()),
  }),
  preview,
  orderings: [
    {
      title: 'Mais recentes',
      name: 'recentes',
      by: [{ field: 'date', direction: 'desc' }],
    },
  ],
});
const evento = defineType({
  name: 'evento',
  title: 'Eventos',
  type: 'document',
  fields: [
    title,
    slug,
    description,
    date,
    defineField({
      name: 'time',
      title: 'Horário',
      type: 'string',
      description: 'Exemplo: 09h às 12h (horário de Fortaleza).',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'location',
      title: 'Local',
      type: 'string',
      description: 'Informe o endereço ou indique se o evento é on-line.',
      validation: (Rule) => Rule.required(),
    }),
    image,
    content,
  ],
  preview,
  orderings: [
    {
      title: 'Por data',
      name: 'data',
      by: [{ field: 'date', direction: 'asc' }],
    },
  ],
});
const projeto = defineType({
  name: 'projeto',
  title: 'Projetos e ações',
  type: 'document',
  fields: [title, slug, description, image, content],
  preview,
});
const depoimento = defineType({
  name: 'depoimento',
  title: 'Depoimentos',
  type: 'document',
  description:
    'Publique apenas relatos e nomes com autorização para divulgação.',
  fields: [
    defineField({
      name: 'name',
      title: 'Nome público',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'role',
      title: 'Identificação',
      type: 'string',
      description:
        'Exemplo: participante de oficina. Não inclua dados confidenciais.',
      validation: (Rule) => Rule.required(),
    }),
    content,
  ],
  preview: { select: { title: 'name', subtitle: 'role' } },
});

const institutionalText = (
  name: string,
  title: string,
  group: string,
  multiline = true,
) =>
  defineField({
    name,
    title,
    group,
    type: multiline ? 'text' : 'string',
    validation: (Rule) => Rule.required(),
  });
const institutionalUrl = (name: string, title: string) =>
  defineField({
    name,
    title,
    type: 'url',
    group: 'contato',
    validation: (Rule) => Rule.required().uri({ scheme: ['http', 'https'] }),
  });
const institucional = defineType({
  name: 'institucional',
  title: 'Informações da Federação',
  type: 'document',
  groups: [
    { name: 'inicio', title: 'Página inicial', default: true },
    { name: 'sobre', title: 'Sobre a Federação' },
    { name: 'contato', title: 'Contato e redes sociais' },
  ],
  fields: [
    institutionalText('name', 'Nome da instituição', 'inicio', false),
    institutionalText('tagline', 'Chamada principal', 'inicio', false),
    institutionalText('intro', 'Apresentação curta', 'inicio'),
    institutionalText(
      'homeMessage',
      'Apresentação da página inicial',
      'inicio',
    ),
    institutionalText('history', 'Nossa história', 'sobre'),
    institutionalText('mission', 'Missão e objetivos', 'sobre'),
    institutionalText('vision', 'Visão', 'sobre'),
    defineField({
      name: 'values',
      title: 'Valores',
      type: 'array',
      group: 'sobre',
      of: [{ type: 'string' }],
      validation: (Rule) => Rule.required().min(1),
    }),
    defineField({
      name: 'email',
      title: 'E-mail público',
      type: 'string',
      group: 'contato',
      validation: (Rule) => Rule.required().email(),
    }),
    institutionalText('phone', 'Telefone público', 'contato', false),
    institutionalText('address', 'Localização', 'contato', false),
    institutionalUrl('instagram', 'Link do Instagram'),
    institutionalUrl('facebook', 'Link do Facebook'),
    institutionalUrl('donationUrl', 'Link externo para doações'),
  ],
  preview: { select: { title: 'name' } },
});
export const schemaTypes = [
  body,
  noticia,
  evento,
  projeto,
  depoimento,
  institucional,
];
