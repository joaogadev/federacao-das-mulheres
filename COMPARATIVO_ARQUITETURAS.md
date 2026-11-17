# Comparativo das arquiteturas

Este documento compara a arquitetura existente com a proposta. **Somente a página de filiação foi adaptada para um piloto local Cakto; a simplificação integral ainda depende de homologação.** Consulte [VIABILIDADE_PIX_AUTOMATICO.md](VIABILIDADE_PIX_AUTOMATICO.md).

| Aspecto | Original: Sistema 1 + Sistema 2 + Asaas | Proposta: site + plataforma gerenciada |
| --- | --- | --- |
| Componentes | Astro, Sanity, Cloudflare Pages, NestJS, PostgreSQL, React, Asaas, webhooks. | Astro, Sanity, Cloudflare Pages, checkout e painel SaaS; Pix estático para doação. |
| Filiação | Link Asaas + conciliação no backend; decisão institucional no painel próprio. Pix recorrente atual exige ação da pagadora a cada mês. | Candidata se cadastra e autoriza Pix Automático no fornecedor; este mantém os estados e ciclos. Ainda não comprovado para a entidade. |
| Custos | Hospedagem e operação de backend/banco/painel, além das taxas Asaas; valores reais do projeto não levantados. | Potencial redução de infraestrutura própria. A [tabela pública Cakto](https://www.cakto.com.br/taxas) informa sem mensalidade e Pix a R$ 2,49 por venda aprovada; confirmar aplicação ao Pix Automático e eventual repasse ao comprador. |
| Manutenção | Atualizações de três aplicações, banco, migrações, segurança de API e webhooks. | Site estático e CMS mantidos; fornecedor mantém cobrança e painel. Exige revisão periódica de contrato, elegibilidade e exportações. |
| Segurança e LGPD | A Federação opera banco com CPF, contato e estados financeiros; precisa controlar acesso, backups e retenção. | Dados cadastrais/financeiros no SaaS; precisa avaliar contrato, papéis LGPD, acesso de equipe, retenção e exportação. Site não coleta dados financeiros. |
| Automação | Cobranças podem ser geradas automaticamente, mas Pix comum não debita sem ação mensal; conciliação via Sistema 2. | Débito após autorização única e tratamento de falhas pelo fornecedor, se o produto de filiação for homologado. |
| Autonomia da Federação | Painel próprio, porém dependência técnica para operar e reparar integração. | Painel gerenciado e conta institucional, com menor operação técnica; depende das funções reais de exportação e exceções. |
| Dependência de fornecedor | Asaas + hospedeiro de backend/banco, mas regras de negócio próprias. | Concentração maior no SaaS de filiação; risco de preço, elegibilidade, política de produto e migração de dados. |
| Escala | Infraestrutura própria pode crescer, com custo de manutenção e observabilidade. | Escala operacional delegada ao SaaS, sujeita a limites e tarifas contratuais. |

Não há economia quantificada sem volume mensal, valor da mensalidade, contrato e custos atuais de hospedagem. A opção gerenciada só satisfaz o objetivo se os dez requisitos forem demonstrados de ponta a ponta, inclusive primeiro pagamento e autorização recorrente como estados distintos.

