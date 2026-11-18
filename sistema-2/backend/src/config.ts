import { z } from 'zod';

const schema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
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
    HOTMART_MEMBERSHIP_APPROVED: z.enum(['true','false']).default('false'),
    HOTMART_WEBHOOK_TOKEN: z.string().default(''),
    HOTMART_CHECKOUT_URL: z.string().default(''),
    HOTMART_PRODUCT_ID: z.string().default(''),
    HOTMART_LINK_SECRET: z.string().default(''),
  })
  .superRefine((v, ctx) => {
    if (
      v.ASAAS_WEBHOOK_TOKEN &&
      (v.ASAAS_WEBHOOK_TOKEN.length < 32 ||
        v.ASAAS_WEBHOOK_TOKEN.length > 255 ||
        /\s/.test(v.ASAAS_WEBHOOK_TOKEN))
    )
      ctx.addIssue({
        code: 'custom',
        message: 'ASAAS_WEBHOOK_TOKEN must have 32–255 non-space characters',
      });
    const origin = new URL(v.FRONTEND_ORIGIN);
    if (origin.origin !== v.FRONTEND_ORIGIN)
      ctx.addIssue({
        code: 'custom',
        message:
          'FRONTEND_ORIGIN must be an origin without path or trailing slash',
      });
    if (v.NODE_ENV === 'production') {
      const asaasReady=Boolean(v.ASAAS_API_KEY && v.ASAAS_WEBHOOK_TOKEN.length>=32);
      const hotmartReady=v.HOTMART_MEMBERSHIP_APPROVED==='true' && Boolean(v.HOTMART_WEBHOOK_TOKEN && v.HOTMART_CHECKOUT_URL && v.HOTMART_PRODUCT_ID && v.HOTMART_LINK_SECRET.length>=32);
      if (!asaasReady && !hotmartReady)
        ctx.addIssue({
          code: 'custom',
          message: 'Configure uma integração de pagamentos habilitada em produção',
        });
      if (v.COOKIE_SECURE !== 'true')
        ctx.addIssue({
          code: 'custom',
          message: 'COOKIE_SECURE must be true in production',
        });
      if (!v.FRONTEND_ORIGIN.startsWith('https://'))
        ctx.addIssue({
          code: 'custom',
          message: 'HTTPS frontend required in production',
        });
    }
    if (v.COOKIE_SAME_SITE === 'none' && v.COOKIE_SECURE !== 'true')
      ctx.addIssue({
        code: 'custom',
        message: 'SameSite=None requires Secure',
      });
    if (
      v.ASAAS_AFFILIATION_LINK_ID &&
      v.ASAAS_AFFILIATION_LINK_ID === v.ASAAS_DONATION_LINK_ID
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Asaas link IDs must be distinct',
      });
    if (v.HOTMART_WEBHOOK_TOKEN && (v.HOTMART_WEBHOOK_TOKEN.length < 32 || v.HOTMART_WEBHOOK_TOKEN.length > 255 || /\s/.test(v.HOTMART_WEBHOOK_TOKEN)))
      ctx.addIssue({code:'custom',message:'HOTMART_WEBHOOK_TOKEN must have 32–255 non-space characters'});
    if (v.HOTMART_MEMBERSHIP_APPROVED === 'true' && (!v.HOTMART_WEBHOOK_TOKEN || !v.HOTMART_CHECKOUT_URL || !v.HOTMART_PRODUCT_ID || v.HOTMART_LINK_SECRET.length < 32))
      ctx.addIssue({code:'custom',message:'Hotmart membership approval requires product, checkout, webhook token, and link secret'});
    if (v.HOTMART_CHECKOUT_URL) {
      try {
        const checkout = new URL(v.HOTMART_CHECKOUT_URL);
        if (checkout.protocol !== 'https:' || !['pay.hotmart.com','checkout.hotmart.com'].includes(checkout.hostname) || checkout.username || checkout.password)
          throw new Error();
      } catch {
        ctx.addIssue({code:'custom',message:'HOTMART_CHECKOUT_URL must be an official HTTPS Hotmart checkout URL'});
      }
    }
  });

export const config = schema.parse(process.env);

const frontend = new URL(config.FRONTEND_ORIGIN);
export const allowedFrontendOrigins =
  config.NODE_ENV === 'development' &&
  ['localhost', '127.0.0.1'].includes(frontend.hostname)
    ? [
        `${frontend.protocol}//localhost:${frontend.port}`,
        `${frontend.protocol}//127.0.0.1:${frontend.port}`,
      ]
    : [config.FRONTEND_ORIGIN];
