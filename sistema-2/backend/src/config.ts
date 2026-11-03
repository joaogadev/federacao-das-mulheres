import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  DATABASE_URL: z.string().startsWith('postgresql://'),
  FRONTEND_ORIGIN: z.string().url(),
  COOKIE_SECURE: z.enum(['true', 'false']).default('false'),
  COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  ASAAS_ENV: z.enum(['sandbox', 'production']).default('sandbox'),
  ASAAS_API_KEY: z.string().default(''),
  ASAAS_WEBHOOK_TOKEN: z.string().default(''),
  ASAAS_AFFILIATION_LINK_ID: z.string().default(''),
  ASAAS_DONATION_LINK_ID: z.string().default(''),
  RECONCILE_INTERVAL_MINUTES: z.coerce.number().int().min(15).default(60),
}).superRefine((v, ctx) => {
  if (v.ASAAS_WEBHOOK_TOKEN && (v.ASAAS_WEBHOOK_TOKEN.length < 32 || v.ASAAS_WEBHOOK_TOKEN.length > 255 || /\s/.test(v.ASAAS_WEBHOOK_TOKEN))) ctx.addIssue({code:'custom',message:'ASAAS_WEBHOOK_TOKEN must have 32–255 non-space characters'});
  const origin = new URL(v.FRONTEND_ORIGIN);
  if (origin.origin !== v.FRONTEND_ORIGIN) ctx.addIssue({code:'custom',message:'FRONTEND_ORIGIN must be an origin without path or trailing slash'});
  if (v.NODE_ENV === 'production') {
    if (!v.ASAAS_API_KEY || v.ASAAS_WEBHOOK_TOKEN.length < 32) ctx.addIssue({code:'custom',message:'Asaas credentials required in production'});
    if (v.COOKIE_SECURE !== 'true') ctx.addIssue({code:'custom',message:'COOKIE_SECURE must be true in production'});
    if (!v.FRONTEND_ORIGIN.startsWith('https://')) ctx.addIssue({code:'custom',message:'HTTPS frontend required in production'});
  }
  if (v.COOKIE_SAME_SITE === 'none' && v.COOKIE_SECURE !== 'true') ctx.addIssue({code:'custom',message:'SameSite=None requires Secure'});
  if (v.ASAAS_AFFILIATION_LINK_ID && v.ASAAS_AFFILIATION_LINK_ID === v.ASAAS_DONATION_LINK_ID) ctx.addIssue({code:'custom',message:'Asaas link IDs must be distinct'});
});

export const config = schema.parse(process.env);
