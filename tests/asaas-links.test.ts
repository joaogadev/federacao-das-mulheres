import assert from 'node:assert/strict';
import test from 'node:test';
import {
  donationPaymentLink,
  hostedAsaasLink,
  publicHttpsLink,
} from '../src/lib/asaas-links';

test('somente URLs HTTPS do Asaas ativam o CTA', () => {
  assert.equal(
    hostedAsaasLink('https://www.asaas.com/c/abc'),
    'https://www.asaas.com/c/abc',
  );
  assert.equal(
    hostedAsaasLink('https://sandbox.asaas.com/c/abc'),
    'https://sandbox.asaas.com/c/abc',
  );
  for (const bad of [
    'javascript:alert(1)',
    'http://www.asaas.com/c/x',
    'https://asaas.com.evil.test/c/x',
    'https://user:pass@asaas.com/c/x',
    'https://asaas.com/',
    '',
  ])
    assert.equal(hostedAsaasLink(bad), null);
  assert.equal(publicHttpsLink('http://exemplo.test/termos'), null);
});

test('doação prioriza o link Asaas publicado e usa o valor de build como fallback', () => {
  assert.equal(
    donationPaymentLink(
      'https://www.asaas.com/c/publicado',
      'https://www.asaas.com/c/build',
    ),
    'https://www.asaas.com/c/publicado',
  );
  assert.equal(
    donationPaymentLink(
      'https://example.org/doacao',
      'https://www.asaas.com/c/build',
    ),
    'https://www.asaas.com/c/build',
  );
});
