# 05 — Substituir o Sistema 2

Esta implementação foi criada neste repositório. Outro integrante pode entregar a própria implementação depois. O site institucional não exige o código interno daqui, pois seu contrato financeiro é o redirecionamento ao Asaas. Antes de trocar qualquer componente, inventarie os IDs externos, faça backup do PostgreSQL e ensaie no Sandbox. A Federação deve entregar chaves e tokens ao responsável técnico por cofre de segredos ou canal seguro institucional, nunca por commit, README ou mensagem pública.

## Opção A — trocar só o painel

Mantenha o NestJS, PostgreSQL e webhook. O novo painel precisa consumir as rotas do [contrato](04-contratos-api-e-eventos.md), guardar o cookie de sessão só no navegador, chamar `GET /auth/me` ao recarregar, enviar `X-CSRF-Token` nas mutações e respeitar ADMIN/CONSULTA. Defina `FRONTEND_ORIGIN` no backend para a URL exata do painel dele. Se frontend e API estiverem em sites diferentes, use HTTPS, `COOKIE_SECURE=true` e `COOKIE_SAME_SITE=none`; confirme CORS com credenciais no navegador. O site Astro e os links Asaas permanecem como estão.

## Opção B — trocar todo o Sistema 2

O backend dele precisa receber o webhook Asaas com token separado da API key; persistir eventos antes do HTTP 200; deduplicar por `id`; classificar cobranças por `paymentLink` e assinaturas por `subscription` conhecido; reconciliar dados anteriores; separar decisão institucional de pagamento; preservar IDs e histórico. Se o painel React desta entrega for reutilizado, implemente as rotas e formatos da tabela acima. Se ambos forem substituídos, os DTOs internos podem ser diferentes. Nenhuma API adicional no Astro é necessária.

| Componente atual                       | Equivalente do colega         | Configuração a alterar                         | Verificação                                |
| -------------------------------------- | ----------------------------- | ---------------------------------------------- | ------------------------------------------ |
| `sistema-2/frontend`                   | painel próprio                | `FRONTEND_ORIGIN` e URL de acesso ao painel    | login, cookie, CSRF, CONSULTA 403          |
| `sistema-2/backend`                    | API própria                   | URL do webhook no Asaas; URL da API no painel  | evento persistido e consulta autenticada   |
| `sistema-2/backend/.env` IDs dos links | tabela de origens dele        | copiar IDs de filiação e doação separadamente  | cobrança de cada finalidade classificada   |
| `sistema-2/backend/.env` chave/token   | cofre institucional dele      | configurar Sandbox/produção e token do webhook | 401 para token errado; GET Asaas           |
| PostgreSQL                             | banco compatível ou importado | migração planejada                             | contagens, totais, IDs, decisões e eventos |
| Site Astro                             | mesmo site                    | nenhuma alteração se links Asaas não mudarem   | build estático e CTAs corretos             |

Os IDs de clientes, assinaturas, cobranças, links e eventos processados são dados de migração, não objetos a recriar. Não crie assinatura nova nem cobrança durante o corte. Preserve decisões, histórico e estados da caixa de entrada. Com dados reais, faça `pg_dump` em armazenamento protegido, ensaie importação ou reutilização compatível do banco, compare contagens, somas em centavos e amostras de IDs; restrinja acesso ao backup e registre quem o recebeu. Não há migração real feita nesta tarefa.

## Corte do webhook

1. No Sandbox, instale a API nova e valide seu endpoint final HTTPS, token e persistência com eventos de teste. Registre o instante e o último ID visto na API anterior.
2. Faça backup do banco e congele decisões administrativas no sistema anterior. Mantenha a API anterior operacional e os dados preservados.
3. Configure a URL do webhook no Asaas para o endpoint novo. O Asaas não segue redirecionamentos e pode repetir eventos. Não deixe dois processadores produzirem efeitos financeiros ou decisões sem deduplicação compartilhada; durante a transição, use um receptor ativo por configuração e mantenha a fila anterior para consulta.
4. Consulte os Webhook Logs do Asaas. Reconcile no novo backend os pagamentos dos links conhecidos e assinaturas vinculadas durante o intervalo da troca. Compare IDs, contagens e totais; verifique filiação e doação no painel.
5. Se falhar, restaure a URL antiga, observe os reenvios e concilie o intervalo no backend antigo. Preserve os eventos recebidos pela API nova para auditoria e deduplicação. Não apague ou desative o sistema antigo antes da validação e do backup.

O Asaas [repete entregas e pode interromper a fila após falhas consecutivas](https://docs.asaas.com/docs/webhooks-faq); por isso trocar só uma URL não basta. O Sistema 1 só exige rebuild se as URLs públicas dos links ou documentos mudarem. A URL da API usada pelo painel fica em `VITE_API_URL`; não há chamada do site institucional à API administrativa. A URL do painel, se divulgada futuramente, é apenas navegação.
