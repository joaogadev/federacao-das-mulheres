# Federação das Mulheres — site institucional

Site informativo em **Astro + TypeScript**, com conteúdo no **Sanity Content Lake**, painel editorial no **Sanity Studio** e hospedagem estática no **Cloudflare Pages**. GitHub guarda o código-fonte; as responsáveis editam pelo Studio com contas individuais, sem GitHub ou comandos.

Este é somente o Sistema 1. Não inclui cadastro de associadas, documentos privados, financeiro, autenticação própria, pagamentos ou banco de dados próprio.

## Arquitetura

```text
Responsável → Sanity Studio → Content Lake (publicação)
                                  ↓ webhook POST
GitHub (código) → Cloudflare Pages → Astro build → HTML estático
                                      ↑
                        consulta somente conteúdo publicado
```

- O Astro consulta o Sanity durante o build, com `perspective: published`, filtros contra rascunhos/versões e `useCdn: false`. O resultado é validado e compartilhado pelas páginas do build.
- Não há consulta de conteúdo à API a cada visita. As imagens são servidas pela CDN do Sanity, com largura limitada e formato automático.
- Notícias, eventos e projetos têm listagens e páginas individuais; depoimentos aparecem em uma página. Início, sobre, contatos, metadados e rodapé usam o documento institucional.
- O Studio fica em `studio/`, com instalação separada. React é uma dependência do Studio, não do frontend público.
- `/admin/` mantém o acesso ao painel pelo rodapé, apontando para o Studio hospedado. A autenticação é inteiramente do Sanity.
- Falhas de rede, conteúdo obrigatório ausente, datas inválidas, imagens sem descrição e slugs duplicados interrompem o build. Não existe fallback de produção para dados antigos ou fictícios.

## Requisitos e instalação

Node.js **22.12+** e npm; a versão sugerida está em `.node-version`. Use os lockfiles para instalações reproduzíveis.

```bash
npm ci
npm --prefix studio ci
```

A instalação do Studio só é necessária na máquina técnica, não no Cloudflare nem no computador das responsáveis editoriais.

## Avaliar sem conta Sanity

```bash
npm run dev:demo
```

Abra `http://localhost:4321/`. Esse modo usa exclusivamente o acervo fictício preservado, tem `noindex` e não fala com o Sanity. Para verificar a geração estática:

```bash
npm run build:demo
node scripts/verify-build.mjs
npm run preview
```

Não publique `dist/` gerado pela demonstração. O modo é bloqueado em CI e Cloudflare e nunca é acionado automaticamente por uma falha de configuração ou API.

## Conectar ao Sanity

