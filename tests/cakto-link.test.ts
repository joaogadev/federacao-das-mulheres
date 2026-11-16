import assert from 'node:assert/strict';
import test from 'node:test';
import { hostedCaktoCheckout } from '../src/lib/cakto-link';

test('o checkout público aceita somente a origem oficial da Cakto', () => {
  const checkout = 'https://pay.cakto.com.br/exemplo_123';
  assert.equal(hostedCaktoCheckout(checkout), checkout);
  for (const invalid of [
    'http://pay.cakto.com.br/exemplo_123',
    'https://pay.cakto.com.br.evil.test/exemplo_123',
    'https://user:pass@pay.cakto.com.br/exemplo_123',
    'https://app.cakto.com.br/exemplo_123',
    'https://pay.cakto.com.br/',
    'javascript:alert(1)',
    '',
  ]) {
    assert.equal(hostedCaktoCheckout(invalid), null);
  }
});
