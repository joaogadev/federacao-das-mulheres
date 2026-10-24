import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import matter from 'gray-matter';
import { unified } from 'unified';
import remarkParse from 'remark-parse';

const root = fileURLToPath(new URL('../migration/legacy/', import.meta.url));
const collections = {
  noticias: 'noticia',
  eventos: 'evento',
  projetos: 'projeto',
  depoimentos: 'depoimento',
};

export function markdownToBlocks(markdown) {
  const tree = unified().use(remarkParse).parse(markdown);
  let index = 0;
  const key = () => `k${index++}`;
  const result = [];
  function block(node, extra = {}) {
    const markDefs = [];
    function spans(nodes, marks = []) {
      return nodes.flatMap((child) => {
        if (child.type === 'text')
          return [{ _type: 'span', _key: key(), text: child.value, marks }];
        if (child.type === 'break')
          return [{ _type: 'span', _key: key(), text: '\n', marks }];
        if (['strong', 'emphasis'].includes(child.type))
          return spans(child.children, [
            ...marks,
            child.type === 'strong' ? 'strong' : 'em',
          ]);
        if (child.type === 'link' && /^https?:\/\//i.test(child.url)) {
          const id = key();
          markDefs.push({ _type: 'link', _key: id, href: child.url });
          return spans(child.children, [...marks, id]);
        }
        throw new Error(
          `Markdown não suportado: ${child.type}. Nenhum conteúdo foi descartado; adapte o conversor antes de importar.`,
        );
      });
    }
    result.push({
      _type: 'block',
      _key: key(),
      style: node.type === 'heading' ? `h${node.depth}` : 'normal',
      ...extra,
      children: spans(node.children),
      markDefs,
    });
  }
  function visit(nodes, extra = {}) {
    for (const node of nodes) {
      if (
        node.type === 'paragraph' ||
        (node.type === 'heading' && [2, 3].includes(node.depth))
      )
        block(node, extra);
      else if (node.type === 'blockquote')
        visit(node.children, { ...extra, style: 'blockquote' });
      else if (node.type === 'list') {
        if (node.start && node.start !== 1)
          throw new Error(
            'Lista deve iniciar em 1 para preservar a numeração.',
          );
        for (const item of node.children) {
          if (
            item.checked != null ||
            item.children.length !== 1 ||
            item.children[0].type !== 'paragraph'
          )
            throw new Error('Lista complexa requer revisão antes da migração.');
          visit(item.children, {
            listItem: node.ordered ? 'number' : 'bullet',
            level: 1,
          });
        }
      } else
        throw new Error(
          `Markdown não suportado: ${node.type}. Revisão necessária, sem perda silenciosa.`,
        );
    }
  }
  visit(tree.children);
  if (!result.length) throw new Error('Texto vazio no arquivo original.');
  return result;
}

export async function readLegacy() {
  const documents = [];
  const manifest = [];
  async function source(relative) {
    const raw = await readFile(join(root, relative), 'utf8');
    manifest.push({
      file: relative.replaceAll('\\', '/'),
      sha256: createHash('sha256').update(raw).digest('hex'),
    });
    return raw;
  }
  const site = JSON.parse(await source('site.json'));
  documents.push({ ...site, _id: 'institucional', _type: 'institucional' });
  for (const [folder, type] of Object.entries(collections)) {
    for (const file of (await readdir(join(root, 'content', folder))).sort()) {
      if (!file.endsWith('.md'))
        throw new Error(`Arquivo inesperado: ${folder}/${file}`);
      const { data, content } = matter(
        await source(join('content', folder, file)),
      );
      const allowed =
        type === 'depoimento'
          ? ['name', 'role']
          : [
              'title',
              'description',
              'date',
              'time',
              'location',
              'image',
              'imageAlt',
            ];
      for (const field of Object.keys(data))
        if (!allowed.includes(field))
          throw new Error(`Campo não mapeado: ${folder}/${file}: ${field}`);
      if (data.image)
        throw new Error(
          `Imagem em ${folder}/${file}: faça o upload ao Sanity e mapeie asset/alt antes da importação. O acervo original não contém imagens de conteúdo.`,
        );
      delete data.image;
      delete data.imageAlt;
      if (data.date instanceof Date)
        data.date = data.date.toISOString().slice(0, 10);
      const slug = file.slice(0, -3);
      documents.push({
        ...data,
        _id: `${type}.${slug}`,
        _type: type,
        ...(type !== 'depoimento'
          ? { slug: { _type: 'slug', current: slug } }
          : {}),
        body: markdownToBlocks(content),
      });
    }
  }
  return { documents, manifest };
}

export function demoContent(documents) {
  const list = (type) =>
    documents
      .filter((doc) => doc._type === type)
      .map((doc) => ({ ...doc, slug: doc.slug?.current }));
  return {
    site: documents.find((doc) => doc._id === 'institucional'),
    noticias: list('noticia').sort((a, b) => b.date.localeCompare(a.date)),
    eventos: list('evento').sort((a, b) => a.date.localeCompare(b.date)),
    projetos: list('projeto').sort((a, b) => a.title.localeCompare(b.title)),
    depoimentos: list('depoimento').sort((a, b) =>
      a.name.localeCompare(b.name),
    ),
  };
}
