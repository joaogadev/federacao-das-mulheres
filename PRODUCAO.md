# Publicação, operação e aceite

Este roteiro descreve as etapas externas que não podem ser concluídas sem contas e identificadores reais. O projeto não cria projetos Sanity/Cloudflare, não convida pessoas e não publica automaticamente durante a instalação local.

## 1. Sanity e Studio

1. Crie o projeto institucional Free e o dataset público `production` no Sanity Manage.
2. Preencha `.env` e `studio/.env` com os mesmos Project ID e dataset; use os exemplos versionados.
3. Adicione a origem local `http://localhost:3333` às origens CORS autorizadas, com credenciais. O deploy hospedado pelo Sanity configura sua origem; confira-a após publicar. Não autorize `*`.
4. Instale e abra o Studio: `npm --prefix studio ci` e `npm run studio:dev`.
5. Cadastre o conteúdo institucional ou siga a importação descrita em [migration/README.md](migration/README.md). A importação cria rascunhos; nada aparece no site antes de publicar.
6. Publique o documento institucional. As outras coleções podem começar vazias.
7. Execute `npm run studio:check`, `npm run studio:build` e `npm run studio:deploy`. O último comando exige autenticação Sanity e efetivamente publica o painel.
8. Registre hostname/App ID em `studio/.env`, quando fornecidos. `deployment.autoUpdates` está habilitado. Defina `PUBLIC_SANITY_STUDIO_URL` no frontend.
9. Convide pelo menos duas responsáveis com contas individuais. No Free, quem escreve precisa de Administrator; Viewer não edita. Explique os poderes administrativos e confirme o plano Free, sem depender de recursos de trial.

O Studio não expõe tokens. Os campos institucionais são agrupados e há uma entrada única com ID fixo. A limitação de ações dessa entrada protege o fluxo editorial, não substitui autorização do Sanity.

## 2. Cloudflare Pages

Use **Pages com integração Git**, não Direct Upload, pois o Deploy Hook precisa de um projeto ligado ao repositório.

| Configuração               | Valor                                                |
| -------------------------- | ---------------------------------------------------- |
| Repositório                | Repositório GitHub deste código                      |
| Branch de produção         | `main` (ou a branch efetiva, igual à do Deploy Hook) |
| Diretório raiz             | Raiz do repositório                                  |
| Comando de build           | `npm run build`                                      |
| Diretório de saída         | `dist`                                               |
| `NODE_VERSION`             | `22.14.0`                                            |
| `SANITY_PROJECT_ID`        | ID real do projeto                                   |
| `SANITY_DATASET`           | `production`                                         |
| `SITE_URL`                 | URL HTTPS canônica do site                           |
| `PUBLIC_SANITY_STUDIO_URL` | URL HTTPS do Studio                                  |

Não configure token Sanity no build. Não defina `CONTENT_SOURCE=demo`; o código bloqueia esse modo no Cloudflare. Use um dataset separado para previews de código se necessário; no Free ambos os datasets devem conter apenas informações públicas. As variáveis de preview e produção são configuradas separadamente no painel.

O Astro gera todos os arquivos antes da etapa de deploy. Se o comando falhar, o Pages não publica esse build, mantendo a implantação anterior. Não acrescente `|| true`, scripts que ignorem erros ou etapas que façam upload de `dist` após falha. O arquivo 404 estático impede que endereços removidos sejam tratados como páginas de uma SPA.

O código não retorna conteúdo antigo, vazio ou demonstrativo em caso de falha da API. A ausência do documento institucional bloqueia o build; coleções genuinamente vazias são permitidas.

Após cadastrar um domínio próprio, altere `SITE_URL` e gere um novo build. Registro/renovação de domínio é um custo separado. A URL gratuita `*.pages.dev` é suficiente.

## 3. Webhook de publicação

No Cloudflare Pages → projeto → Settings → Builds & deployments → Deploy hooks:

1. Crie um hook `sanity-publicacoes` para a branch de produção.
2. Copie a URL gerada diretamente para o webhook do Sanity. **A URL é um segredo que permite iniciar builds**. Não a coloque no código, README, frontend ou GitHub.

No Sanity Manage → projeto → API → Webhooks:

