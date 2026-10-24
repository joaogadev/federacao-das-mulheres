import { toHTML } from '@portabletext/to-html';
import type { Body } from './content-model';

export function renderBody(body: Body) {
  // The serializer escapes text; custom links also validate protocol and escape attributes.
  return toHTML(body, {
    components: {
      marks: {
        link: ({ value, children }) => {
          const href = String(value?.href ?? '');
          if (!/^https?:\/\//i.test(href)) return children;
          const escaped = href
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/'/g, '&#39;');
          return `<a href="${escaped}" rel="noopener noreferrer">${children}</a>`;
        },
      },
    },
    onMissingComponent: (message) => {
      throw new Error(`Conteúdo não suportado: ${message}`);
    },
  });
}
