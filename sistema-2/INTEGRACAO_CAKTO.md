# Filiações Cakto e cadastro anterior

O Sistema 2 mantém a digitalização de documentos. Novas afiliadas entram automaticamente **após a confirmação do primeiro pagamento**; afiliadas anteriores podem ser cadastradas por uma pessoa `ADMIN` e ter cada mensalidade conferida manualmente. Os dois tipos de pagamento ficam identificados separadamente.

## Configuração do backend

1. Aplique a migração do Prisma com `npm run db:migrate` em `sistema-2/backend` antes de iniciar a versão nova do backend. Faça backup do banco antes da migração em produção.
2. Configure `CAKTO_WEBHOOK_SECRET` com o segredo gerado para o webhook no painel Cakto e `CAKTO_PRODUCT_ID` com o ID do produto de assinatura da Federação. O link do checkout não é o ID do produto. Em **Integrações → Cakto API**, crie uma chave com o escopo **read orders** e configure `CAKTO_CLIENT_ID` e `CAKTO_CLIENT_SECRET` apenas no ambiente privado do backend. A conta produtora deve poder ler os dados de cliente dos pedidos.
   `FRONTEND_ORIGIN` pode ficar sem configuração no primeiro deploy, enquanto o painel administrativo não tiver URL. Nesse estado, o CORS do painel fica fechado. Quando o painel for publicado, informe sua origem HTTPS exata (sem barra final).
3. Na primeira publicação, `CAKTO_WEBHOOK_SECRET` pode ficar sem valor: o receptor recusará todas as entregas até que o segredo real seja configurado. Publique o backend sob HTTPS, cadastre `https://SEU-BACKEND/webhooks/cakto` em **Integrações → Webhooks** da Cakto, limitado ao produto de filiação, copie o segredo gerado para a variável privada `CAKTO_WEBHOOK_SECRET` e aplique a configuração antes de ativar/testar as entregas. Selecione `purchase_approved`, `purchase_refused`, `refund`, `chargeback`, `subscription_renewed`, `subscription_renewal_refused`, `subscription_late`, `subscription_late_recovered`, `subscription_canceled`, `subscription_paused` e `subscription_resumed`.
4. Use o evento de teste da Cakto para conferir a assinatura e a entrega. O evento de teste usa dados fictícios e não comprova cadastro real. Depois confirme com um pagamento aprovado do produto institucional, sem utilizar dados pessoais de terceiros em testes.
5. Em **Afiliadas**, uma pessoa `ADMIN` pode clicar **Conciliar com Cakto**. O backend também consulta a API periodicamente, de acordo com `CAKTO_RECONCILE_INTERVAL_MINUTES` (padrão: 60). A consulta usa `GET /public_api/orders/` com filtros de produto e tipo de assinatura, percorre as páginas e grava pedidos pelo ID, sem duplicar pagamentos de webhooks. Verifique o resultado e as falhas na visão geral.

O endpoint verifica `X-Cakto-Timestamp` e `X-Cakto-Signature` contra o corpo bruto, rejeita entregas antigas e ignora produtos diferentes. Só um pedido principal pago, com CPF, telefone e ID de assinatura, cria uma afiliada automaticamente. Eventos repetidos atualizam o mesmo pedido. Falhas de entrega precisam ser examinadas no histórico da Cakto; a Cakto não tenta novamente após uma resposta de erro do backend.

## Painel

Em **Afiliadas**, a pessoa `ADMIN` cadastra uma afiliada anterior com nome, CPF e telefone. No detalhe, seleciona o mês e registra se o pagamento foi conferido, com valor, data e observação. O painel mostra a pessoa responsável e mantém auditoria da alteração. Um mês sem registro permanece sem conferência.

Pedidos recebidos por webhook aparecem como pagamentos Cakto. Uma afiliada já cadastrada manualmente pode receber uma assinatura Cakto posteriormente; o vínculo usa o CPF e conserva os lançamentos anteriores. CPF duplicado ou assinatura divergente exigem correção administrativa.

Os componentes Asaas existentes permanecem apenas para consulta de dados legados. Não são necessários para iniciar o backend em produção nesta etapa. A consulta GET Cakto pode recuperar pedidos pagos que não chegaram por webhook, se o pedido incluir CPF válido, telefone, identificador de assinatura e data do pagamento. A consulta de pedidos **não confirma por si só o estado atual da autorização do Pix Automático**; o status da assinatura continua dependente dos eventos de assinatura recebidos. Pedidos sem dados suficientes aparecem como falhas na conciliação e exigem conferência. Ainda é necessário validar o formato real dos pedidos e os escopos com a conta da Federação.

Referências: [guia oficial de webhooks](https://docs.cakto.com.br/conceitos/webhooks), [autenticação da API](https://docs.cakto.com.br/authentication) e [listagem de pedidos](https://docs.cakto.com.br/api-reference/orders/list) da Cakto.
