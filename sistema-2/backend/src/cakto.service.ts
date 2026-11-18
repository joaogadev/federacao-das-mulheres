import { BadRequestException, ConflictException, Injectable, OnModuleDestroy, OnModuleInit, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { Database } from './prisma.service';
import { config } from './config';
import { validCpf } from './cpf';
import { CaktoClient } from './cakto.client';

const customer = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  name: z.string().trim().min(1),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  docNumber: z.string().nullable().optional(),
});
const order = z.object({
  id: z.string().min(1),
  status: z.string(),
  offer_type: z.string().optional(),
  amount: z.coerce.number().nonnegative().nullable().optional(),
  paymentMethod: z.string().optional(),
  customer,
  product: z.object({ id: z.string() }),
  subscription: z.union([z.object({ id: z.union([z.string(), z.number()]) }).passthrough(),z.string(),z.number()]).nullable().optional(),
  subscription_period: z.number().nullable().optional(),
  paidAt: z.string().nullable().optional(),
  due_date: z.string().nullable().optional(),
}).passthrough();
const envelope = z.object({ event: z.string(), data: z.union([order, z.array(order)]) });
const relevant = new Set(['purchase_approved', 'purchase_refused', 'refund', 'chargeback', 'subscription_renewed', 'subscription_renewal_refused', 'subscription_late', 'subscription_late_recovered', 'subscription_canceled', 'subscription_paused', 'subscription_resumed']);
const positive = new Set(['purchase_approved', 'subscription_renewed', 'subscription_late_recovered']);
const digits = (value: string | null | undefined) => (value || '').replace(/\D/g, '');
const date = (value: string | null | undefined) => value && !Number.isNaN(Date.parse(value)) ? new Date(value) : null;

export function validCaktoSignature(raw: Buffer | undefined, timestamp: string | undefined, signature: string | undefined, secret: string, now = Date.now()) {
  if (!raw || !timestamp || !signature || secret.length < 32 || !/^\d+$/.test(timestamp) || Math.abs(now / 1000 - Number(timestamp)) > 300) return false;
  const expected = `v1=${createHmac('sha256', secret).update(`${timestamp}.`).update(raw).digest('hex')}`;
  return signature.split(',').some((part) => {
    const a = Buffer.from(part.trim()); const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  });
}

