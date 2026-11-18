# 09 — Integração Hotmart

## Elegibilidade comercial ainda pendente

A documentação pública consultada não confirma que uma contribuição obrigatória de filiação associativa possa ser cadastrada como produto de assinatura na Hotmart. Os termos deixam a comercialização e a conformidade do produto sob responsabilidade do criador e reservam à Hotmart a análise, suspensão e remoção de produtos. Isso não equivale a aprovação para cobrar mensalidades associativas. A Federação deve obter confirmação escrita da Hotmart antes de habilitar checkout ou anunciar essa cobrança.

O PIX Automático está documentado pela Hotmart para produtos de Assinatura e Combos. A documentação não declara que uma filiação associativa é elegível a essas categorias. Não ativar PIX Automático com base apenas na existência dessa forma de pagamento.

## O que foi preparado

- `POST /webhooks/hotmart` recebe eventos de compra v2 e cancelamento de assinatura. Valida `X-HOTMART-HOTTOK`, limita o processamento ao produto configurado e persiste o evento antes de responder.
- Eventos repetidos usam `hotmart:<id>` como chave única. Um worker independente processa a fila; o worker Asaas ignora os eventos Hotmart.
- O evento persistido omite nome, e-mail, telefone e documento do comprador; mantém apenas identificadores externos e os campos necessários à conciliação.
- A compra só é vinculada a uma filiação quando `purchase.origin.sck` contém o token assinado gerado pelo backend. E-mail não é usado como chave de associação.
- Transações Hotmart usam identificador externo único, moeda, método, status e datas, preservando as tabelas atuais do Asaas por migração aditiva.
- `POST /memberships/:id/hotmart-checkout` gera um checkout vinculado, mas exige sessão ADMIN e CSRF. A opção está desabilitada por padrão e exige `HOTMART_MEMBERSHIP_APPROVED=true`.

## Ainda necessário antes de produção

1. Obter aprovação escrita da Hotmart para cobrança de filiação associativa e recorrência.
2. Criar e validar uma assinatura elegível na conta da Federação, com checkout PIX e, se aprovada, PIX Automático.
3. Construir o fluxo público de cadastro/filiação e documentos para que a própria afiliada solicite o checkout. O projeto atual não tem login de afiliada nem rota pública de cadastro; por segurança o endpoint de checkout implementado exige ADMIN.
4. Definir se o produto inclui um benefício digital real e como ele será entregue; não classificar artificialmente a associação como curso ou conteúdo digital.
5. Homologar webhooks de aprovação, atraso, cancelamento, reembolso e contestação com eventos oficiais de teste.
6. Implementar consulta/reconciliação via API de transações/subscrições. Este primeiro corte não chama API Hotmart nem implementa geração OAuth; não foi necessário inventar endpoints, e a fila webhook é a fonte de sincronização atual.
7. Confirmar política de privacidade/termos e rotina administrativa para aprovação da filiação. Pagamento aprovado não muda `Membership.status` para APROVADA.

## Configuração

As variáveis ficam em `sistema-2/backend/.env` (não versionado): `HOTMART_MEMBERSHIP_APPROVED=false`, `HOTMART_WEBHOOK_TOKEN`, `HOTMART_CHECKOUT_URL`, `HOTMART_PRODUCT_ID` e `HOTMART_LINK_SECRET` (segredo aleatório com pelo menos 32 caracteres). O endereço deve ser HTTPS e pertencer aos hosts oficiais de checkout Hotmart aceitos pela validação. Não preencher as variáveis de produção nem habilitar o checkout até a confirmação comercial.

Para testar a conexão OAuth manualmente, configure também `HOTMART_CLIENT_ID`, `HOTMART_CLIENT_SECRET` e `HOTMART_BASIC_TOKEN` no `.env` e rode `npm run test:hotmart-connection` dentro de `sistema-2/backend`. O teste confirma primeiro DNS/TLS e resposta do endpoint oficial; com as três credenciais, também solicita token e valida a resposta sem imprimir credenciais ou token. A suíte `npm test` não faz chamadas de rede.

Cadastre na Hotmart a URL pública `https://<host-da-api>/webhooks/hotmart`, selecione a versão 2.0.0 e os eventos de pedido aprovados/cancelados/atrasados/reembolsados/contestados e cancelamento de assinatura. A credencial da configuração deve coincidir com `HOTMART_WEBHOOK_TOKEN`.

## Fontes oficiais

- [Webhook de eventos de pedido v2.0.0](https://developers.hotmart.com/docs/pt-BR/2.0.0/webhook/purchase-webhook/)
- [Webhook de cancelamento de assinatura v2.0.0](https://developers.hotmart.com/docs/pt-BR/2.0.0/webhook/cancel-subscription-webhook/)
- [Autenticação OAuth da API](https://developers.hotmart.com/docs/pt-BR/start/app-auth/)
- [PIX Automático na Hotmart](https://help.hotmart.com/pt-br/article/37394091344909/como-comprar-um-produto-pela-hotmart-com-o-pix-automatico-/)
- [Termos de uso da Hotmart](https://hotmart.com/pt-br/legal/termos-de-uso)
