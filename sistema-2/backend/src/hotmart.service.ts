import { BadRequestException, Injectable, OnModuleInit, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { Prisma, type InboxEvent } from '@prisma/client';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { config } from './config';
import { Database } from './prisma.service';
import { newerPaymentStatus } from './payment-state';

export const hotmartPurchaseEvents = ['PURCHASE_APPROVED','PURCHASE_COMPLETE','PURCHASE_CANCELED','PURCHASE_REFUNDED','PURCHASE_PARTIALLY_REFUNDED','PURCHASE_CHARGEBACK','PURCHASE_PROTEST','PURCHASE_DELAYED','PURCHASE_EXPIRED'] as const;
export const hotmartEventTypes = [...hotmartPurchaseEvents,'SUBSCRIPTION_CANCELLATION'] as const;

const eventSchema = z.object({
  id:z.string().min(1).max(200),
  event:z.enum(hotmartEventTypes),
  version:z.literal('2.0.0'),
  data:z.object({
    product:z.object({id:z.union([z.string(),z.number()]).optional(),ucode:z.string().optional()}).passthrough().optional(),
    buyer:z.object({ucode:z.string().max(200).optional()}).passthrough().optional(),
    purchase:z.object({
      transaction:z.string().min(1).max(200).optional(),status:z.string().max(50).optional(),
      full_price:z.object({value:z.number().finite().nonnegative(),currency_value:z.string().length(3)}).passthrough().optional(),
      approved_date:z.number().finite().optional(),order_date:z.string().optional(),date_next_charge:z.number().finite().optional(),
      payment:z.object({type:z.string().max(50).optional()}).passthrough().optional(),
      origin:z.object({sck:z.string().max(255).optional()}).passthrough().optional(),
    }).passthrough().optional(),
    subscriber:z.object({code:z.string().min(1).max(200).optional()}).passthrough().optional(),
    subscription:z.object({id:z.union([z.string(),z.number()]).optional(),subscriber:z.object({code:z.string().min(1).max(200).optional()}).passthrough().optional(),status:z.string().max(100).optional(),plan:z.object({name:z.string().optional()}).passthrough().optional()}).passthrough().optional(),
    cancellation_date:z.number().finite().optional(),date_next_charge:z.number().finite().optional(),
  }).passthrough(),
}).passthrough();

export function membershipCheckoutToken(membershipId:string, secret=config.HOTMART_LINK_SECRET) {
  const signature=createHmac('sha256',secret).update(`membership:${membershipId}`).digest('hex');
  return `fm1.${membershipId}.${signature}`;
}

export function resolveMembershipToken(token:string|undefined, secret=config.HOTMART_LINK_SECRET):string|null {
  if (!token || token.length>255) return null;
  const match=/^fm1\.([0-9a-f-]{36})\.([0-9a-f]{64})$/i.exec(token);
  if (!match) return null;
  const expected=Buffer.from(createHmac('sha256',secret).update(`membership:${match[1]}`).digest('hex'));
  const received=Buffer.from(match[2]);
  return expected.length===received.length && timingSafeEqual(expected,received) ? match[1] : null;
}

export function hotmartStatus(status:string|undefined):string {
  switch(status) {
    case 'APPROVED': case 'COMPLETE': return 'RECEIVED';
    case 'OVERDUE': case 'PURCHASE_DELAYED': return 'OVERDUE';
    case 'REFUNDED': return 'REFUNDED';
    case 'PARTIALLY_REFUNDED': return 'PARTIALLY_REFUNDED';
    case 'CHARGEBACK': case 'PROTEST': case 'DISPUTE': return 'CHARGEBACK_REQUESTED';
    case 'CANCELLED': return 'CANCELLED';
    case 'EXPIRED': return 'EXPIRED';
    default:return 'PENDING';
  }
}

const safeError=(e:unknown)=>e instanceof Error?e.message.slice(0,250).replace(/(?:HP|HOT)[\w-]{5,}/g,'[transaction]'):'Falha desconhecida';

@Injectable()
export class HotmartService implements OnModuleInit {
  private timer?:NodeJS.Timeout;
  private busy=false;
  constructor(private readonly db:Database) {}

  async onModuleInit() {
    if (config.HOTMART_PRODUCT_ID) {
      const productId=config.HOTMART_PRODUCT_ID;
      const existing=await this.db.resourceOrigin.findUnique({where:{hotmartProductId:productId}});
      if (existing && existing.kind!=='AFFILIATION') throw new Error('Hotmart product is already configured for a non-affiliation origin');
      if (!existing) await this.db.resourceOrigin.create({data:{hotmartProductId:productId,kind:'AFFILIATION'}});
    }
    this.timer=setInterval(()=>void this.tick().catch(e=>console.error('Hotmart inbox failed:',safeError(e))),15000);
    this.timer.unref();
    void this.tick().catch(e=>console.error('Hotmart inbox failed:',safeError(e)));
  }

  checkoutUrl(membershipId:string) {
    if (config.HOTMART_MEMBERSHIP_APPROVED!=='true' || !config.HOTMART_CHECKOUT_URL || config.HOTMART_LINK_SECRET.length<32)
      throw new ServiceUnavailableException('Checkout Hotmart aguarda aprovação comercial e configuração');
    const url=new URL(config.HOTMART_CHECKOUT_URL);
    url.searchParams.set('sck',membershipCheckoutToken(membershipId));
    return {url:url.toString()};
  }

  async receive(token:string|undefined,body:unknown) {
    if (config.HOTMART_WEBHOOK_TOKEN.length<32) throw new ServiceUnavailableException('Webhook Hotmart não configurado');
    const received=Buffer.from(token||''); const expected=Buffer.from(config.HOTMART_WEBHOOK_TOKEN);
    if (received.length!==expected.length || !timingSafeEqual(received,expected)) throw new UnauthorizedException();
    const parsed=eventSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Evento Hotmart inválido');
    const event=parsed.data;
    if (!config.HOTMART_PRODUCT_ID) throw new ServiceUnavailableException('Produto Hotmart não configurado');
    const productId=String(event.data.product?.id ?? '');
    if (productId!==config.HOTMART_PRODUCT_ID) throw new BadRequestException('Produto Hotmart não permitido');
    if (event.event!=='SUBSCRIPTION_CANCELLATION' && (!event.data.purchase?.transaction || !event.data.purchase.full_price))
      throw new BadRequestException('Dados da compra incompletos');
    if (event.event!=='SUBSCRIPTION_CANCELLATION' && event.data.purchase?.full_price?.currency_value!=='BRL')
      throw new BadRequestException('Moeda do produto Hotmart deve ser BRL');
    if (event.event==='SUBSCRIPTION_CANCELLATION' && !event.data.subscriber?.code && event.data.subscription?.id===undefined)
      throw new BadRequestException('Identificador de assinatura ausente');
    const data=event.data;
    const minimized={id:event.id,event:event.event,version:event.version,data:{
      product:data.product?{id:data.product.id,ucode:data.product.ucode}:undefined,
      buyer:data.buyer?.ucode?{ucode:data.buyer.ucode}:undefined,
      purchase:data.purchase?{transaction:data.purchase.transaction,status:data.purchase.status,full_price:data.purchase.full_price?{value:data.purchase.full_price.value,currency_value:data.purchase.full_price.currency_value}:undefined,approved_date:data.purchase.approved_date,order_date:data.purchase.order_date,date_next_charge:data.purchase.date_next_charge,payment:data.purchase.payment?{type:data.purchase.payment.type}:undefined,origin:data.purchase.origin?{sck:data.purchase.origin.sck}:undefined}:undefined,
      subscriber:data.subscriber?.code?{code:data.subscriber.code}:undefined,
      subscription:data.subscription?{id:data.subscription.id,subscriber:data.subscription.subscriber?.code?{code:data.subscription.subscriber.code}:undefined,status:data.subscription.status}:undefined,
      cancellation_date:data.cancellation_date,date_next_charge:data.date_next_charge,
    }};
    await this.db.inboxEvent.upsert({where:{id:`hotmart:${event.id}`},create:{id:`hotmart:${event.id}`,type:event.event,payload:minimized as Prisma.InputJsonValue},update:{}});
    return {received:true};
  }

  async tick() {
    if(this.busy)return;
    this.busy=true;
    try {
      const items=await this.db.inboxEvent.findMany({where:{type:{in:[...hotmartEventTypes]},OR:[{state:'PENDING',nextAttemptAt:{lte:new Date()}},{state:'PROCESSING',lockedUntil:{lt:new Date()}}]},orderBy:{receivedAt:'asc'},take:10});
      for(const event of items) {
        const claimed=await this.db.inboxEvent.updateMany({where:{id:event.id,OR:[{state:'PENDING',nextAttemptAt:{lte:new Date()}},{state:'PROCESSING',lockedUntil:{lt:new Date()}}]},data:{state:'PROCESSING',lockedUntil:new Date(Date.now()+60000),attempts:{increment:1}}});
        if(!claimed.count)continue;
        try {await this.process(event);}
        catch(e) {const attempts=event.attempts+1;await this.db.inboxEvent.update({where:{id:event.id},data:{state:attempts>=5?'FAILED':'PENDING',lastError:safeError(e),lockedUntil:null,nextAttemptAt:new Date(Date.now()+Math.min(60000*2**attempts,3600000))}});}
      }
    } finally {this.busy=false;}
  }

  private async process(event:InboxEvent) {
    const e=eventSchema.parse(event.payload);
    if(e.event==='SUBSCRIPTION_CANCELLATION') {
      const subscriberCode=e.data.subscriber?.code;
      const id=e.data.subscription?.id===undefined?undefined:String(e.data.subscription.id);
      const known=await this.db.subscription.findFirst({where:{OR:[...(subscriberCode?[{hotmartSubscriberCode:subscriberCode}]:[]),...(id?[{hotmartSubscriptionId:id}]:[])]}});
      if(!known) {await this.db.inboxEvent.update({where:{id:event.id},data:{state:'UNRESOLVED',lastError:'Assinatura Hotmart sem vínculo',lockedUntil:null}});return;}
      await this.db.$transaction(async tx=>{
        await tx.subscription.update({where:{id:known.id},data:{status:'CANCELLED',nextDueDate:e.data.date_next_charge?new Date(e.data.date_next_charge):known.nextDueDate}});
        await tx.inboxEvent.update({where:{id:event.id},data:{state:'PROCESSED',processedAt:new Date(),lastError:null,lockedUntil:null}});
      });
      return;
    }
    const purchase=e.data.purchase!;
    const transactionId=purchase.transaction!;
    const membershipId=resolveMembershipToken(purchase.origin?.sck);
    const origin=await this.db.resourceOrigin.findUnique({where:{hotmartProductId:config.HOTMART_PRODUCT_ID}});
    const membership=membershipId?await this.db.membership.findUnique({where:{id:membershipId},include:{person:true}}):null;
    const subscriberCode=e.data.subscription?.subscriber?.code || e.data.subscriber?.code;
    const subscriptionId=e.data.subscription?.id===undefined?null:String(e.data.subscription.id);
    if(!membership || !origin || !subscriberCode) {
      await this.db.inboxEvent.update({where:{id:event.id},data:{state:'UNRESOLVED',lastError:!membership?'Vínculo seguro da afiliada ausente':'Dados de assinatura ausentes',lockedUntil:null}});return;
    }
    const buyerCode=e.data.buyer?.ucode;
    const amountCents=Math.round(purchase.full_price!.value*100);
    const currency=purchase.full_price!.currency_value.toUpperCase();
    const billingType=purchase.payment?.type||'UNKNOWN';
    const status=hotmartStatus(purchase.status||e.event.replace('PURCHASE_',''));
    const paidAt=purchase.approved_date?new Date(purchase.approved_date):status==='RECEIVED'?new Date():null;
    await this.db.$transaction(async tx=>{
      let subscription=await tx.subscription.findUnique({where:{hotmartSubscriberCode:subscriberCode}});
      if(subscription && subscription.membershipId!==membership.id) throw new Error('Hotmart subscription belongs to another membership');
      if(!subscription) subscription=await tx.subscription.create({data:{membershipId:membership.id,originId:origin.id,hotmartSubscriberCode:subscriberCode,hotmartSubscriptionId:subscriptionId,amountCents,cycle:'NÃO INFORMADA',status:e.data.subscription?.status||'ACTIVE'}});
      else await tx.subscription.update({where:{id:subscription.id},data:{amountCents,hotmartSubscriptionId:subscriptionId||subscription.hotmartSubscriptionId,status:e.data.subscription?.status||subscription.status,nextDueDate:purchase.date_next_charge?new Date(purchase.date_next_charge):subscription.nextDueDate}});
      const existing=await tx.payment.findUnique({where:{hotmartTransactionId:transactionId}});
      const finalStatus=existing?newerPaymentStatus(existing.status,status):status;
      const paymentData={provider:'HOTMART' as const,hotmartTransactionId:transactionId,customerId:`hotmart:${buyerCode||subscriberCode}`,subscriptionId:subscription.id,amountCents,currency,billingType,status:finalStatus,dueDate:purchase.date_next_charge?new Date(purchase.date_next_charge):null,paidAt:existing?.paidAt||paidAt,receivedAt:finalStatus==='RECEIVED'?(existing?.receivedAt||paidAt):existing?.receivedAt||null,competence:purchase.order_date?.slice(0,7)||null};
      if(existing) await tx.payment.update({where:{id:existing.id},data:paymentData}); else await tx.payment.create({data:paymentData});
      await tx.inboxEvent.update({where:{id:event.id},data:{state:'PROCESSED',processedAt:new Date(),lastError:null,lockedUntil:null}});
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  }
}
