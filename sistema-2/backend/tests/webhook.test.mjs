import assert from 'node:assert/strict';
import test from 'node:test';

process.env.DATABASE_URL ||= 'postgresql://user:pass@localhost:5432/test';
process.env.FRONTEND_ORIGIN ||= 'http://localhost:5173';
process.env.ASAAS_WEBHOOK_TOKEN = 'fixture-token-32-characters-long-123';

const { AsaasService } = await import('../src/asaas.service.ts');
const { newerPaymentStatus } = await import('../src/payment-state.ts');
const { AuthService } = await import('../src/auth.ts');
const token=process.env.ASAAS_WEBHOOK_TOKEN;
const fixture={id:'evt_001',event:'PAYMENT_RECEIVED',payment:{id:'pay_001'}};

test('webhook rejeita token incorreto e corpo inválido antes de gravar',async()=>{
  let writes=0;
  const db={inboxEvent:{upsert:async()=>{writes++}}};
  const service=new AsaasService(db,{});
  await assert.rejects(service.receive('invalid',fixture),{status:401});
  await assert.rejects(service.receive(token,{id:'evt_bad',event:'PAYMENT_RECEIVED'}),{status:400});
  assert.equal(writes,0);
});

test('reentrega simultânea usa mesmo ID e uma só entrada',async()=>{
  const ids=new Set();
  const db={inboxEvent:{upsert:async({where})=>{ids.add(where.id)}}};
  const service=new AsaasService(db,{});
  const results=await Promise.all([service.receive(token,fixture),service.receive(token,fixture)]);
  assert.equal(results.length,2);
  assert.equal(ids.size,1);
});

test('falha de persistência impede confirmação',async()=>{
  const db={inboxEvent:{upsert:async()=>{throw new Error('database unavailable')}}};
  const service=new AsaasService(db,{});
  await assert.rejects(service.receive(token,fixture),/database unavailable/);
});

test('evento antigo não devolve cobrança recebida ou estornada para pendente',()=>{
  assert.equal(newerPaymentStatus('RECEIVED','PENDING'),'RECEIVED');
  assert.equal(newerPaymentStatus('RECEIVED','OVERDUE'),'RECEIVED');
  assert.equal(newerPaymentStatus('RECEIVED','REFUNDED'),'REFUNDED');
  assert.equal(newerPaymentStatus('REFUNDED','RECEIVED'),'REFUNDED');
});

test('CONSULTA não pode decidir diretamente pela API e CSRF é exigido',async()=>{
  const db={adminSession:{findUnique:async()=>({id:'session',userId:'user',user:{id:'user',role:'CONSULTA'},expiresAt:new Date(Date.now()+60000),revokedAt:null,csrfToken:'csrf-token-32-characters-long-123'})}};
  const auth=new AuthService(db);
  const req={cookies:{admin_session:'session-token-32-characters-long-123'},header:()=>undefined};
  await assert.rejects(auth.require(req,'ADMIN'),{status:403});
  await assert.rejects(auth.require(req,undefined,true),{status:403});
});

test('sessão vencida é recusada',async()=>{
  const db={adminSession:{findUnique:async()=>({user:{role:'ADMIN'},expiresAt:new Date(Date.now()-1000),revokedAt:null})}};
  const auth=new AuthService(db);
  await assert.rejects(auth.session({cookies:{admin_session:'session-token-32-characters-long-123'}}),{status:401});
});
