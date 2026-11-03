# Integração do site, Asaas e Sistema 2

Comece por [visão geral](01-visao-geral.md), depois [execução local](02-execucao-local.md) e [configuração](03-configuracao-entre-sistemas.md). Para integrar outra implementação, leia [substituição do Sistema 2](05-substituir-sistema-2.md) antes de qualquer corte.

| Documento                                              | Uso                                                   |
| ------------------------------------------------------ | ----------------------------------------------------- |
| [01 — visão geral](01-visao-geral.md)                  | Quem é responsável por cada dado e por onde ele passa |
| [02 — execução local](02-execucao-local.md)            | Subir banco, API, painel e site do zero               |
| [03 — configuração](03-configuracao-entre-sistemas.md) | Variáveis, links e IDs externos                       |
| [04 — contratos](04-contratos-api-e-eventos.md)        | Rotas, permissões, eventos e erros                    |
| [05 — substituição](05-substituir-sistema-2.md)        | Trocar painel ou todo o administrativo                |
| [06 — teste ponta a ponta](06-teste-ponta-a-ponta.md)  | Roteiro e matriz de homologação                       |
| [07 — operação](07-operacao-e-problemas.md)            | Incidentes, reprocessamento e responsabilidades       |

O código entregue cria uma implementação própria do Sistema 2 para uso e referência. O trabalho futuro de outro integrante não foi incorporado. Nenhuma cobrança real, transferência, publicação ou ativação de produção integra esta entrega.

**Ponto externo pendente:** a documentação oficial do [Link de Pagamento](https://docs.asaas.com/docs/criando-um-link-de-pagamentos) apresenta `RECURRENT` com cartão no exemplo; [Assinaturas](https://docs.asaas.com/docs/assinaturas) admite Pix, mas isso não comprova a combinação `RECURRENT + PIX` no Link de Pagamento. Um teste no Sandbox da conta institucional deve demonstrar criação do link, coleta de dados, assinatura e cobrança Pix antes de definir `PUBLIC_ASAAS_AFFILIATION_URL`. O [Checkout recorrente](https://docs.asaas.com/docs/checkout-com-assinatura-recorrente) também documenta cartão. O link de doação avulsa `DETACHED + PIX` tem suporte no [Link de Pagamento](https://docs.asaas.com/docs/link-de-pagamentos), mas sua URL e ID reais também dependem da conta.
