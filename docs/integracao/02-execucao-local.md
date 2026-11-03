# 02 — Execução local

Pré-requisitos: Node 22.14 (indicado em `.node-version`), npm, Docker com daemon ativo e Docker Compose. Existem três instalações separadas; nenhum workspace foi imposto ao site institucional. Portas: Astro `4321`, Sanity Studio `3333`, API `3001`, painel `5173`, PostgreSQL `5432` somente no computador local.

## Windows PowerShell

Na raiz do repositório:

```powershell
Copy-Item .env.example .env
Copy-Item sistema-2/.env.example sistema-2/.env
Copy-Item sistema-2/backend/.env.example sistema-2/backend/.env
Copy-Item sistema-2/frontend/.env.example sistema-2/frontend/.env
```

Escolha uma senha local forte para `POSTGRES_PASSWORD` em `sistema-2/.env` e use a mesma senha na URL codificada de `DATABASE_URL` do backend antes de iniciar o banco. O Compose espera a senha explicitamente. Em seguida:

```powershell
npm ci
npm --prefix sistema-2/backend ci
npm --prefix sistema-2/frontend ci
docker compose --env-file sistema-2/.env -f sistema-2/docker-compose.yml up -d
npm --prefix sistema-2/backend run db:generate
npm --prefix sistema-2/backend run db:migrate
```

Após o banco ficar saudável, crie o primeiro administrador sem salvar a senha no repositório:

```powershell
$env:ADMIN_EMAIL='admin@exemplo.invalid'
$env:ADMIN_PASSWORD=[System.Net.NetworkCredential]::new('',(Read-Host -AsSecureString 'Senha com pelo menos 16 caracteres')).Password
npm --prefix sistema-2/backend run admin:create
Remove-Item Env:ADMIN_PASSWORD
Remove-Item Env:ADMIN_EMAIL
```

`admin:create` é idempotente: uma conta existente não recebe senha ou papel alterados. Um responsável com acesso técnico ao banco pode criar acesso só de consulta com `npm --prefix sistema-2/backend run admin:create-consulta` e as mesmas variáveis. Para redefinir senha de uma conta, use `admin:password`; todas as sessões dela serão invalidadas. Não há cadastro público. Não compartilhe a conta do Sanity com operadores do Sistema 2.

Em terminais distintos:

```powershell
npm --prefix sistema-2/backend run dev
npm --prefix sistema-2/frontend run dev
npm run dev:demo
```

Abra `http://localhost:5173`, `http://localhost:3001/health/ready` e `http://localhost:4321`. A API deve responder `{"status":"ok"}` no health check. O site demo é fictício e não se comunica com a API. Para conteúdo editorial real, configure Sanity e execute `npm run dev` em vez de `dev:demo`.

## Bash

Use `cp` no lugar de `Copy-Item`. Para o primeiro administrador, defina `ADMIN_EMAIL` e leia `ADMIN_PASSWORD` sem eco, execute o comando, depois remova as variáveis:

```bash
read -r -p 'E-mail: ' ADMIN_EMAIL
read -r -s -p 'Senha: ' ADMIN_PASSWORD
export ADMIN_EMAIL ADMIN_PASSWORD
npm --prefix sistema-2/backend run admin:create
unset ADMIN_EMAIL ADMIN_PASSWORD
```

O NestJS carrega `sistema-2/backend/.env` por `node --env-file`; execute os scripts a partir do diretório do backend via `npm --prefix`. `db:migrate` aplica migrações versionadas sem reset. Para criar uma migração nova em desenvolvimento, edite `prisma/schema.prisma` e execute `npm --prefix sistema-2/backend run db:migrate:dev`; revise o SQL antes de aplicar. Em produção faça backup, aplique `db:migrate` e valide contagens/saúde; não há rollback automático de migrações com dados. Restaure backup ou produza uma migração corretiva se necessário.

Nesta entrega, o Docker local não estava ativo. Para conferir a migração sem alterar uma instância existente, foi iniciado um PostgreSQL 18 isolado em `sistema-2/.local-pg/` (fora do Git), aplicada a migração `20261030_init` em banco vazio e repetido `db:migrate`, que informou “No pending migrations to apply”. O roteiro padrão com Docker Compose ainda precisa ser executado onde o daemon estiver disponível.
