import { BadRequestException, ConflictException, Injectable, OnModuleInit, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { Prisma, type InboxEvent, type ResourceOrigin } from '@prisma/client';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { AsaasClient, type AsaasCustomer, type AsaasPayment, type AsaasSubscription } from './asaas.client';
import { Database } from './prisma.service';
import { config } from './config';
import { newerPaymentStatus } from './payment-state';

const eventSchema = z.object({id:z.string().min(3).max(200),event:z.string().min(3).max(100),payment:z.object({id:z.string().min(1)}).passthrough().optional(),subscription:z.object({id:z.string().min(1)}).passthrough().optional()}).passthrough();
const paymentTypes = new Set(['PAYMENT_CREATED','PAYMENT_UPDATED','PAYMENT_CONFIRMED','PAYMENT_RECEIVED','PAYMENT_OVERDUE','PAYMENT_DELETED','PAYMENT_REFUNDED','PAYMENT_PARTIALLY_REFUNDED','PAYMENT_REFUND_IN_PROGRESS','PAYMENT_CHARGEBACK_REQUESTED']);
const subscriptionTypes = new Set(['SUBSCRIPTION_CREATED','SUBSCRIPTION_UPDATED','SUBSCRIPTION_INACTIVATED','SUBSCRIPTION_DELETED']);
const money = (n:number|undefined|null) => n === null || n === undefined ? null : Math.round(n*100);
const date = (s:string|undefined|null) => s ? new Date(`${s.slice(0,10)}T12:00:00Z`) : null;
const digits = (s:string|undefined|null) => s?.replace(/\D/g,'') || null;
const safeError = (e:unknown) => e instanceof Error ? e.message.slice(0,250).replace(/(?:cus|pay|sub)_[\w-]+/g,'[id]') : 'Falha desconhecida';

@Injectable()
export class AsaasService implements OnModuleInit {
  private timer?:NodeJS.Timeout;
  private busy=false;
  constructor(private readonly db:Database, private readonly api:AsaasClient) {}
  async onModuleInit() {
    for (const [id,kind] of [[config.ASAAS_AFFILIATION_LINK_ID,'AFFILIATION'],[config.ASAAS_DONATION_LINK_ID,'DONATION']] as const) {
      if (!id) continue;
      const existing=await this.db.resourceOrigin.findUnique({where:{asaasLinkId:id}});
      if (existing && existing.kind!==kind) throw new Error(`Asaas origin conflict: ${id}`);
      if (!existing) await this.db.resourceOrigin.create({data:{asaasLinkId:id,kind}});
    }
    await this.db.syncLease.upsert({where:{scope:'ASAAS_RECONCILE'},create:{scope:'ASAAS_RECONCILE',lockedUntil:new Date(0)},update:{}});
    this.timer=setInterval(()=>void this.tick().catch(e=>console.error('Inbox processing failed:',safeError(e))),15000);
    this.timer.unref();
    void this.tick().catch(e=>console.error('Inbox processing failed:',safeError(e)));
    if (config.ASAAS_API_KEY) {
      const reconcile=setInterval(()=>void this.reconcile().catch(e=>console.error('Reconciliation failed:',safeError(e))),config.RECONCILE_INTERVAL_MINUTES*60_000);
      reconcile.unref();
    }
  }
  async receive(token:string|undefined,body:unknown) {
    if (config.ASAAS_WEBHOOK_TOKEN.length<32) throw new ServiceUnavailableException('Webhook não configurado');
    const a=Buffer.from(token||''); const b=Buffer.from(config.ASAAS_WEBHOOK_TOKEN);
    if (a.length!==b.length || !timingSafeEqual(a,b)) throw new UnauthorizedException();
    const parsed=eventSchema.safeParse(body);
    if (!parsed.success || (!parsed.data.payment && !parsed.data.subscription)) throw new BadRequestException('Evento inválido');
    const event=parsed.data;
    if (!paymentTypes.has(event.event) && !subscriptionTypes.has(event.event)) throw new BadRequestException('Tipo de evento não configurado');
    if (paymentTypes.has(event.event) && !event.payment || subscriptionTypes.has(event.event) && !event.subscription) throw new BadRequestException('Recurso do evento ausente');
    await this.db.inboxEvent.upsert({where:{id:event.id},create:{id:event.id,type:event.event,payload:event as Prisma.InputJsonValue},update:{}});
    return {received:true};
  }
  async tick() {
    if (this.busy) return;
    this.busy=true;
    try {
      const items=await this.db.inboxEvent.findMany({where:{OR:[{state:'PENDING',nextAttemptAt:{lte:new Date()}},{state:'PROCESSING',lockedUntil:{lt:new Date()}}]},orderBy:{receivedAt:'asc'},take:10});
      for (const event of items) {
        const claimed=await this.db.inboxEvent.updateMany({where:{id:event.id,OR:[{state:'PENDING',nextAttemptAt:{lte:new Date()}},{state:'PROCESSING',lockedUntil:{lt:new Date()}}]},data:{state:'PROCESSING',lockedUntil:new Date(Date.now()+60000),attempts:{increment:1}}});
        if (!claimed.count) continue;
        try { await this.process(event); }
        catch(e) {
          const attempts=event.attempts+1;
          await this.db.inboxEvent.update({where:{id:event.id},data:{state:attempts>=5?'FAILED':'PENDING',lastError:safeError(e),lockedUntil:null,nextAttemptAt:new Date(Date.now()+Math.min(60000*2**attempts,3600000))}});
        }
      }
    } finally {this.busy=false;}
  }
  private async process(event:InboxEvent) {
    const payload=eventSchema.parse(event.payload);
    if (paymentTypes.has(event.type)) {
      const id=payload.payment?.id;
      if (!id) throw new Error('Payment missing');
      const payment=config.ASAAS_API_KEY ? await this.api.payment(id) : payload.payment as unknown as AsaasPayment;
      const result=await this.syncPayment(payment,event.id);
      if (!result) await this.db.inboxEvent.update({where:{id:event.id},data:{state:'UNRESOLVED',lastError:'Origem não identificada',lockedUntil:null}});
    } else {
      const id=payload.subscription?.id;
      if (!id) throw new Error('Subscription missing');
      const subscription=config.ASAAS_API_KEY ? await this.api.subscription(id) : payload.subscription as unknown as AsaasSubscription;
      const known=await this.db.subscription.findUnique({where:{asaasId:id}});
      if (!known) await this.db.inboxEvent.update({where:{id:event.id},data:{state:'UNRESOLVED',lastError:'Assinatura ainda sem vínculo de origem',lockedUntil:null}});
      else await this.db.$transaction(async tx=>{
        await tx.subscription.update({where:{id:known.id},data:{status:subscription.status,nextDueDate:date(subscription.nextDueDate),amountCents:money(subscription.value)??known.amountCents}});
        await tx.inboxEvent.update({where:{id:event.id},data:{state:'PROCESSED',processedAt:new Date(),lastError:null,lockedUntil:null}});
      });
    }
  }
  private async syncPayment(p:AsaasPayment,eventId?:string):Promise<boolean> {
    if (!p.id || !p.customer || typeof p.value!=='number' || !p.status) throw new Error('Asaas payment incomplete');
    const knownPayment=await this.db.payment.findUnique({where:{asaasId:p.id},include:{subscription:{include:{origin:true}},donation:{include:{origin:true}}}});
    let origin:ResourceOrigin|null=knownPayment?.subscription?.origin || knownPayment?.donation?.origin || null;
    const knownSubscription=p.subscription ? await this.db.subscription.findUnique({where:{asaasId:p.subscription},include:{origin:true}}) : null;
    if (!origin && knownSubscription) origin=knownSubscription.origin;
    if (!origin && p.paymentLink) origin=await this.db.resourceOrigin.findUnique({where:{asaasLinkId:p.paymentLink}});
    if (!origin || !origin.enabled || (origin.kind==='DONATION' && p.subscription)) return false;
    const customer=await this.db.customerIdentity.findUnique({where:{asaasId:p.customer}});
    const details=customer ? null : config.ASAAS_API_KEY ? await this.api.customer(p.customer) : {id:p.customer,name:'Pessoa de fixture local'} as AsaasCustomer;
    const subscription=p.subscription && origin.kind==='AFFILIATION' && !knownSubscription ? config.ASAAS_API_KEY ? await this.api.subscription(p.subscription) : {id:p.subscription,customer:p.customer,value:p.value,cycle:'MONTHLY',status:'ACTIVE'} as AsaasSubscription : null;
    for(let attempt=0;attempt<3;attempt++) try {
      await this.db.$transaction(async tx=>{
        let identity=await tx.customerIdentity.findUnique({where:{asaasId:p.customer}});
        if (!identity) {
          const person=await tx.person.create({data:{name:details?.name || 'Nome indisponível',document:digits(details?.cpfCnpj),email:details?.email?.trim().toLowerCase()||null,phone:digits(details?.mobilePhone||details?.phone),customers:{create:{asaasId:p.customer}}},include:{customers:true}});
          identity=person.customers[0];
        }
        let subscriptionId:string|undefined=knownSubscription?.id;
        let donationId:string|undefined=knownPayment?.donationId || undefined;
        if (origin!.kind==='AFFILIATION') {
          if (!p.subscription) throw new Error('Filiação sem ID de assinatura');
          const existing=await tx.subscription.findUnique({where:{asaasId:p.subscription}});
          if (existing) subscriptionId=existing.id;
          else {
            const membership=await tx.membership.create({data:{personId:identity.personId}});
            const created=await tx.subscription.create({data:{membershipId:membership.id,originId:origin!.id,asaasId:p.subscription,amountCents:money(subscription?.value)??money(p.value)!,cycle:subscription?.cycle||'MONTHLY',nextDueDate:date(subscription?.nextDueDate),status:subscription?.status||'ACTIVE'}});
            subscriptionId=created.id;
          }
        } else if (!donationId) {
          const donation=await tx.donation.create({data:{personId:identity.personId,originId:origin!.id}});
          donationId=donation.id;
        }
        const current=await tx.payment.findUnique({where:{asaasId:p.id}});
        const status=newerPaymentStatus(current?.status,p.status);
        await tx.payment.upsert({where:{asaasId:p.id},create:{asaasId:p.id,customerId:p.customer,subscriptionId,donationId,amountCents:money(p.value)!,netCents:money(p.netValue),billingType:p.billingType||'UNKNOWN',status,dueDate:date(p.dueDate),paidAt:date(p.paymentDate||p.clientPaymentDate),receivedAt:date(p.creditDate),competence:p.dueDate?.slice(0,7)},update:status===p.status?{status,netCents:money(p.netValue),paidAt:date(p.paymentDate||p.clientPaymentDate),receivedAt:date(p.creditDate),dueDate:date(p.dueDate)}:{status}});
        if(eventId) await tx.inboxEvent.update({where:{id:eventId},data:{state:'PROCESSED',processedAt:new Date(),lastError:null,lockedUntil:null}});
      },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
      return true;
    } catch(e) {if(attempt===2 || !(e instanceof Prisma.PrismaClientKnownRequestError) || !['P2002','P2034'].includes(e.code)) throw e;}
    return true;
  }
  async reconcile() {
    if (!config.ASAAS_API_KEY) throw new ServiceUnavailableException('Asaas não configurado');
    let leaseUntil=new Date(Date.now()+30*60_000);
    const lease=await this.db.syncLease.updateMany({where:{scope:'ASAAS_RECONCILE',lockedUntil:{lt:new Date()}},data:{lockedUntil:leaseUntil}});
    if (!lease.count) throw new ConflictException('Conciliação já em execução');
    const heartbeat=setInterval(()=>void (async()=>{
      const next=new Date(Date.now()+30*60_000);
      const renewed=await this.db.syncLease.updateMany({where:{scope:'ASAAS_RECONCILE',lockedUntil:leaseUntil},data:{lockedUntil:next}});
      if (renewed.count) leaseUntil=next;
    })().catch(e=>console.error('Reconciliation lease renewal failed:',safeError(e))),5*60_000);
    heartbeat.unref();
    let run: {id:string}|undefined;
    const seen=new Set<string>();
    try {
      run=await this.db.syncRun.create({data:{scope:'ASAAS_PAYMENTS'}});
      for await (const p of this.api.pages<AsaasPayment>('/payments')) {
        if (p.paymentLink && [config.ASAAS_AFFILIATION_LINK_ID,config.ASAAS_DONATION_LINK_ID].includes(p.paymentLink)) {
          if (await this.syncPayment(p)) seen.add(p.id);
        }
      }
      const subscriptions=await this.db.subscription.findMany({select:{asaasId:true}});
      for (const subscription of subscriptions) {
        for await (const p of this.api.pages<AsaasPayment>(`/payments?subscription=${encodeURIComponent(subscription.asaasId)}`)) {
          if (await this.syncPayment(p)) seen.add(p.id);
        }
      }
      const unresolved=await this.db.inboxEvent.findMany({where:{state:'UNRESOLVED'},take:100});
      await this.db.inboxEvent.updateMany({where:{id:{in:unresolved.map(x=>x.id)}},data:{state:'PENDING',nextAttemptAt:new Date()}});
      await this.db.syncRun.update({where:{id:run.id},data:{finishedAt:new Date(),result:`${seen.size} pagamentos vinculados`}});
      return {count:seen.size};
    } catch(e) {
      if (run) await this.db.syncRun.update({where:{id:run.id},data:{finishedAt:new Date(),error:safeError(e)}});
      throw e;
    } finally { clearInterval(heartbeat); await this.db.syncLease.updateMany({where:{scope:'ASAAS_RECONCILE',lockedUntil:leaseUntil},data:{lockedUntil:new Date(0)}}); }
  }
}
