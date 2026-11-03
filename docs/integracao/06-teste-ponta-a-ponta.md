# 06 — Teste ponta a ponta

## Local

1. Siga [execução local](02-execucao-local.md). Espere `GET /health/ready` responder 200.
2. Abra `http://localhost:5173`, entre com o administrador criado e confirme visão geral vazia. `CONSULTA` deve conseguir abrir consultas e receber 403 em `POST /memberships/:id/decision`, `/events/:id/retry` e `/sync/reconcile`.
3. Sem `ASAAS_API_KEY`, defina dois IDs fictícios distintos de links em `sistema-2/backend/.env` e um `ASAAS_WEBHOOK_TOKEN` local de 32+ caracteres; reinicie a API. Envie a fixture de `requests.http` com o mesmo token. Espere HTTP 200 e um registro de doação no painel. Reenvie o mesmo `id`: a contagem não muda. Token errado retorna 401.
4. Gere `npm run build:demo` no site e `node scripts/verify-build.mjs`. Sem URLs públicas, as páginas de filiação e doação mostram indisponibilidade e o resto do conteúdo continua estático com a API desligada. Com URLs HTTPS de Sandbox configuradas, gere novo build e confira CTAs, foco por teclado e largura de 375 px/desktop.
5. Altere `VITE_API_URL` do painel para uma API equivalente de teste e confirme login/consultas. Volte ao valor anterior. O Sistema 1 não muda. Se trocar só backend, atualize o webhook no Asaas durante uma janela controlada e reconcilie o intervalo conforme [substituição](05-substituir-sistema-2.md).

Fixtures locais comprovam apenas o processamento local dos contratos. Elas não atestam uma resposta real do Asaas. Não use links de produção nem operações financeiras reais neste roteiro de desenvolvimento.

### Resultado local observado nesta entrega

O endpoint do webhook respondeu HTTP 200 após persistir uma fixture em teste HTTP local.

Em PostgreSQL 18 isolado, a migração inicial e o segundo `db:migrate` passaram. Com a API NestJS rodando, uma fixture `PAYMENT_RECEIVED` do link de doação criou uma doação de 2500 centavos e nenhuma filiação. Reentregar o mesmo ID deixou a contagem em uma doação; token incorreto retornou 401. Uma conta CONSULTA leu doações, recebeu 403 ao chamar diretamente a rota de conciliação, fez logout e passou a receber 401. Uma fixture de filiação criou uma assinatura e uma filiação PENDENTE; uma decisão ADMIN aprovou institucionalmente. Um segundo ciclo sem `paymentLink` foi ligado à mesma assinatura e ficou OVERDUE. O primeiro ciclo passou a REFUNDED e não regrediu após um evento antigo PENDING. Uma origem desconhecida permaneceu UNRESOLVED; após reiniciar a API com o ID dessa origem e reprocessar como ADMIN, apareceu como segunda doação. Esses valores e IDs são exclusivamente fixtures locais.

A automação visual do navegador foi interrompida porque a ferramenta não conseguiu determinar com segurança a URL ativa no Windows. O CSS inclui a faixa móvel de até 700 px e as páginas passaram no build estático, mas a inspeção visual em 375 px e desktop permanece pendente.

## Sandbox Asaas

1. Na conta Sandbox institucional, crie um Link de Pagamento `RECURRENT`, `subscriptionCycle=MONTHLY`, meio Pix e valor **aprovado**, com coleta de nome, documento, e-mail e telefone. Verifique se o produto aceita a combinação; registre ID e URL retornados. Se recusar, preserve o CTA de filiação indisponível e registre resposta/código sem chave. Não migre silenciosamente para Checkout recorrente em cartão.
2. Crie outro link `DETACHED` com Pix para doação. Confirme se o valor livre foi configurado e aparece na página antes de anunciá-lo no site.
3. Configure no Asaas o webhook HTTPS final `POST /webhooks/asaas`, com `authToken` separado da API key e somente os eventos de [contrato](04-contratos-api-e-eventos.md) necessários. Configure um e-mail institucional de alertas. O token tem 32–255 caracteres sem espaço.
4. Configure IDs dos dois links no backend e as URLs públicas no build do Astro. Execute uma filiação e um pagamento Pix simulado. Confirme nos Webhook Logs HTTP 200, entrada persistida, pessoa, filiação `PENDENTE`, assinatura e cobrança no painel. Confirme que pagamento não aprova a filiação.
5. Simule uma doação Pix. Confirme uma `Donation` e nenhuma `Membership` nova. Teste reenvio, evento antigo, vencimento, estorno e ciclo seguinte. O ciclo seguinte deve estar sob a mesma assinatura e não ser criado pelo backend.
6. Execute `POST /sync/reconcile` como ADMIN. Confirme recuperação de cobranças anteriores dos links conhecidos e eventos `UNRESOLVED`, sem importar finalidades estranhas.

| Camada                                     | Estado nesta entrega                                                          |
| ------------------------------------------ | ----------------------------------------------------------------------------- |
| Código local Astro/API/painel              | Typecheck, builds e testes locais executados; site gerou 21 páginas estáticas |
| PostgreSQL vazio + migração                | Validado em PostgreSQL 18 isolado; Compose com imagem 16 ainda não executado  |
| Sandbox real (links, Pix, webhook, ciclos) | Pendente de credenciais e acesso à conta                                      |
| Produção e repasse Cora                    | Pendente de aceite institucional e homologação externa; não executar aqui     |

Um HTTP 200 de criação de link, o redirecionamento de retorno e uma fixture local não comprovam pagamento. Homologação exige observar evento, consulta à API Asaas, persistência e painel, inclusive o ciclo seguinte.
