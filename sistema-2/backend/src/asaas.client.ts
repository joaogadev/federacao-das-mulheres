import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { config } from './config';

export type AsaasPayment = {
  id:string; customer:string; subscription?:string|null; paymentLink?:string|null;
  value:number; netValue?:number|null; billingType:string; status:string;
  dueDate?:string|null; paymentDate?:string|null; clientPaymentDate?:string|null;
  confirmedDate?:string|null; creditDate?:string|null;
};
export type AsaasSubscription = { id:string; customer:string; value:number; cycle:string; nextDueDate?:string; status:string; };
export type AsaasCustomer = { id:string; name:string; cpfCnpj?:string|null; email?:string|null; mobilePhone?:string|null; phone?:string|null; };

@Injectable()
export class AsaasClient {
  private readonly base = config.ASAAS_ENV === 'sandbox' ? 'https://api-sandbox.asaas.com/v3' : 'https://api.asaas.com/v3';
  async get<T>(path:string):Promise<T> {
    if (!config.ASAAS_API_KEY) throw new ServiceUnavailableException('Asaas não configurado');
    if (!path.startsWith('/') || path.startsWith('//')) throw new Error('Invalid Asaas path');
    let lastError: unknown;
    for (let attempt=0;attempt<3;attempt++) {
      try {
        const response = await fetch(this.base+path,{headers:{access_token:config.ASAAS_API_KEY,accept:'application/json','User-Agent':'FederacaoMulheres/0.1'},signal:AbortSignal.timeout(10000)});
        if (response.ok) return await response.json() as T;
        if (![429,500,502,503,504].includes(response.status)) throw new Error(`NON_RETRY:${response.status}`);
        lastError = new Error(`Asaas GET HTTP ${response.status}`);
        const retryAfter = Number(response.headers.get('retry-after'));
        await new Promise(r=>setTimeout(r,Number.isFinite(retryAfter)&&retryAfter>0?Math.min(retryAfter*1000,10000):500*2**attempt));
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('NON_RETRY:')) throw new ServiceUnavailableException(`Asaas GET HTTP ${error.message.slice(10)}`);
        lastError=error;
        if (attempt<2) await new Promise(r=>setTimeout(r,500*2**attempt));
      }
    }
    throw new ServiceUnavailableException(`Falha de consulta Asaas: ${lastError instanceof Error ? lastError.message : 'desconhecida'}`);
  }
  payment(id:string) { return this.get<AsaasPayment>(`/payments/${encodeURIComponent(id)}`); }
  subscription(id:string) { return this.get<AsaasSubscription>(`/subscriptions/${encodeURIComponent(id)}`); }
  customer(id:string) { return this.get<AsaasCustomer>(`/customers/${encodeURIComponent(id)}`); }
  async *pages<T>(path:string):AsyncGenerator<T> {
    for (let offset=0;;offset+=100) {
      const join=path.includes('?')?'&':'?';
      const result=await this.get<{data:T[];hasMore:boolean}>(`${path}${join}offset=${offset}&limit=100`);
      for (const item of result.data) yield item;
      if (!result.hasMore || result.data.length===0) return;
    }
  }
}
