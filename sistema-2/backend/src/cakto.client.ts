import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { z } from 'zod';
import { config } from './config';

const origin = 'https://api.cakto.com.br';
const tokenResponse = z.object({access_token:z.string().min(1),expires_in:z.number().positive()});
const orderPage = z.object({results:z.array(z.unknown()),next:z.string().nullable()});

@Injectable()
export class CaktoClient {
  private token?: string;
  private expiresAt=0;

  private async accessToken():Promise<string> {
    if (this.token && Date.now()<this.expiresAt) return this.token;
    if (!config.CAKTO_CLIENT_ID || !config.CAKTO_CLIENT_SECRET) throw new ServiceUnavailableException('Credenciais de leitura Cakto ausentes');
    const response=await fetch(`${origin}/public_api/token/`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:config.CAKTO_CLIENT_ID,client_secret:config.CAKTO_CLIENT_SECRET}),signal:AbortSignal.timeout(15000)});
    if (!response.ok) throw new ServiceUnavailableException(`Autenticação Cakto HTTP ${response.status}`);
    const parsed=tokenResponse.safeParse(await response.json());
    if (!parsed.success) throw new ServiceUnavailableException('Resposta de autenticação Cakto inválida');
    this.token=parsed.data.access_token;
    this.expiresAt=Date.now()+Math.max(1,parsed.data.expires_in-60)*1000;
    return this.token;
  }

  async *orders(productId:string):AsyncGenerator<unknown> {
    const first=new URL('/public_api/orders/',origin);
    first.searchParams.set('product',productId);
    first.searchParams.set('type','subscription');
    let url:URL|null=first;
    const visited=new Set<string>();
    while (url) {
      if (visited.size>=5000 || visited.has(url.href)) throw new ServiceUnavailableException('Paginação Cakto inválida ou extensa');
      visited.add(url.href);
      const response=await fetch(url,{headers:{Authorization:`Bearer ${await this.accessToken()}`},signal:AbortSignal.timeout(30000)});
      if (!response.ok) throw new ServiceUnavailableException(`Consulta Cakto HTTP ${response.status}`);
      const parsed=orderPage.safeParse(await response.json());
      if (!parsed.success) throw new ServiceUnavailableException('Página de pedidos Cakto inválida');
      for (const item of parsed.data.results) yield item;
      if (!parsed.data.next) {url=null;continue;}
      const next:URL=new URL(parsed.data.next,url);
      if (next.hostname!=='api.cakto.com.br' || !['http:','https:'].includes(next.protocol) || !next.pathname.startsWith('/public_api/orders/')) throw new ServiceUnavailableException('Próxima página Cakto fora da API de pedidos');
      url=new URL(next.pathname+next.search,origin);
    }
  }
}