1. Crie uma conta individual no [Sanity Manage](https://www.sanity.io/manage) e um projeto da instituição no plano Free.
2. Crie o dataset **público** `production`. Registre o Project ID.
3. Copie `.env.example` para `.env` e `studio/.env.example` para `studio/.env`; preencha os valores. Nunca versione esses arquivos.
4. Em API → CORS origins, autorize `http://localhost:3333` com credenciais para o Studio local. Não use origem curinga. O frontend estático não precisa de CORS, pois a consulta ocorre no build.
5. Execute o Studio, entre pelo login do Sanity e preencha/publice **Informações da Federação**, ou faça a migração descrita abaixo.
6. Execute o frontend e confira os conteúdos publicados.

| Variável                   | Local                           | Finalidade                                                     |
| -------------------------- | ------------------------------- | -------------------------------------------------------------- |
| `SANITY_PROJECT_ID`        | `.env` e Cloudflare             | ID público do projeto                                          |
| `SANITY_DATASET`           | `.env` e Cloudflare             | Dataset, normalmente `production`                              |
| `SITE_URL`                 | `.env` e Cloudflare             | URL HTTPS definitiva, usada nos links canônicos                |
| `PUBLIC_SANITY_STUDIO_URL` | `.env` e Cloudflare             | URL HTTPS do Studio hospedado                                  |
| `SANITY_STUDIO_PROJECT_ID` | `studio/.env`                   | Mesmo projeto do frontend                                      |
| `SANITY_STUDIO_DATASET`    | `studio/.env`                   | Mesmo dataset do frontend                                      |
| `SANITY_STUDIO_HOSTNAME`   | `studio/.env`                   | Nome escolhido para o subdomínio do Studio                     |
| `SANITY_STUDIO_APP_ID`     | `studio/.env`                   | ID público informado no primeiro deploy, opcional inicialmente |
| `SANITY_API_WRITE_TOKEN`   | Somente `.env` local temporário | Importação e conferência inicial                               |

O frontend não precisa de token de leitura. Nunca inclua tokens em variáveis `PUBLIC_*` ou `SANITY_STUDIO_*`, no Studio, em screenshots ou no Git. Não configure o token de importação no Cloudflare.

### Desenvolvimento conectado

Em um terminal:

```bash
npm run dev
```

Em outro:

```bash
npm run studio:dev
```

Site: `http://localhost:4321/`. Studio: `http://localhost:3333/`. Publique no Studio e recarregue o site local para consultar a versão publicada. Não há preview público de rascunhos nem edição visual integrada.

## Migração do acervo

Os 11 Markdown e o JSON institucional foram preservados em `migration/legacy/`. Os dados são demonstrativos e precisam de revisão antes de publicação real.

```bash
npm run migrate:prepare
```

Esse comando gera um NDJSON de **12 rascunhos** e um manifesto das fontes, sem acessar contas externas. Depois de configurar um token temporário:

```bash
npm run migrate:import
npm run migrate:verify
```

A importação usa IDs determinísticos, preserva slugs antigos e não sobrescreve documentos existentes. A conferência compara todos os campos antes das alterações editoriais. Revise os rascunhos, publique primeiro o documento institucional e depois os demais itens aprovados. Revogue o token após concluir. Veja [migration/README.md](migration/README.md).

Nenhum conteúdo original precisa ser excluído para operar o site. Ele deixa de ser fonte de produção; novas alterações editoriais pertencem exclusivamente ao Sanity.

## Publicar Studio e frontend

O Studio é hospedado gratuitamente pelo Sanity em um endereço `*.sanity.studio`. Uma pessoa técnica faz a instalação inicial:

```bash
npm run studio:check
npm run studio:build
npm run studio:deploy
```

O deploy exige login e um projeto real. Escolha o hostname, registre o App ID quando fornecido e preencha `PUBLIC_SANITY_STUDIO_URL`. Atualizações automáticas do Studio estão habilitadas na configuração; mudanças nos schemas ainda exigem novo deploy técnico. Consulte a [documentação de hospedagem do Sanity](https://www.sanity.io/docs/studio/deployment).

No Cloudflare Pages, conecte o repositório GitHub à branch que contém este código, diretório raiz do projeto, comando **`npm run build`** e saída **`dist`**. Configure Node 22.14.0 e as quatro variáveis do frontend da tabela. Não use adaptador SSR, Workers, Functions ou `build:demo`. A instalação do frontend ocorre pelo lockfile da raiz; não instale o Studio no build do Pages.

As etapas completas, filtro do webhook, tratamento de falhas e checklist de entrega estão em [PRODUCAO.md](PRODUCAO.md).

## Publicação automática

Crie um Deploy Hook do Cloudflare para a mesma branch de produção. Cadastre a URL secreta como webhook POST no Sanity, limitado ao dataset `production`, aos cinco tipos de documentos e aos eventos Create, Update e Delete. Deixe eventos de drafts/versions desativados.

Publicar, atualizar, despublicar ou excluir um documento aciona um novo build. Salvar rascunhos não deve acionar o hook. As alterações aparecem após a conclusão da implantação; não são instantâneas. Consulte o filtro copiável em [PRODUCAO.md](PRODUCAO.md) e a [integração oficial do Cloudflare com Sanity](https://developers.cloudflare.com/pages/configuration/deploy-hooks/).

## Responsáveis editoriais e uso cotidiano

Em Sanity Manage → projeto → Members, convide cada responsável pelo próprio e-mail. Para duas ou mais pessoas que editarão no plano Free, atribua **Administrator**. **Viewer** permite consulta, não edição. Não compartilhe contas ou senhas.

O Free não oferece papel **Editor**: Administrator também possui acesso amplo às configurações do projeto. A organização deve aceitar essa limitação; ocultar opções no Studio não é controle de permissão. Caso seja necessário restringir edição sem administração, avalie um plano que ofereça esse papel. Não existe contorno implementado no código.

Para publicar uma notícia:

1. Abra o site e clique em **Painel editorial → Acessar o Sanity Studio**.
2. Entre com sua conta convidada e abra **Notícias → novo documento**.
3. Preencha título, clique em **Gerar** no endereço da página, adicione resumo, data e conteúdo.
4. Se enviar uma imagem, preencha a descrição para leitores de tela.
5. Revise e clique em **Publicar**. Aguarde a implantação e confira a notícia no site.

Para editar, abra o item existente, altere e publique novamente. Para retirar uma publicação, use **Despublicar** ou **Excluir** no menu do documento; ela sairá do site no próximo build. O documento institucional tem uma entrada única no painel, organizada em página inicial, sobre e contato. Sua exclusão/despublicação é ocultada para evitar interrupções acidentais, mas isso não restringe privilégios de Administrator.

Não altere endereços de páginas já compartilhados sem planejar redirecionamentos. Não publique depoimentos ou fotos sem autorização. Tudo neste dataset deve ser apropriado para divulgação pública, inclusive assets: não armazene documentos privados, dados de associadas, finanças ou informações confidenciais.

## Verificação

```bash
npm run check
npm test
npm run format:check
npm run build:demo
node scripts/verify-build.mjs
npm run studio:check
```

Com os projetos e variáveis reais configurados:

```bash
npm run build
npm run studio:build
```

Os testes verificam preservação do acervo, consulta GROQ com rascunhos/versões, imagens, validações, renderização segura e datas. A verificação do build de demonstração confere 17 páginas (incluindo a 404), metadados, assets e links internos. Login, importação remota e webhook requerem aceite com contas reais; não são simulados como concluídos.

## Limites, custos e manutenção

Conferido em 23/10/2026; os serviços podem alterar os planos.

| Serviço Free      | Limites relevantes                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------ |
| Sanity            | Até 20 assentos, papéis Administrator/Viewer, 2 datasets públicos, 10 mil documentos e 2 webhooks      |
| Sanity uso mensal | 250 mil requisições API, 1 milhão via API CDN e 100 GB de transferência; 100 GB de assets              |
| Cloudflare Pages  | 500 builds/mês, 1 build simultâneo, duração máxima de 20 minutos, 20 mil arquivos e 25 MiB por arquivo |

Fontes: [preços e limites do Sanity](https://www.sanity.io/pricing) e [limites do Cloudflare Pages](https://developers.cloudflare.com/pages/platform/limits/).

Imagens acessadas pelos visitantes consomem a franquia do Sanity. Publicações e commits de código consomem builds; retries do webhook também podem consumir. Domínio próprio, planos pagos, papéis adicionais e serviços opcionais podem ter custo. Confirme o plano ativo após qualquer período de avaliação; acompanhe Usage sem ativar upgrades pagos automaticamente.

O trabalho editorial não exige manutenção técnica cotidiana, mas não é possível garantir manutenção zero: dependências, Node, segurança, domínio, contas, quotas e mudanças dos provedores precisam de revisão ocasional. O Studio hospedado tem autoatualização; faça uma verificação após mudanças relevantes.

A lista de próximos eventos reflete a data do **último build**. Sem publicação ou novo deploy, a passagem do dia não atualiza HTML estático. A agenda completa preserva todos os eventos. Não foi adicionado agendador ou backend para isso.

## Organização

- `src/pages/`, `src/components/`, `src/layouts/`: páginas e componentes reutilizados.
- `src/lib/content*.ts`, `sanity-query.ts`, `rich-text.ts`: consulta, validação e apresentação.
- `studio/`: schemas, interface editorial, configuração e lockfile próprios.
- `migration/`, `scripts/`: acervo, preparação/importação e demonstração.
- `tests/`: verificações da integração.

## Quando uma publicação não aparece no site

1. No Studio, confira se clicou em **Publicar**. Salvar um rascunho não altera o site público.
2. Na raiz, execute `npm run diagnose:content` (com `.env` configurado). O comando lista IDs e tipos visíveis publicamente e, se houver token local, também os rascunhos. Não imprime o token nem a URL secreta do webhook. Em Windows com erro de certificado, use `$env:NODE_OPTIONS='--use-system-ca'` antes do comando.
   Se um item criado no Studio não aparecer nem entre os rascunhos, confira o Project ID e o dataset do Studio hospedado; publicar uma nova versão do Studio pode ser necessário se ele ainda usa uma configuração antiga.
3. Execute `npm run build` e confira as rotas geradas. A leitura acontece no build; visitantes não consultam o Sanity em tempo real.
4. No Cloudflare Pages, confirme que o build usa `npm run build`, saída `dist`, dataset e Project ID corretos, e a **branch que contém este código**. O trabalho atual está em `joaoGabriel`; a `main` local ainda contém somente o commit inicial. Se o Cloudflare acompanha `main`, altere a branch de produção ou integre o código nela antes de esperar atualizações.
5. No Sanity Manage → API → Webhooks, confira se o webhook POST para o Deploy Hook do Cloudflare está ativo para `production` e consulte o histórico de tentativas. Depois confirme no Cloudflare se um novo deploy terminou com sucesso. Alterar só o `.env` local não altera as variáveis do Cloudflare.

Os exemplos do modo `dev:demo`/`build:demo` vêm de `migration/legacy/` e não são editáveis no Studio até serem importados. `npm run migrate:import` cria rascunhos sem sobrescrever documentos existentes; revise o conteúdo fictício antes de publicar. `npm run migrate:verify-drafts` confere os 11 rascunhos caso a página institucional já tenha sido personalizada.
