import assert from 'node:assert/strict';
import test from 'node:test';

process.env.DATABASE_URL ||= 'postgresql://user:pass@localhost:5432/test';
process.env.FRONTEND_ORIGIN ||= 'http://localhost:5173';
process.env.HOTMART_PRODUCT_ID = '123';
process.env.HOTMART_WEBHOOK_TOKEN = 'hotmart-test-token-with-more-than-32-characters';
process.env.HOTMART_LINK_SECRET = 'test-link-secret-with-more-than-32-characters';

const {HotmartService,membershipCheckoutToken,resolveMembershipToken,hotmartStatus}=await import('../src/hotmart.service.ts');
const membershipId='00000000-0000-4000-8000-000000000001';
const event={id:'event-fixture-01',event:'PURCHASE_APPROVED',version:'2.0.0',data:{product:{id:123},buyer:{ucode:'buyer-001',name:'Pessoa Teste',email:'pessoa@example.test'},subscription:{id:9001,subscriber:{code:'subscriber-001'},status:'ACTIVE'},purchase:{transaction:'HPTEST001',status:'APPROVED',full_price:{value:42.5,currency_value:'BRL'},payment:{type:'PIX'},origin:{sck:membershipCheckoutToken(membershipId)}}}};

test('token de vínculo é assinado e rejeita alteração',()=>{
  const secret='a-secure-test-secret-that-is-long-enough';
  const id='00000000-0000-4000-8000-000000000001';
  const token=membershipCheckoutToken(id,secret);
  assert.equal(resolveMembershipToken(token,secret),id);
  assert.equal(resolveMembershipToken(`${token}x`,secret),null);
  assert.equal(resolveMembershipToken(token,'another-secret-that-is-also-long'),null);
});

test('status Hotmart usa estados financeiros internos sem marcar cadastro aprovado',()=>{
  assert.equal(hotmartStatus('APPROVED'),'RECEIVED');
  assert.equal(hotmartStatus('OVERDUE'),'OVERDUE');
  assert.equal(hotmartStatus('REFUNDED'),'REFUNDED');
  assert.equal(hotmartStatus('CHARGEBACK'),'CHARGEBACK_REQUESTED');
});

test('webhook exige hottok, versão válida e produto configurado',async()=>{
  let saved;
  const db={inboxEvent:{upsert:async(value)=>{saved=value}}};
  const service=new HotmartService(db);
  await assert.rejects(service.receive('wrong',event),{status:401});
  await assert.rejects(service.receive(process.env.HOTMART_WEBHOOK_TOKEN,{...event,event:'UNKNOWN'}),{status:400});
  await assert.rejects(service.receive(process.env.HOTMART_WEBHOOK_TOKEN,{...event,data:{...event.data,product:{id:456}}}),{status:400});
  assert.equal(saved,undefined);
});

test('webhook persiste idempotentemente e minimiza dados pessoais',async()=>{
  const writes=[];
  const db={inboxEvent:{upsert:async(value)=>{writes.push(value)}}};
  const service=new HotmartService(db);
  const result=await service.receive(process.env.HOTMART_WEBHOOK_TOKEN,event);
  assert.deepEqual(result,{received:true});
  assert.equal(writes.length,1);
  assert.equal(writes[0].where.id,'hotmart:event-fixture-01');
  const payload=writes[0].create.payload;
  assert.equal(payload.data.buyer.ucode,'buyer-001');
  assert.equal('email' in payload.data.buyer,false);
  assert.equal('name' in payload.data.buyer,false);
});

test('compra aprovada vincula filiação pelo token assinado e grava transação Hotmart',async()=>{
  let createdPayment,createdSubscription;
  const tx={
    subscription:{findUnique:async()=>null,create:async({data})=>(createdSubscription={...data,id:'subscription-local'})},
    payment:{findUnique:async()=>null,create:async({data})=>{createdPayment=data}},
    inboxEvent:{update:async()=>{}}
  };
  const db={resourceOrigin:{findUnique:async()=>({id:'origin',kind:'AFFILIATION'})},membership:{findUnique:async({where})=>where.id===membershipId?({id:membershipId,personId:'person-01'}):null},$transaction:async(fn)=>fn(tx)};
  const service=new HotmartService(db);
  await service.process({id:'hotmart:event-fixture-01',type:event.event,payload:event,attempts:0});
  assert.equal(createdSubscription.membershipId,membershipId);
  assert.equal(createdPayment.hotmartTransactionId,'HPTEST001');
  assert.equal(createdPayment.provider,'HOTMART');
  assert.equal(createdPayment.status,'RECEIVED');
  assert.equal(createdPayment.amountCents,4250);
});

test('compra sem token de afiliada fica não vinculada e não cria pagamento',async()=>{
  let state,transactions=0;
  const db={resourceOrigin:{findUnique:async()=>({id:'origin',kind:'AFFILIATION'})},membership:{findUnique:async()=>null},inboxEvent:{update:async({data})=>{state=data.state}},$transaction:async()=>{transactions++}};
  const service=new HotmartService(db);
  const bad={...event,data:{...event.data,purchase:{...event.data.purchase,origin:{sck:'forged'}}}};
  await service.process({id:'hotmart:event-unlinked',type:bad.event,payload:bad,attempts:0});
  assert.equal(state,'UNRESOLVED');
  assert.equal(transactions,0);
});

test('cancelamento de assinatura atualiza a assinatura sem aprovar/reprovar filiação',async()=>{
  let updated,status;
  const db={
    subscription:{findFirst:async()=>({id:'subscription-local',nextDueDate:null}),update:async({data})=>{updated=data}},
    $transaction:async(fn)=>fn({subscription:{update:async({data})=>{updated=data}},inboxEvent:{update:async({data})=>{status=data.state}}})
  };
  const service=new HotmartService(db);
  const cancellation={id:'cancel-event',event:'SUBSCRIPTION_CANCELLATION',version:'2.0.0',data:{product:{id:123},subscriber:{code:'subscriber-001'},subscription:{id:9001}}};
  await service.process({id:'hotmart:cancel-event',type:cancellation.event,payload:cancellation,attempts:0});
  assert.equal(updated.status,'CANCELLED');
  assert.equal(status,'PROCESSED');
});