- Nome: `Publicar site institucional`.
- URL: Deploy Hook real do Cloudflare.
- Dataset: `production`.
- Método: **POST**.
- Triggers: **Create, Update e Delete**.
- Drafts e Versions: **desativados**.
- Status: habilitado.
- Projection: `{ "documentId": coalesce(after()._id, before()._id) }`.
- Filter:

```groq
coalesce(after()._type, before()._type) in [
  "institucional", "noticia", "evento", "projeto", "depoimento"
]
&& !(coalesce(after()._id, before()._id) in path("drafts.**"))
&& !(coalesce(after()._id, before()._id) in path("versions.**"))
```

Usar `before()` no Delete inclui exclusão e despublicação. Publicar um documento que referencia imagem já enviada aciona o build; uploads de assets isolados e alterações de rascunhos não devem consumir builds.

O Deploy Hook não verifica a assinatura HMAC do Sanity; não configure um “secret” esperando que ele forneça essa validação. A autorização aqui é a URL secreta do próprio Cloudflare, conforme a integração oficial. Se a URL vazar, revogue-a no Cloudflare, crie outra e atualize o Sanity. Nenhuma API intermediária é necessária.

O webhook usa entrega com possibilidade de retry, portanto podem ocorrer builds repetidos. Consulte os logs das duas plataformas antes de reenviar. Mantenha o hook desabilitado durante uma importação em massa e habilite ao concluir, fazendo um build manual para sincronizar.

Fontes: [Deploy Hooks e integração Sanity](https://developers.cloudflare.com/pages/configuration/deploy-hooks/) e [webhooks do Sanity](https://www.sanity.io/docs/content-lake/webhooks).

## 4. Aceite antes de entregar

Realize com o projeto/dataset real e registre data e responsável:

- As duas contas convidadas entram no Studio e conseguem criar/editar conteúdo. Nenhuma precisa de GitHub.
- Publique o conteúdo institucional; abra início, sobre, contato e confira nome, metadados e rodapé.
- Crie uma notícia com acentos, resumo, data, texto formatado, imagem e descrição da imagem. Publique, acompanhe webhook/build e confira listagem e página individual.
- Edite a notícia, salve apenas o rascunho e confira que o site continua com a publicação anterior, inclusive após um build manual.
- Publique a alteração e confira a nova versão após o deploy.
- Despublique e depois exclua um item de teste: a listagem e a URL devem desaparecer no próximo build; a URL antiga deve responder 404.
- Confira eventos, projetos, depoimentos, redes sociais, doação e estados vazios.
- Confira leitura por teclado, links, foco visível e layout em celular e desktop.
- No navegador do site público, confirme que não há requisições de conteúdo para `api.sanity.io`; imagens podem usar `cdn.sanity.io`.
- Provoque uma falha apenas em uma implantação de teste/preview, por exemplo usando um dataset inexistente, e confirme que a última implantação de produção não mudou.
- Confirme no Sanity Usage e no Cloudflare o plano Free e os limites aplicáveis.

Não simule esse aceite apenas com a demonstração local: ela valida o código e o acervo, não login, permissões, rede, webhook ou deploy reais.

## 5. Operação e recuperação

A mudança aparece somente depois do build. Se não aparecer, confira publicação no Studio, logs do webhook, branch/dataset configurados e o resultado do build no Pages.

Uma falha conserva o HTML publicado anteriormente, inclusive conteúdo que se tentou excluir. Para uma remoção urgente, corrija o build e confirme o deploy; excluir no CMS sozinho não retira o HTML já hospedado. Assets são públicos e têm caches próprios, portanto nunca envie material confidencial.

Ative notificações de builds com falha para a pessoa técnica responsável. Restaure um deploy bem-sucedido pelo rollback do Pages quando necessário; o rollback do site não reverte o Content Lake. Corrija também o conteúdo para o próximo build não reintroduzir o problema.

Exporte periodicamente o dataset pelo mecanismo oficial do Sanity e guarde a cópia em local controlado pela instituição; GitHub contém código, não backup do conteúdo editorial atual. O acervo legado é apenas o retrato inicial fictício. Consulte [exportação do Sanity](https://www.sanity.io/docs/content-lake/exporting-data) e [rollback do Pages](https://developers.cloudflare.com/pages/configuration/rollbacks/).

Revisões ocasionais de dependências, acesso das responsáveis e quotas continuam necessárias. O objetivo é eliminar operação técnica cotidiana, não prometer manutenção zero por tempo indefinido.
