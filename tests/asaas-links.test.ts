import assert from 'node:assert/strict';
import test from 'node:test';
import { hostedAsaasLink, publicHttpsLink } from '../src/lib/asaas-links';

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
