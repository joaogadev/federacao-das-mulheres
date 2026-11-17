import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { Database } from './prisma.service';
import { config } from './config';
import { validCpf } from './cpf';

const customer = z.object({
  id: z.union([z.string(), z.number()]),
  name: z.string().trim().min(1),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  docNumber: z.string().nullable().optional(),
});
const order = z.object({
  id: z.string().min(1),
  status: z.string(),
  offer_type: z.string().optional(),
  amount: z.number().nonnegative().nullable().optional(),
  paymentMethod: z.string().optional(),
  customer,
  product: z.object({ id: z.string() }),
  subscription: z.object({ id: z.union([z.string(), z.number()]) }).passthrough().nullable().optional(),
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
export class CaktoService {
  constructor(private readonly db: Database) {}

  async receive(raw: Buffer | undefined, timestamp: string | undefined, signature: string | undefined, body: unknown) {
    if (!validCaktoSignature(raw, timestamp, signature, config.CAKTO_WEBHOOK_SECRET)) throw new UnauthorizedException('Assinatura Cakto inválida');
    const parsed = envelope.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Evento Cakto inválido');
    if (!relevant.has(parsed.data.event)) return { received: true, ignored: true };
    const orders = Array.isArray(parsed.data.data) ? parsed.data.data : [parsed.data.data];
    for (const item of orders) await this.applyOrder(parsed.data.event, item);
    return { received: true };
  }

  private async applyOrder(event: string, item: z.infer<typeof order>) {
    if (item.product.id !== config.CAKTO_PRODUCT_ID || item.offer_type && item.offer_type !== 'main') return;
    const cpf = digits(item.customer.docNumber);
    const phone = digits(item.customer.phone);
    const approved = positive.has(event) && item.status === 'paid' && !!date(item.paidAt);
    const subscriptionId = item.subscription?.id == null ? null : String(item.subscription.id);
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
          const nextStatus = existing?.status === 'paid' && !['refund', 'chargeback'].includes(event) ? 'paid' : status;
          await tx.caktoOrder.upsert({ where: { orderId: item.id }, create: { orderId: item.id, membershipId: membership.id, customerId: String(item.customer.id), productId: item.product.id, status: nextStatus, event, amountCents: Math.round((item.amount || 0) * 100), paymentMethod: item.paymentMethod || 'unknown', competence: date(item.due_date || item.paidAt)?.toISOString().slice(0, 7) || null, paidAt: date(item.paidAt) }, update: { status: nextStatus, event, paidAt: date(item.paidAt) } });
          if (subscriptionId) await tx.membership.update({ where: { id: membership.id }, data: { caktoSubscriptionId: subscriptionId, caktoSubscriptionStatus: event === 'subscription_canceled' ? 'canceled' : event === 'subscription_paused' ? 'paused' : event === 'subscription_late' || event === 'subscription_renewal_refused' ? 'late' : positive.has(event) ? 'active' : membership.caktoSubscriptionStatus } });
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
        return;
      } catch (error) {
        if (attempt === 2 || !(error instanceof Prisma.PrismaClientKnownRequestError) || !['P2002', 'P2034'].includes(error.code)) throw error;
      }
    }
  }
}
