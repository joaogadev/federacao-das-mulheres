const [amountText, method = 'PIX'] = process.argv.slice(2);
const amount = Number(amountText);

if (!/^\d+(?:\.\d{1,2})?$/.test(amountText || '') || !Number.isFinite(amount) || amount <= 0) {
  throw new Error('Informe o valor mensal em reais: npm run asaas:link:affiliation -- 35.00 [PIX|UNDEFINED]');
}
if (!['PIX', 'UNDEFINED'].includes(method)) {
  throw new Error('O meio de pagamento deve ser PIX ou UNDEFINED.');
}
if (!process.env.ASAAS_API_KEY) {
  throw new Error('Configure ASAAS_API_KEY em sistema-2/backend/.env.');
}
if (process.env.ASAAS_ENV !== 'sandbox' && !process.argv.includes('--confirm-production')) {
  throw new Error('Para criar um link real, configure ASAAS_ENV=production e acrescente --confirm-production.');
}

const base = process.env.ASAAS_ENV === 'sandbox'
  ? 'https://api-sandbox.asaas.com/v3'
  : 'https://api.asaas.com/v3';
const response = await fetch(`${base}/paymentLinks`, {
  method: 'POST',
  headers: {
    access_token: process.env.ASAAS_API_KEY,
    accept: 'application/json',
    'content-type': 'application/json',
    'User-Agent': 'FederacaoMulheres/0.1',
  },
  body: JSON.stringify({
    name: 'Filiação Federação das Mulheres',
    description: 'Contribuição mensal de filiação',
    value: amount,
    billingType: method,
    chargeType: 'RECURRENT',
    subscriptionCycle: 'MONTHLY',
    dueDateLimitDays: 10,
  }),
  signal: AbortSignal.timeout(15000),
});
const result = await response.json();
if (!response.ok) {
  throw new Error(`Asaas recusou o link (HTTP ${response.status}): ${JSON.stringify(result.errors || result)}`);
}
if (!result.id || !result.url) {
  throw new Error('Asaas respondeu sem ID ou URL; confira o link diretamente no painel Asaas.');
}
console.log(`ASAAS_AFFILIATION_LINK_ID=${result.id}`);
console.log(`PUBLIC_ASAAS_AFFILIATION_URL=${result.url}`);
console.log('Guarde o ID no backend e a URL pública no site institucional.');
