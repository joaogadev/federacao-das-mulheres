# Filiação com Asaas no Sistema 2

## Fluxo

1. O site institucional abre o Link de Pagamento hospedado no Asaas. A nova filiada preenche os dados de identificação e pagamento no próprio Asaas; o site não recebe cartão nem credenciais financeiras.
2. O Asaas cria o cliente, a assinatura mensal e a cobrança. O webhook envia o ID da cobrança ao backend do Sistema 2.
3. O backend consulta a cobrança e o cliente na API do Asaas. Só depois de a cobrança estar `CONFIRMED` ou `RECEIVED` cria a pessoa, a filiação e a assinatura no PostgreSQL via Prisma. Nome, e-mail e telefone aparecem no painel. A decisão institucional sobre a filiação continua separada do pagamento.
4. Eventos repetidos são deduplicados pelo ID. A conciliação periódica recupera cobranças mesmo se um webhook falhar. Cobranças mensais seguintes são vinculadas pela assinatura.

## Estrutura do banco nesta branch

O schema Prisma aproveita a base comum do Sistema 2 e o controle manual de filiações existente na branch Cakto. `Membership.source` distingue `ASAAS`, `MANUAL` e `MISTA`. `ManualMonth` guarda mensalidades conferidas pela Federação, com responsável e histórico de auditoria. As cobranças do Asaas continuam em `Subscription` e `Payment`; tabelas de pedidos Cakto não são necessárias nesta branch.

Uma administradora pode cadastrar filiada anterior ao Asaas pelo painel, com nome, CPF e telefone, e conferir seus meses manualmente. Se essa pessoa depois pagar pelo link Asaas com o mesmo CPF, o backend vincula o cliente e a assinatura à filiação existente e altera a origem para `MISTA`, sem duplicar a filiada. O banco desta branch permanece separado do banco Cakto; a conta administradora local foi reaproveitada sem copiar filiações ou pagamentos.

## Ativação no Sandbox

1. Na conta Asaas Sandbox da Federação, gere uma chave de API e configure `ASAAS_ENV=sandbox` e `ASAAS_API_KEY` em `sistema-2/backend/.env`. Não coloque a chave em `PUBLIC_*` ou `VITE_*`.
2. Defina o valor mensal aprovado. No diretório `sistema-2/backend`, execute `npm run asaas:link:affiliation -- 35.00 PIX`, substituindo `35.00` pelo valor real. O comando cria um Link de Pagamento recorrente mensal com Pix, informa `dueDateLimitDays=10` (exigido pela API no teste Sandbox desta combinação) e imprime o ID e a URL. Use `UNDEFINED` no lugar de `PIX` apenas se a Federação quiser oferecer os demais meios disponíveis na conta. A cobrança Pix mensal exige novo pagamento a cada ciclo; não representa débito automático.
3. Copie o ID retornado para `ASAAS_AFFILIATION_LINK_ID` no `.env` do backend. Copie a URL retornada para `PUBLIC_ASAAS_AFFILIATION_URL` no `.env` da raiz. Reinicie o backend e reconstrua ou reinicie o site institucional.
4. Configure no painel Asaas um webhook para `POST https://SEU_BACKEND/webhooks/asaas`. Gere um token exclusivo de 32 a 255 caracteres, configure-o como token de autenticação do webhook no Asaas e copie o mesmo valor para `ASAAS_WEBHOOK_TOKEN` no backend. Habilite os eventos de pagamento e assinatura descritos em [contratos de eventos](04-contratos-api-e-eventos.md). Para testes locais, exponha a API por uma URL HTTPS temporária ou use as fixtures do projeto; o Asaas não consegue chamar `localhost` diretamente.
5. Faça um pagamento simulado no Sandbox. Verifique o webhook e a consulta à API; antes da confirmação a pessoa não deve aparecer em **Filiadas**. Após `CONFIRMED` ou `RECEIVED`, confira nome, telefone e e-mail no painel. Teste uma segunda cobrança e uma reentrega do mesmo evento.

## Produção

Gere chave e webhook próprios de produção, configure `ASAAS_ENV=production`, defina URLs HTTPS finais e crie um **novo** link na conta real. O comando só cria o link de produção com `npm run asaas:link:affiliation -- VALOR PIX --confirm-production`. Confirme valor, termos e política de privacidade antes de publicar a URL. Um retorno visual do Asaas não prova pagamento; o Sistema 2 usa o estado da cobrança consultado na API.

## Limites

Esta branch não contém chave, token, valor aprovado ou link reais. Não é possível executar uma transação Asaas ponta a ponta sem esses dados e um webhook público. A API do Asaas pode devolver campos de contato vazios se a conta ou o formulário não os coletar; nesse caso o painel preserva o que foi recebido, sem inventar e-mail ou telefone.
