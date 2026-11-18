# Webhook Asaas: túnel local, Railway ou Render

O Asaas precisa alcançar `POST /webhooks/asaas` por uma URL HTTPS pública. O backend **não precisa estar hospedado** para um teste curto: um túnel HTTPS até `localhost:3001` é suficiente. Hospedagem é útil quando a API deve continuar disponível com o computador desligado.

## Caminho rápido: túnel local

1. Inicie o PostgreSQL, a API e, se desejar acompanhar o painel, o frontend conforme [execução local](02-execucao-local.md). Confira `http://localhost:3001/health/ready`.
2. Instale `cloudflared` pelo [download oficial](https://developers.cloudflare.com/tunnel/downloads/) e execute `cloudflared tunnel --url http://localhost:3001` em outro terminal.
3. Copie a URL `https://...trycloudflare.com` mostrada pelo comando. Cadastre no Asaas Sandbox `https://...trycloudflare.com/webhooks/asaas`. O caminho é **webhooks**, no plural. `GET` nessa rota não é um teste: o Asaas envia `POST`.
4. Gere o Auth Token no cadastro do webhook Asaas e copie o mesmo valor para `ASAAS_WEBHOOK_TOKEN` no `.env` do backend. Reinicie a API. Selecione `PAYMENT_CREATED`, `PAYMENT_CONFIRMED` e `PAYMENT_RECEIVED`.
5. Faça uma cobrança pelo link Sandbox, confirme seu pagamento no Asaas e confira **Integrações → Logs de Webhooks**. A entrega deve retornar HTTP 200. O túnel e o computador precisam permanecer ligados; a URL muda quando o túnel reinicia.

Referências: [receber webhooks no Sandbox](https://docs.asaas.com/docs/receba-eventos-do-asaas-no-seu-endpoint-de-webhook) e [Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).

## Antes de hospedar

1. Revise as alterações da branch `features/sistema-2-asaas`, faça commit e push para o GitHub. Railway e Render só recebem o que estiver na branch remota. Os `.env` locais são ignorados pelo Git e **não devem ser enviados**.
2. Separe um PostgreSQL para o ambiente hospedado. O banco local da porta 5433 e a conta de administrador nele não são copiados automaticamente. O banco hospedado começa vazio; aplique migrações e crie um administrador.
3. Use **a chave de API do Sandbox** e o ID do link de filiação Sandbox já criado. Gere um **novo Auth Token** para o webhook hospedado. Configure esse token tanto no Asaas quanto no serviço hospedado, sem colocá-lo no frontend ou no repositório.
4. Para ver os dados no painel remoto, hospede também `sistema-2/frontend` e configure `VITE_API_URL` com a URL pública da API. `FRONTEND_ORIGIN` no backend deve ser a origem HTTPS exata do painel, sem barra final. Como o painel e a API podem estar em origens diferentes, use `COOKIE_SECURE=true` e `COOKIE_SAME_SITE=none` no teste hospedado. Alguns navegadores bloqueiam cookies entre sites; domínios próprios sob o mesmo domínio principal são a solução estável.

## Railway: backend e PostgreSQL

1. Crie um projeto Railway e adicione **Database → PostgreSQL**. O Railway cria uma variável `DATABASE_URL` no serviço do banco.
2. Adicione um serviço **GitHub Repo** para a branch `features/sistema-2-asaas`. Em **Settings**, defina **Root Directory** como `/sistema-2/backend`.
3. Defina **Build Command**: `npm ci --include=dev && npm run db:generate && npm run build`; **Pre-Deploy Command**: `npm run db:migrate`; **Start Command**: `npm start`. O pre-deploy executa as migrações antes de colocar a nova versão no ar.
4. Em **Variables** do backend, crie `DATABASE_URL=${{Postgres.DATABASE_URL}}` (substitua `Postgres` pelo nome exato do serviço do banco), `NODE_ENV=production`, `FRONTEND_ORIGIN` com a URL HTTPS exata do painel, `COOKIE_SECURE=true`, `COOKIE_SAME_SITE=none`, `ASAAS_ENV=sandbox`, `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN`, `ASAAS_AFFILIATION_LINK_ID` e `RECONCILE_INTERVAL_MINUTES=60`. Deixe `ASAAS_DONATION_LINK_ID` vazio se ainda não houver link de doação. Railway fornece `PORT`; não use a porta local 5433 nem `POSTGRES_PASSWORD` local no serviço hospedado.
5. Em **Settings → Networking → Public Networking**, clique **Generate Domain**. Abra `https://DOMINIO/health/ready` e espere `{"status":"ok"}`. O webhook é `https://DOMINIO/webhooks/asaas`.
6. Para criar o primeiro administrador no banco hospedado, adicione temporariamente `ADMIN_EMAIL` e `ADMIN_PASSWORD` nas Variables e mude o **Pre-Deploy Command** para `npm run db:migrate && npm run admin:create`. Depois do deploy bem-sucedido, retire essas duas variáveis e volte o comando para `npm run db:migrate`. `admin:create` é idempotente.

Referências: [monorepo](https://docs.railway.com/deployments/monorepo), [PostgreSQL](https://docs.railway.com/databases/postgresql), [variáveis de referência](https://docs.railway.com/variables/reference), [pre-deploy](https://docs.railway.com/deployments/pre-deploy-command) e [domínio público](https://docs.railway.com/networking/public-networking).

## Railway: painel do Sistema 2

1. No **mesmo projeto Railway** da API e do PostgreSQL, adicione outro serviço **GitHub Repo** com o mesmo repositório e a branch `features/sistema-2-asaas`. Defina **Root Directory** como `/sistema-2/frontend`.
2. Defina **Build Command** como `npm ci --include=dev && npm run build` e **Start Command** como `npm start`. O script `start` serve os arquivos de `dist` na porta fornecida pelo Railway, com fallback para 3000 fora da plataforma. Não configure migração nesse serviço.
3. Em **Variables** do painel, configure `VITE_API_URL=https://DOMINIO-DA-API.up.railway.app`, usando o domínio HTTPS público real da API, sem barra final. Essa variável é incorporada ao build: alterações exigem novo deploy do painel. Nunca coloque chave Asaas, senha ou `DATABASE_URL` no frontend.
4. Em **Settings → Networking → Public Networking**, gere o domínio HTTPS do painel. Abra a URL e confirme que a tela de login aparece.
5. No serviço **da API**, mude `FRONTEND_ORIGIN` para a origem HTTPS exata do painel, sem barra final, e configure `COOKIE_SECURE=true` e `COOKIE_SAME_SITE=none`. Aplique as mudanças com **Deploy**. Faça login no painel; se houver falha, confira CORS e cookies em `GET /auth/me` no navegador.

Referências: [deploy de Vite](https://docs.railway.com/deployments/troubleshooting/no-start-command-could-be-found), [comandos de build e start](https://docs.railway.com/builds/build-and-start-commands) e [domínio público](https://docs.railway.com/networking/public-networking).

## Render: backend, PostgreSQL e painel estático

1. Crie um **Render Postgres** na região desejada. Guarde a **Internal Database URL** para o backend na mesma região. O plano Free serve apenas para testes: o banco Free expira em 30 dias.
2. Crie um **Web Service** conectado ao mesmo repositório e à branch `features/sistema-2-asaas`. Defina **Root Directory** `sistema-2/backend`, runtime Node, **Build Command** `npm ci --include=dev && npm run db:generate && npm run build` e **Start Command** `npm run db:migrate && npm start`. Em serviços pagos, você pode usar `npm run db:migrate` no campo de pre-deploy e deixar `npm start` no start. Configure **Health Check Path** `/health/ready`.
3. Em **Environment**, configure `DATABASE_URL` com a URL **interna** do Render Postgres; configure as demais variáveis da etapa Railway. O Render fornece `PORT` automaticamente. O serviço deve ficar acessível em `https://NOME.onrender.com/health/ready`.
4. Para criar o primeiro administrador no plano Free, configure temporariamente `ADMIN_EMAIL`, `ADMIN_PASSWORD` e **Start Command** `npm run db:migrate && npm run admin:create && npm start`. Depois do primeiro deploy, retire essas variáveis e volte o Start Command para `npm run db:migrate && npm start`.
5. Crie um **Static Site** no mesmo repositório e branch, com **Root Directory** `sistema-2/frontend`, **Build Command** `npm ci --include=dev && npm run build`, **Publish Directory** `dist` e variável de build `VITE_API_URL=https://NOME-DO-BACKEND.onrender.com`. Atualize `FRONTEND_ORIGIN` no backend para a URL HTTPS exata do site estático e faça novo deploy.
6. O web service Free hiberna após 15 minutos sem tráfego e pode levar cerca de um minuto para acordar; isso pode atrapalhar a primeira entrega do webhook. Para homologação contínua, use serviço que não hiberna. O banco Free expira em 30 dias e não é adequado para guardar documentos reais.

Referências: [primeiro deploy](https://render.com/docs/your-first-deploy), [PostgreSQL](https://render.com/docs/postgresql-creating-connecting), [deploys e pre-deploy](https://render.com/docs/deploys) e [limites Free](https://render.com/docs/free).

## Finalizar no Asaas Sandbox

No menu **Integrações → Webhooks**, cadastre a URL HTTPS final do backend seguida de `/webhooks/asaas`, escolha os eventos de pagamento e configure o **mesmo Auth Token** de `ASAAS_WEBHOOK_TOKEN`. A URL de retorno do navegador não comprova pagamento. Faça um pagamento simulado, confirme no Asaas, confira HTTP 200 em **Logs de Webhooks** e verifique a filiada no banco e painel **do ambiente hospedado**. Uma cobrança antiga já presente no banco local não será movida automaticamente.
