import assert from 'node:assert/strict';
import test from 'node:test';

const authUrl = new URL('https://api-sec-vlc.hotmart.com/security/oauth/token');
const enabled = process.env.HOTMART_CONNECTION_TESTS === 'true';
const credentials = {
  clientId: process.env.HOTMART_CLIENT_ID,
  clientSecret: process.env.HOTMART_CLIENT_SECRET,
  basicToken: process.env.HOTMART_BASIC_TOKEN,
};
const hasAllCredentials = Object.values(credentials).every(Boolean);
const hasSomeCredentials = Object.values(credentials).some(Boolean);

test('endpoint oficial OAuth da Hotmart responde por HTTPS', { skip: !enabled }, async () => {
  const url = new URL(authUrl);
  url.searchParams.set('grant_type', 'client_credentials');
  const response = await fetch(url, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: '{}',
    redirect: 'error',
    signal: AbortSignal.timeout(12000),
  });

  console.log(`[Hotmart] Host OAuth acessível por HTTPS; resposta HTTP ${response.status}.`);
  assert.ok(
    response.status >= 400 && response.status < 500,
    `Esperava resposta de autenticação 4xx sem credenciais; recebi HTTP ${response.status}.`,
  );
});

test('credenciais configuradas obtêm token OAuth sem exibir o segredo', {
  skip: !enabled || (!hasAllCredentials && !hasSomeCredentials),
}, async () => {
  assert.ok(hasAllCredentials, 'Configure HOTMART_CLIENT_ID, HOTMART_CLIENT_SECRET e HOTMART_BASIC_TOKEN.');
  const url = new URL(authUrl);
  url.searchParams.set('grant_type', 'client_credentials');
  url.searchParams.set('client_id', credentials.clientId);
  url.searchParams.set('client_secret', credentials.clientSecret);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Basic ${credentials.basicToken}`,
    },
    body: '{}',
    redirect: 'error',
    signal: AbortSignal.timeout(12000),
  });
  assert.equal(response.status, 200, `Hotmart OAuth respondeu HTTP ${response.status}.`);

  const result = await response.json();
  assert.equal(typeof result.access_token, 'string');
  assert.ok(result.access_token.length > 0);
  assert.ok(Number.isFinite(result.expires_in) && result.expires_in > 0);
  console.log(`[Hotmart] OAuth autenticado; token válido por ${result.expires_in} segundos (token omitido).`);
});
