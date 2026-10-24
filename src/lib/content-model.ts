import { z } from 'zod';

const text = z.string().trim().min(1);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return (
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }, 'Data inválida');
export const webUrl = z
  .string()
  .url()
  .refine(
    (value) => /^https?:\/\//i.test(value),
    'Use um endereço http ou https',
  );
const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const span = z.object({
  _type: z.literal('span'),
  _key: text,
  text: z.string(),
  marks: z.array(z.string()).default([]),
});
const block = z.object({
  _type: z.literal('block'),
  _key: text,
  style: z.enum(['normal', 'h2', 'h3', 'blockquote']).default('normal'),
  children: z.array(span),
  markDefs: z
    .array(z.object({ _key: text, _type: z.literal('link'), href: webUrl }))
    .default([]),
  listItem: z.enum(['bullet', 'number']).optional(),
  level: z.number().int().positive().optional(),
});
export const bodySchema = z.array(block).min(1);
const imageSchema = z
  .object({
    url: z
      .string()
      .url()
      .refine((value) => {
        const url = new URL(value);
        return (
          url.protocol === 'https:' &&
          url.hostname === 'cdn.sanity.io' &&
          url.pathname.startsWith('/images/')
        );
      }, 'Imagem deve estar no Sanity'),
    alt: text,
  })
  .nullable()
  .optional();
const base = z.object({
  _id: text,
  title: text,
  slug,
  description: text,
  body: bodySchema,
  image: imageSchema,
});
const noticia = base.extend({ date });
const evento = base.extend({ date, time: text, location: text });
const depoimento = z.object({
  _id: text,
  name: text,
  role: text,
  body: bodySchema,
});
export const siteSchema = z.object({
  _id: z.literal('institucional'),
  name: text,
  tagline: text,
  intro: text,
  homeMessage: text,
  history: text,
  mission: text,
  vision: text,
  values: z.array(text).min(1),
  email: z.string().email(),
  phone: text,
  address: text,
  instagram: webUrl,
  facebook: webUrl,
  donationUrl: webUrl,
});
export const contentSchema = z
  .object({
    site: siteSchema,
    noticias: z.array(noticia),
    eventos: z.array(evento),
    projetos: z.array(base),
    depoimentos: z.array(depoimento),
  })
  .superRefine((data, ctx) => {
    for (const collection of ['noticias', 'eventos', 'projetos'] as const) {
      const slugs = new Set<string>();
      data[collection].forEach((entry, index) => {
        if (slugs.has(entry.slug))
          ctx.addIssue({
            code: 'custom',
            path: [collection, index, 'slug'],
            message: 'Endereço duplicado',
          });
        slugs.add(entry.slug);
      });
    }
    for (const collection of [
      'noticias',
      'eventos',
      'projetos',
      'depoimentos',
    ] as const) {
      data[collection].forEach((entry, index) => {
        if (/^(drafts|versions)\./.test(entry._id))
          ctx.addIssue({
            code: 'custom',
            path: [collection, index],
            message: 'Rascunho recebido no site público',
          });
      });
    }
  });
export type Site = z.infer<typeof siteSchema>;
export type Content = z.infer<typeof contentSchema>;
export type Event = Content['eventos'][number];
export type Body = z.infer<typeof bodySchema>;

export function imageUrl(image: z.infer<typeof imageSchema>, width = 1200) {
  if (!image) return undefined;
  return `${image.url}?w=${width}&fit=max&auto=format`;
}
