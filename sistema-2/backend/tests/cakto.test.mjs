import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';

process.env.DATABASE_URL ||= 'postgresql://user:pass@localhost:5432/test';
process.env.FRONTEND_ORIGIN ||= 'http://localhost:5173';
process.env.CAKTO_WEBHOOK_SECRET = 'cakto-fixture-secret-with-more-than-32-characters';
process.env.CAKTO_PRODUCT_ID = 'product-fixture';

const { CaktoService, validCaktoSignature } = await import('../src/cakto.service.ts');
const { validCpf } = await import('../src/cpf.ts');
const secret = process.env.CAKTO_WEBHOOK_SECRET;
const timestamp = String(Math.floor(Date.now() / 1000));
const body = {event:'purchase_approved',data:{id:'order-1',status:'paid',offer_type:'main',amount:30,customer:{id:1,name:'Maria',phone:'79999999999',docNumber:'12345678909'},product:{id:'product-fixture'},subscription:{id:'subscription-1'},paidAt:new Date().toISOString()}};
const raw = Buffer.from(JSON.stringify(body));
const signature = `v1=${createHmac('sha256', secret).update(`${timestamp}.`).update(raw).digest('hex')}`;

test('assinatura depende do corpo cru e de timestamp recente', () => {
  assert.equal(validCaktoSignature(raw,timestamp,signature,secret),true);
  assert.equal(validCaktoSignature(Buffer.from(raw.toString()+' '),timestamp,signature,secret),false);
  assert.equal(validCaktoSignature(raw,String(Number(timestamp)-301),signature,secret),false);
});

test('CPF do cadastro manual e do checkout exige dígitos verificadores válidos', () => {
  assert.equal(validCpf('123.456.789-09'), true);
  assert.equal(validCpf('123.456.789-00'), false);
  assert.equal(validCpf('111.111.111-11'), false);
});

test('evento inválido ou sem assinatura não grava afiliada', async () => {
  let writes=0;
  const service=new CaktoService({$transaction:async()=>{writes++}});
  await assert.rejects(service.receive(raw,timestamp,'v1=invalid',body),{status:401});
  await assert.rejects(service.receive(raw,timestamp,signature,{event:'purchase_approved',data:{}}),{status:400});
  assert.equal(writes,0);
});

test('primeiro pagamento cria uma afiliada e reentrega não duplica o cadastro', async () => {
  let membership=null, savedOrder=null, membershipsCreated=0;
  const tx={
    person:{findMany:async()=>[],create:async({data})=>({id:'person-1',...data})},
    membership:{findUnique:async({where})=>membership && (where.id===membership.id || where.caktoSubscriptionId===membership.caktoSubscriptionId)?membership:null,findFirst:async()=>null,create:async({data})=>{membershipsCreated++; membership={id:'membership-1',...data};return membership},update:async({data})=>{membership={...membership,...data};return membership}},
    caktoOrder:{findUnique:async()=>savedOrder,upsert:async({create,update})=>{savedOrder=savedOrder?{...savedOrder,...update}:create;return savedOrder}},
  };
  const service=new CaktoService({$transaction:async fn=>fn(tx)});
  await service.receive(raw,timestamp,signature,body);
  await service.receive(raw,timestamp,signature,body);
  assert.equal(membershipsCreated,1);
  assert.equal(membership.status,'APROVADA');
  assert.equal(savedOrder.amountCents,3000);
  assert.equal(savedOrder.status,'paid');
});
