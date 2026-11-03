import { Body, Controller, ForbiddenException, Get, Headers, Injectable, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { verify } from 'argon2';
import type { Request, Response } from 'express';
import { Database } from './prisma.service';
import { config } from './config';
import { z } from 'zod';
import { ApiBody, ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { LoginDto, SessionDto } from './api.dto';

export const hash = (v: string) => createHash('sha256').update(v).digest('hex');
const cookieOptions = { httpOnly: true, secure: config.COOKIE_SECURE === 'true', sameSite: config.COOKIE_SAME_SITE, path: '/' } as const;
const loginBody = z.object({email:z.string().email(), password:z.string().min(1)});

@Injectable()
export class AuthService {
  constructor(private readonly db: Database) {}

  async login(email: string, password: string, ip: string) {
    const normalized = email.trim().toLowerCase();
    const key = hash(normalized + '|' + ip);
    const now = new Date();
    const attempt = await this.db.loginAttempt.findUnique({where:{key}});
    if (attempt?.blockedUntil && attempt.blockedUntil > now) throw new UnauthorizedException('Credenciais inválidas');
    const user = await this.db.adminUser.findUnique({where:{email:normalized}});
    const ok = user && await verify(user.passwordHash, password).catch(() => false);
    if (!ok) {
      const count = attempt && now.getTime() - attempt.windowStart.getTime() < 15 * 60_000 ? attempt.count + 1 : 1;
      await this.db.loginAttempt.upsert({where:{key},create:{key,count,windowStart:now,blockedUntil:count >= 5 ? new Date(now.getTime()+15*60_000) : null},update:{count,windowStart:count===1?now:attempt!.windowStart,blockedUntil:count >= 5 ? new Date(now.getTime()+15*60_000) : null}});
      throw new UnauthorizedException('Credenciais inválidas');
    }
    await this.db.loginAttempt.deleteMany({where:{key}});
    const token = randomBytes(32).toString('base64url');
    const csrf = randomBytes(32).toString('base64url');
    await this.db.adminSession.create({data:{userId:user.id,tokenHash:hash(token),csrfToken:csrf,expiresAt:new Date(now.getTime()+8*60*60_000)}});
    await this.db.auditLog.create({data:{actorId:user.id,action:'LOGIN',entityType:'AdminUser',entityId:user.id}});
    return {token,csrf,user:{id:user.id,email:user.email,role:user.role}};
  }

  async session(req: Request, csrf = false) {
    const token: unknown = req.cookies?.admin_session;
    if (typeof token !== 'string' || token.length < 20) throw new UnauthorizedException();
    const session = await this.db.adminSession.findUnique({where:{tokenHash:hash(token)},include:{user:true}});
    if (!session || session.revokedAt || session.expiresAt < new Date()) throw new UnauthorizedException();
    if (csrf) {
      const supplied = req.header('x-csrf-token');
      if (!supplied || supplied.length < 20 || supplied.length!==session.csrfToken.length || !timingSafeEqual(Buffer.from(supplied),Buffer.from(session.csrfToken))) throw new ForbiddenException('CSRF inválido');
    }
    return session;
  }
  async require(req: Request, role?: 'ADMIN' | 'CONSULTA', csrf = false) {
    const session = await this.session(req,csrf);
    if (role === 'ADMIN' && session.user.role !== 'ADMIN') throw new ForbiddenException('Acesso negado');
    return session;
  }
}

@Controller('auth')
@ApiTags('auth')
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly db: Database) {}

  @Post('login')
  @ApiOperation({summary:'Login administrativo com limitação de tentativas'})
  @ApiBody({type:LoginDto}) @ApiOkResponse({type:SessionDto})
  async login(@Body() body: unknown, @Req() req: Request, @Res({passthrough:true}) res: Response, @Headers('origin') origin?:string) {
    if (origin && origin !== config.FRONTEND_ORIGIN) throw new ForbiddenException('Origem inválida');
    const value = loginBody.safeParse(body);
    if (!value.success) throw new UnauthorizedException('Credenciais inválidas');
    const result = await this.auth.login(value.data.email,value.data.password,req.ip || 'unknown');
    res.cookie('admin_session',result.token,{...cookieOptions,maxAge:8*60*60_000});
    return {user:result.user,csrfToken:result.csrf};
  }
  @Get('me')
  @ApiCookieAuth() @ApiOkResponse({type:SessionDto})
  async me(@Req() req: Request) {
    const s = await this.auth.session(req);
    return {user:{id:s.user.id,email:s.user.email,role:s.user.role},csrfToken:s.csrfToken};
  }
  @Post('logout')
  @ApiCookieAuth() @ApiOperation({summary:'Invalida a sessão; requer X-CSRF-Token'})
  async logout(@Req() req: Request, @Res({passthrough:true}) res: Response) {
    const s = await this.auth.session(req,true);
    await this.db.adminSession.update({where:{id:s.id},data:{revokedAt:new Date()}});
    await this.db.auditLog.create({data:{actorId:s.userId,action:'LOGOUT',entityType:'AdminSession',entityId:s.id}});
    res.clearCookie('admin_session',cookieOptions);
    return {ok:true};
  }
}
