# Filiações Cakto e cadastro anterior

O Sistema 2 mantém a digitalização de documentos. Novas afiliadas entram automaticamente **após a confirmação do primeiro pagamento**; afiliadas anteriores podem ser cadastradas por uma pessoa `ADMIN` e ter cada mensalidade conferida manualmente. Os dois tipos de pagamento ficam identificados separadamente.

## Configuração do backend

1. Aplique a migração do Prisma com `npm run db:migrate` em `sistema-2/backend` antes de iniciar a versão nova do backend. Faça backup do banco antes da migração em produção.
2. Configure `CAKTO_WEBHOOK_SECRET` com o segredo gerado para o webhook no painel Cakto e `CAKTO_PRODUCT_ID` com o ID do produto de assinatura da Federação. O link do checkout não é o ID do produto.
3. Publique o backend sob HTTPS e cadastre `https://SEU-BACKEND/webhooks/cakto` em **Integrações → Webhooks** da Cakto, limitado ao produto de filiação. Selecione `purchase_approved`, `purchase_refused`, `refund`, `chargeback`, `subscription_renewed`, `subscription_renewal_refused`, `subscription_late`, `subscription_late_recovered`, `subscription_canceled`, `subscription_paused` e `subscription_resumed`.
4. Use o evento de teste da Cakto para conferir a assinatura e a entrega. O evento de teste usa dados fictícios e não comprova cadastro real. Depois confirme com um pagamento aprovado do produto institucional, sem utilizar dados pessoais de terceiros em testes.

O endpoint verifica `X-Cakto-Timestamp` e `X-Cakto-Signature` contra o corpo bruto, rejeita entregas antigas e ignora produtos diferentes. Só um pedido principal pago, com CPF, telefone e ID de assinatura, cria uma afiliada automaticamente. Eventos repetidos atualizam o mesmo pedido. Falhas de entrega precisam ser examinadas no histórico da Cakto; a Cakto não tenta novamente após uma resposta de erro do backend.

## Painel

Em **Afiliadas**, a pessoa `ADMIN` cadastra uma afiliada anterior com nome, CPF e telefone. No detalhe, seleciona o mês e registra se o pagamento foi conferido, com valor, data e observação. O painel mostra a pessoa responsável e mantém auditoria da alteração. Um mês sem registro permanece sem conferência.

Pedidos recebidos por webhook aparecem como pagamentos Cakto. Uma afiliada já cadastrada manualmente pode receber uma assinatura Cakto posteriormente; o vínculo usa o CPF e conserva os lançamentos anteriores. CPF duplicado ou assinatura divergente exigem correção administrativa.

Os componentes Asaas existentes permanecem apenas para consulta de dados legados. Não são necessários para iniciar o backend em produção nesta etapa. A consulta GET à API Cakto para conciliação e importação histórica ainda não foi implementada; o cadastro automático depende da entrega do webhook.

Referência: [guia oficial de webhooks da Cakto](https://docs.cakto.com.br/conceitos/webhooks).