@Injectable()
export class CaktoService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private startupTimer?: NodeJS.Timeout;
  constructor(private readonly db: Database, private readonly api: CaktoClient) {}

  onModuleInit() {
    if (!config.CAKTO_CLIENT_ID || !config.CAKTO_CLIENT_SECRET || !config.CAKTO_PRODUCT_ID) {
      console.warn('CAKTO_RECONCILE_DISABLED missing_configuration');
      return;
    }
    this.startupTimer = setTimeout(() => void this.runScheduled(), 5_000);
    this.startupTimer.unref();
    this.timer = setInterval(() => void this.runScheduled(), config.CAKTO_RECONCILE_INTERVAL_MINUTES * 60_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.startupTimer) clearTimeout(this.startupTimer);
    if (this.timer) clearInterval(this.timer);
  }

  private async runScheduled() {
    try {
      const result = await this.reconcile();
      console.info(`CAKTO_RECONCILE_COMPLETED seen=${result.seen} processed=${result.processed} skipped=${result.skipped} failed=${result.failed}`);
    } catch (error) {
      const status = error instanceof ServiceUnavailableException ? error.getStatus() : 'unknown';
      console.error(`CAKTO_RECONCILE_FAILED status=${status}; consulte a execução no painel`);
    }
  }

  async receive(raw: Buffer | undefined, timestamp: string | undefined, signature: string | undefined, body: unknown) {
    if (!validCaktoSignature(raw, timestamp, signature, config.CAKTO_WEBHOOK_SECRET)) throw new UnauthorizedException('Assinatura Cakto inválida');
    const parsed = envelope.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Evento Cakto inválido');
    if (!relevant.has(parsed.data.event)) return { received: true, ignored: true };
    const orders = Array.isArray(parsed.data.data) ? parsed.data.data : [parsed.data.data];
    for (const item of orders) await this.applyOrder(parsed.data.event, item);
    return { received: true };
  }

  async reconcile() {
    if (!config.CAKTO_CLIENT_ID || !config.CAKTO_CLIENT_SECRET || !config.CAKTO_PRODUCT_ID) throw new ServiceUnavailableException('API Cakto não configurada');
    await this.db.syncLease.upsert({where:{scope:'CAKTO_RECONCILE'},create:{scope:'CAKTO_RECONCILE',lockedUntil:new Date(0)},update:{}});
    let lockedUntil = new Date(Date.now()+30*60_000);
    const lease = await this.db.syncLease.updateMany({where:{scope:'CAKTO_RECONCILE',lockedUntil:{lt:new Date()}},data:{lockedUntil}});
    if (!lease.count) throw new ConflictException('Conciliação Cakto já em andamento');
    let run: {id:string}|undefined;
    let seen=0,processed=0,skipped=0,failed=0;
    const failedIds:string[]=[];
    try {
      run=await this.db.syncRun.create({data:{scope:'CAKTO_ORDERS'}});
      for await (const raw of this.api.orders(config.CAKTO_PRODUCT_ID)) {
        seen++;
        if (seen % 100 === 0) {
          const next = new Date(Date.now()+30*60_000);
          const extended = await this.db.syncLease.updateMany({where:{scope:'CAKTO_RECONCILE',lockedUntil},data:{lockedUntil:next}});
          if (!extended.count) throw new ConflictException('Conciliação Cakto perdeu o bloqueio');
          lockedUntil = next;
        }
        const parsed=order.safeParse(raw);
        if (!parsed.success) { failed++; continue; }
        const item=parsed.data;
        if (item.product.id !== config.CAKTO_PRODUCT_ID || item.offer_type && item.offer_type !== 'main') { skipped++; continue; }
        const event=item.status==='paid'?'purchase_approved':item.status==='refunded'?'refund':item.status==='chargedback'?'chargeback':'purchase_refused';
        try { await this.applyOrder(event,item,true); processed++; }
        catch { failed++; if (failedIds.length < 5) failedIds.push(item.id); }
      }
      const result=`${seen} consultados; ${processed} processados; ${skipped} ignorados; ${failed} com falha`;
      await this.db.syncRun.update({where:{id:run.id},data:{finishedAt:new Date(),result,error:failed?`${failed} pedidos exigem conferência na Cakto${failedIds.length ? `; IDs: ${failedIds.join(', ')}` : ''}`.slice(0,500):null}});
      return {seen,processed,skipped,failed};
    } catch(error) {
      if (run) await this.db.syncRun.update({where:{id:run.id},data:{finishedAt:new Date(),error:error instanceof Error?error.message.slice(0,200):'Falha Cakto'}});
      throw error;
    } finally {
      await this.db.syncLease.updateMany({where:{scope:'CAKTO_RECONCILE',lockedUntil},data:{lockedUntil:new Date(0)}});
    }
  }

  private async applyOrder(event: string, item: z.infer<typeof order>, fromApi=false) {
    if (item.product.id !== config.CAKTO_PRODUCT_ID || item.offer_type && item.offer_type !== 'main') return;
    const cpf = digits(item.customer.docNumber);
    const phone = digits(item.customer.phone);
    const approved = positive.has(event) && item.status === 'paid' && !!date(item.paidAt);
    const subscriptionId = item.subscription == null ? null : typeof item.subscription === 'object' ? String(item.subscription.id) : String(item.subscription);
    if (approved && (!validCpf(cpf) || phone.length < 10 || !subscriptionId)) throw new BadRequestException('Pagamento Cakto sem CPF válido, telefone ou assinatura');
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await this.db.$transaction(async (tx) => {
          const knownOrder = await tx.caktoOrder.findUnique({ where: { orderId: item.id } });
          let membership = knownOrder ? await tx.membership.findUnique({ where: { id: knownOrder.membershipId } }) : null;
          if (!membership && subscriptionId) membership = await tx.membership.findUnique({ where: { caktoSubscriptionId: subscriptionId } });
          if (!membership && approved) {
            const people = await tx.person.findMany({ where: { document: cpf }, take: 2 });
            if (people.length > 1) throw new BadRequestException('CPF duplicado no cadastro; intervenção administrativa necessária');
            const person = people[0] || await tx.person.create({ data: { name: item.customer.name, document: cpf, phone, email: item.customer.email?.trim().toLowerCase() || null } });
            membership = await tx.membership.findFirst({ where: { personId: person.id, status: { not: 'REPROVADA' } }, orderBy: { createdAt: 'desc' } });
            if (!membership) membership = await tx.membership.create({ data: { personId: person.id, status: 'APROVADA', source: 'CAKTO', createdAt: date(item.paidAt)!, decidedAt: date(item.paidAt), caktoSubscriptionId: subscriptionId, caktoSubscriptionStatus: 'active' } });
            else {
              if (membership.caktoSubscriptionId && membership.caktoSubscriptionId !== subscriptionId) throw new BadRequestException('Pessoa já vinculada a outra assinatura Cakto');
              await tx.membership.update({ where: { id: membership.id }, data: { status: 'APROVADA', source: membership.source === 'CAKTO' ? 'CAKTO' : 'MISTA', caktoSubscriptionId: subscriptionId, caktoSubscriptionStatus: 'active' } });
            }
          }
          if (!membership) return;
          if (subscriptionId && membership.caktoSubscriptionId && membership.caktoSubscriptionId !== subscriptionId) throw new BadRequestException('Assinatura Cakto diverge da afiliada');
          const status = event === 'refund' ? 'refunded' : event === 'chargeback' ? 'chargedback' : item.status;
          const existing = await tx.caktoOrder.findUnique({ where: { orderId: item.id } });
          const keepExisting = existing && ((['refunded', 'chargedback'].includes(existing.status) && !['refund', 'chargeback'].includes(event)) || (existing.status === 'paid' && !['refund', 'chargeback'].includes(event) && status !== 'paid'));
          const nextStatus = keepExisting ? existing.status : status;
          const nextEvent = keepExisting ? existing.event : event;
          const paidAt = keepExisting ? existing.paidAt : date(item.paidAt);
          await tx.caktoOrder.upsert({ where: { orderId: item.id }, create: { orderId: item.id, membershipId: membership.id, customerId: String(item.customer.id ?? `cpf:${cpf}`), productId: item.product.id, status: nextStatus, event:nextEvent, amountCents: Math.round((item.amount || 0) * 100), paymentMethod: item.paymentMethod || 'unknown', competence: date(item.due_date || item.paidAt)?.toISOString().slice(0, 7) || null, paidAt }, update: { status: nextStatus, event:nextEvent, paidAt } });
          if (subscriptionId && !fromApi) await tx.membership.update({ where: { id: membership.id }, data: { caktoSubscriptionId: subscriptionId, caktoSubscriptionStatus: event === 'subscription_canceled' ? 'canceled' : event === 'subscription_paused' ? 'paused' : event === 'subscription_late' || event === 'subscription_renewal_refused' ? 'late' : positive.has(event) ? 'active' : membership.caktoSubscriptionStatus } });
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
        return;
      } catch (error) {
        if (attempt === 2 || !(error instanceof Prisma.PrismaClientKnownRequestError) || !['P2002', 'P2034'].includes(error.code)) throw error;
      }
    }
  }
}
