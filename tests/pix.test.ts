import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePixCode } from '../src/lib/pix';

// UUID nil and a test name: structurally valid but not a payable Pix destination.
const fixture =
  '00020101021126580014br.gov.bcb.pix013600000000-0000-0000-0000-00000000000052040000530398654045.005802BR5905TESTE6007ARACAJU62070503***63047030';

test('Pix estático exige estrutura, valor e CRC válidos', () => {
  const parsed = parsePixCode(fixture);
  assert.equal(parsed?.amount, 5);
  assert.equal(parsed?.recipient, 'TESTE');
  assert.equal(parsed?.city, 'ARACAJU');
  assert.equal(parsePixCode(fixture.replace('54045.00', '54046.00')), null);
  assert.equal(parsePixCode(fixture.replace('63047030', '63040000')), null);
  assert.equal(parsePixCode(fixture.replace('010211', '010212')), null);
});
