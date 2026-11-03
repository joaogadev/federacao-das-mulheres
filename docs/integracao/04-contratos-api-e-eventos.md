# 04 — Contratos da API e eventos

Base local: `http://localhost:3001`. Todos os corpos são JSON. Datas retornam ISO 8601 UTC; vencimentos do Asaas, que são datas civis, são gravados ao meio-dia UTC e exibidos em `America/Fortaleza`. Valores `*Cents` são inteiros em centavos, sem ponto flutuante no banco. Paginação usa `page` a partir de 1 e `limit` até 100. Erros NestJS têm `statusCode`, `message` e `error`; `401` indica falta/expiração de sessão, `403` indica permissão ou CSRF inválido, `400` indica entrada inválida, `503` indisponibilidade da integração. Credenciais nunca aparecem nas respostas.

| Método e rota                       | Autenticação/permissão       | Resultado                                                                        |
| ----------------------------------- | ---------------------------- | -------------------------------------------------------------------------------- |
| `GET /health/live`, `/health/ready` | pública                      | processo/banco `{"status":"ok"}`                                                 |
| `POST /auth/login`                  | pública; `email`, `password` | cookie `admin_session` HttpOnly; `user`, `csrfToken`                             |
| `GET /auth/me`                      | sessão                       | `user`, novo `csrfToken`                                                         |
| `POST /auth/logout`                 | sessão + `X-CSRF-Token`      | invalida sessão                                                                  |
| `GET /memberships`                  | ADMIN ou CONSULTA            | `items`, `total`, `page`, `limit`; filtros `search`, `status`, `financial`       |
| `GET /memberships/:id`              | ADMIN ou CONSULTA            | pessoa, assinatura, cobranças e histórico                                        |
| `POST /memberships/:id/decision`    | ADMIN + CSRF                 | `status` = APROVADA/REPROVADA; `reason` obrigatório                              |
| `GET /donations`                    | ADMIN ou CONSULTA            | lista paginada; filtros `search`, `financial`; `receivedTotalCents`              |
| `GET /reports/summary`              | ADMIN ou CONSULTA            | totais recebidos separados, vencidas e última conciliação                        |
| `GET /events`                       | ADMIN ou CONSULTA            | até 100 eventos FAILED/UNRESOLVED, sem payload pessoal                           |
| `POST /events/:id/retry`            | ADMIN + CSRF                 | agenda nova tentativa                                                            |
| `POST /sync/reconcile`              | ADMIN + CSRF                 | consulta paginada Asaas; `count` vinculados                                      |
| `POST /webhooks/asaas`              | `asaas-access-token`         | `200 {"received":true}` após persistência; duplicata retorna 200 sem novo evento |

Exemplo fictício de decisão:

```http
POST /memberships/00000000-0000-4000-8000-000000000001/decision
Cookie: admin_session=<cookie obtido no login>
X-CSRF-Token: <csrfToken do login ou /auth/me>
Content-Type: application/json

{"status":"APROVADA","reason":"Decisão registrada pela equipe"}
```

`CONSULTA` recebe 403 nessa rota, mesmo que envie a requisição diretamente. `MembershipStatus` é `PENDENTE`, `APROVADA` ou `REPROVADA`; os estados financeiros são os retornados pelo Asaas (`PENDING`, `OVERDUE`, `CONFIRMED`, `RECEIVED`, `REFUNDED`, `PARTIALLY_REFUNDED` etc.). Uma doação é identificada pelo link de origem `DONATION` e recebe uma linha `Donation`; não cria `Membership`. Cobranças `CONFIRMED` não são somadas como dinheiro recebido. Somente `RECEIVED` entra nos totais apresentados. Taxas e valor líquido são armazenados somente quando `netValue` estiver disponível, sem estimar saldo ou repasse.

O corpo externo do webhook **não é** DTO interno da API. O Asaas envia `id`, `event` e `payment` ou `subscription`. Uma fixture fictícia mínima:

```json
{
  "id": "evt_fixture_001",
  "event": "PAYMENT_RECEIVED",
  "payment": {
    "id": "pay_fixture_001",
    "customer": "cus_fixture_001",
    "paymentLink": "link_fixture_doacao",
    "value": 25,
    "billingType": "PIX",
    "status": "RECEIVED",
    "dueDate": "2026-10-30"
  }
}
```

Em ambiente com `ASAAS_API_KEY`, o processador consulta a cobrança atual por ID; a fixture acima não corresponde ao provedor e não funcionará como homologação. Sem chave, a fixture é processada localmente usando o payload, desde que `ASAAS_DONATION_LINK_ID=link_fixture_doacao`. No fluxo real, o processador consulta cliente e assinatura quando necessários. Eventos de pagamento aceitos: `PAYMENT_CREATED`, `PAYMENT_UPDATED`, `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`, `PAYMENT_DELETED`, `PAYMENT_REFUNDED`, `PAYMENT_PARTIALLY_REFUNDED`, `PAYMENT_REFUND_IN_PROGRESS` e `PAYMENT_CHARGEBACK_REQUESTED`. Eventos de assinatura aceitos: `SUBSCRIPTION_CREATED`, `SUBSCRIPTION_UPDATED`, `SUBSCRIPTION_INACTIVATED`, `SUBSCRIPTION_DELETED`. Se o vínculo da assinatura ainda não é conhecido, seu evento fica `UNRESOLVED`; a primeira cobrança com `paymentLink` registra o vínculo e a conciliação pode retomá-lo. Eventos não configurados recebem 400. A referência dos nomes e campos é [cobranças](https://docs.asaas.com/docs/webhook-para-cobrancas), [assinaturas](https://docs.asaas.com/docs/eventos-para-assinaturas) e [origem de receitas](https://docs.asaas.com/docs/como-o-asaas-trata-receitas-na-conta).

O [Asaas exige HTTP 200](https://docs.asaas.com/docs/webhooks-faq) para confirmar entrega. Uma falha no PostgreSQL antes do commit produz erro HTTP e o Asaas tenta novamente. IDs de eventos têm restrição única, inclusive sob concorrência. Eventos são retomados após reinício, com tentativa limitada e estado `FAILED`; `UNRESOLVED` exige conciliação. A leitura da API Asaas usa apenas GET, timeout e espera progressiva em falhas temporárias. Este backend não cria automaticamente cliente, assinatura, cobrança ou link, e portanto não duplica operações financeiras por timeout.

O contrato OpenAPI exportado em `sistema-2/backend/openapi.json` é gerado após `npm --prefix sistema-2/backend run build` por `npm --prefix sistema-2/backend run openapi:export`. Em desenvolvimento, a interface está em `/api-docs`; ela é desativada em `NODE_ENV=production`. Os exemplos executáveis estão em `sistema-2/backend/requests.http`.
