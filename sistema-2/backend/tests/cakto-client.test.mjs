import assert from 'node:assert/strict';
import test from 'node:test';

process.env.DATABASE_URL ||= 'postgresql://user:pass@localhost:5432/test';
process.env.FRONTEND_ORIGIN ||= 'http://localhost:5173';
process.env.CAKTO_CLIENT_ID = 'client-fixture';
process.env.CAKTO_CLIENT_SECRET = 'secret-fixture';

const { CaktoClient } = await import('../src/cakto.client.ts');

test('GET usa token em cache, filtro do produto e páginas da API oficial', async () => {
  const original = globalThis.fetch;
  const calls=[];
  globalThis.fetch=async (url,options) => {
    calls.push({url:String(url),options});
    if (String(url).endsWith('/token/')) return {ok:true,json:async()=>({access_token:'token-fixture',expires_in:3600})};
    if (calls.length===2) return {ok:true,json:async()=>({results:[{id:'one'}],next:'http://api.cakto.com.br/public_api/orders/?page=2'})};
    return {ok:true,json:async()=>({results:[{id:'two'}],next:null})};
  };
  try {
    const orders=[];
    for await (const item of new CaktoClient().orders('product-fixture')) orders.push(item);
    assert.deepEqual(orders,[{id:'one'},{id:'two'}]);
    assert.equal(calls.length,3);
    assert.equal(new URL(calls[1].url).searchParams.get('product'),'product-fixture');
    assert.equal(new URL(calls[1].url).searchParams.get('type'),'subscription');
    assert.equal(calls[2].url,'https://api.cakto.com.br/public_api/orders/?page=2');
    assert.equal(calls[1].options.headers.Authorization,'Bearer token-fixture');
  } finally { globalThis.fetch=original; }
});

test('GET rejeita próxima página em outro domínio', async () => {
  const original = globalThis.fetch;
  globalThis.fetch=async (url) => String(url).endsWith('/token/')
    ? {ok:true,json:async()=>({access_token:'token-fixture',expires_in:3600})}
    : {ok:true,json:async()=>({results:[],next:'https://example.org/steal'})};
  try {
    await assert.rejects(async()=>{
      for await (const item of new CaktoClient().orders('product-fixture')) void item;
    },/Próxima página Cakto fora da API/);
  } finally { globalThis.fetch=original; }
});
