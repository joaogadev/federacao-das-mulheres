# Acervo original e migração

`legacy/` preserva os 11 Markdown e o JSON institucional do protótipo. Esses arquivos são apenas acervo de migração e dados da demonstração local: o site de produção não os consulta. Não removê-los antes da importação, conferência e aceite da instituição.

1. `npm run migrate:prepare` converte o acervo em Portable Text e gera `output/content.ndjson` com 12 rascunhos e um manifesto SHA-256 das fontes. Não envia nada ao Sanity.
2. Configure as variáveis do `.env` e um token temporário com permissão de escrita no projeto Sanity correto.
3. `npm run migrate:import` envia apenas documentos ainda inexistentes, com IDs determinísticos. Não sobrescreve versões publicadas ou rascunhos existentes. Execute sem edição simultânea durante a migração inicial.
4. `npm run migrate:verify` compara todos os campos com o Sanity, antes de editar os textos. Diferenças fazem o comando falhar, sem excluir nenhum arquivo.
5. Revise e substitua dados fictícios pelo Studio. Publique primeiro **Informações da Federação**, depois os demais conteúdos aprovados. Revogue o token e remova-o do `.env`.

As URLs existentes de notícias, eventos e projetos são preservadas pelos slugs. Depoimentos não precisam de slug. Os arquivos atuais não possuem imagens de conteúdo; `hero.svg` e `favicon.svg` continuam como elementos visuais do código. O conversor interrompe se encontrar imagem legada, HTML ou Markdown não suportado, em vez de perder conteúdo. Imagens novas são enviadas diretamente pelo Studio ao Content Lake.

A importação é opcional: o conteúdo é fictício. A instituição também pode começar com documentos novos no Studio. O documento institucional único tem ID `institucional`, definido pela estrutura do painel. Os arquivos gerados ficam ignorados pelo Git. Uma conferência posterior a alterações editoriais pode apontar diferenças legítimas; não use isso como motivo para sobrescrever o Sanity.
