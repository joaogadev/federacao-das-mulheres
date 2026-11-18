import assert from 'node:assert/strict';
import test from 'node:test';

process.env.DATABASE_URL ||= 'postgresql://user:pass@localhost:5432/test';
process.env.FRONTEND_ORIGIN ||= 'http://localhost:5173';
process.env.ASAAS_WEBHOOK_TOKEN = 'fixture-token-32-characters-long-123';
process.env.ASAAS_API_KEY = 'fixture-api-key';

const { AsaasService } = await import('../src/asaas.service.ts');
const { isApprovedPayment, newerPaymentStatus } = await import('../src/payment-state.ts');
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

test('nova filiação aguarda pagamento confirmado sem gravar dados pessoais',async()=>{
  let writes=0;
  const origin={id:'origin-1',kind:'AFFILIATION',enabled:true};
  const db={
    payment:{findUnique:async()=>null},
    subscription:{findUnique:async()=>null},
    resourceOrigin:{findUnique:async()=>origin},
    customerIdentity:{findUnique:async()=>{throw new Error('Consulta antecipada ao cliente')}},
    inboxEvent:{update:async()=>{writes++}},
    $transaction:async()=>{throw new Error('Transação antecipada')},
  };
  const service=new AsaasService(db,{});
  const result=await service.syncPayment({id:'pay-pending',customer:'cus-1',paymentLink:'link-1',subscription:'sub-1',value:35,billingType:'PIX',status:'PENDING'},'evt-pending');
  assert.equal(result,true);
  assert.equal(writes,1);
  assert.equal(isApprovedPayment('PENDING'),false);
  assert.equal(isApprovedPayment('CONFIRMED'),true);
  assert.equal(isApprovedPayment('RECEIVED'),true);
  assert.equal(isApprovedPayment('REFUNDED'),false);
});

test('pagamento confirmado cria filiada com contato retornado pelo Asaas',async()=>{
  const saved={};
  const origin={id:'origin-1',kind:'AFFILIATION',enabled:true};
  const tx={
    customerIdentity:{findUnique:async()=>null},
    person:{findMany:async()=>[],create:async({data})=>{
      saved.person=data;
      return {customers:[{personId:'person-1'}]};
    }},
    subscription:{findUnique:async()=>null,create:async({data})=>{
      saved.subscription=data;
      return {id:'subscription-1'};
    }},
    membership:{findFirst:async()=>null,create:async({data})=>{
      saved.membership=data;
      return {id:'membership-1'};
    }},
    payment:{findUnique:async()=>null,upsert:async({create})=>{saved.payment=create}},
    inboxEvent:{update:async()=>{}},
  };
  const db={
    payment:{findUnique:async()=>null},
    subscription:{findUnique:async()=>null},
    resourceOrigin:{findUnique:async()=>origin},
    customerIdentity:{findUnique:async()=>null},
    $transaction:async(callback)=>callback(tx),
  };
  const api={
    customer:async()=>({id:'cus-1',name:'Maria da Silva',email:'MARIA@EXEMPLO.COM',mobilePhone:'(82) 99999-0000'}),
    subscription:async()=>({id:'sub-1',customer:'cus-1',value:35,cycle:'MONTHLY',status:'ACTIVE'}),
  };
  const service=new AsaasService(db,api);
  const result=await service.syncPayment({id:'pay-confirmed',customer:'cus-1',paymentLink:'link-1',subscription:'sub-1',value:35,billingType:'PIX',status:'CONFIRMED'},'evt-confirmed');
  assert.equal(result,true);
  assert.equal(saved.person.name,'Maria da Silva');
  assert.equal(saved.person.email,'maria@exemplo.com');
  assert.equal(saved.person.phone,'82999990000');
  assert.equal(saved.membership.personId,'person-1');
  assert.equal(saved.payment.subscriptionId,'subscription-1');
});

test('pagamento Asaas vincula filiação manual existente pelo CPF',async()=>{
  const saved={};
  const origin={id:'origin-1',kind:'AFFILIATION',enabled:true};
  const person={id:'person-1',name:'Maria',document:'12345678909',email:null,phone:'82999990000'};
  const tx={
    customerIdentity:{findUnique:async()=>null,create:async({data})=>({personId:data.personId})},
    person:{findMany:async()=>[person],update:async({data})=>{saved.person=data}},
    subscription:{findUnique:async()=>null,create:async({data})=>{saved.subscription=data;return {id:'subscription-1'}}},
    membership:{findFirst:async()=>({id:'manual-1',source:'MANUAL'}),update:async({data})=>{saved.membership=data;return {id:'manual-1'}}},
    payment:{findUnique:async()=>null,upsert:async()=>{}},
  };
  const db={payment:{findUnique:async()=>null},subscription:{findUnique:async()=>null},resourceOrigin:{findUnique:async()=>origin},customerIdentity:{findUnique:async()=>null},$transaction:async(callback)=>callback(tx)};
  const api={customer:async()=>({id:'cus-1',name:'Maria',cpfCnpj:'123.456.789-09',email:'maria@example.com'}),subscription:async()=>({id:'sub-1',customer:'cus-1',value:35,cycle:'MONTHLY',status:'ACTIVE'})};
  const service=new AsaasService(db,api);
  assert.equal(await service.syncPayment({id:'pay-1',customer:'cus-1',paymentLink:'link-1',subscription:'sub-1',value:35,billingType:'PIX',status:'RECEIVED'}),true);
  assert.equal(saved.person.email,'maria@example.com');
  assert.equal(saved.membership.source,'MISTA');
  assert.equal(saved.subscription.membershipId,'manual-1');
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
