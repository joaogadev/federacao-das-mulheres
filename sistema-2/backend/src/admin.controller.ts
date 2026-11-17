import { BadRequestException, Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiHeader, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { z } from 'zod';
import { Database } from './prisma.service';
import { AuthService } from './auth';
import { AsaasService } from './asaas.service';
import { DecisionDto, DonationPageDto, InboxEventDto, MembershipDto, MembershipPageDto, SummaryDto } from './api.dto';

const pageSchema=z.object({page:z.coerce.number().int().min(1).default(1),limit:z.coerce.number().int().min(1).max(100).default(20),search:z.string().max(100).optional(),status:z.enum(['PENDENTE','APROVADA','REPROVADA']).optional(),financial:z.enum(['overdue','received','pending','refunded']).optional()});
const decisionSchema=z.object({status:z.enum(['APROVADA','REPROVADA']),reason:z.string().trim().min(3).max(500)});
const uuid=z.string().uuid();

@ApiTags('admin')
@Controller()
export class AdminController {
  constructor(private readonly db:Database,private readonly auth:AuthService,private readonly asaas:AsaasService) {}

  @Get('health/live') @ApiOperation({summary:'Processo ativo'})
  live() {return {status:'ok'};}
  @Get('health/ready') @ApiOperation({summary:'Banco disponível'})
  async ready() {await this.db.$queryRaw`SELECT 1`; return {status:'ok'};}

  @Get('memberships') @ApiOperation({summary:'Lista filiações'})
  @ApiCookieAuth()
  @ApiQuery({name:'page',required:false,type:Number}) @ApiQuery({name:'limit',required:false,type:Number}) @ApiQuery({name:'search',required:false,type:String}) @ApiQuery({name:'status',required:false,enum:['PENDENTE','APROVADA','REPROVADA']}) @ApiQuery({name:'financial',required:false,enum:['overdue','received','pending','refunded']})
  @ApiOkResponse({type:MembershipPageDto})
  async memberships(@Req() req:Request,@Query() query:unknown) {
    await this.auth.require(req);
    const q=pageSchema.safeParse(query); if(!q.success) throw new BadRequestException('Filtros inválidos');
    const {page,limit,search,status,financial}=q.data;
    const where={...(status?{status}:{}),...(search?{person:{OR:[{name:{contains:search,mode:'insensitive' as const}},{email:{contains:search,mode:'insensitive' as const}}]}}:{}),...(financial?{subscriptions:{some:{payments:{some:{status:financial==='received'?'RECEIVED':financial==='overdue'?'OVERDUE':financial==='refunded'?'REFUNDED':'PENDING'}}}}}:{})};
    const [total,items]=await this.db.$transaction([this.db.membership.count({where}),this.db.membership.findMany({where,include:{person:{select:{id:true,name:true,email:true,phone:true}},subscriptions:{include:{payments:{select:{id:true,status:true,dueDate:true,amountCents:true}}}}},orderBy:{createdAt:'desc'},skip:(page-1)*limit,take:limit})]);
    return {items,total,page,limit};
  }

  @Get('memberships/:id') @ApiOperation({summary:'Detalhe da filiação'})
  @ApiCookieAuth()
  @ApiOkResponse({type:MembershipDto})
  async membership(@Req() req:Request,@Param('id') id:string) {
    await this.auth.require(req); if(!uuid.safeParse(id).success) throw new BadRequestException('ID inválido');
    const item=await this.db.membership.findUnique({where:{id},include:{person:true,subscriptions:{include:{payments:{orderBy:{dueDate:'desc'}}}}}});
    if(!item) throw new BadRequestException('Filiação não encontrada');
    const history=await this.db.auditLog.findMany({where:{entityType:'Membership',entityId:id},select:{id:true,action:true,details:true,createdAt:true,actor:{select:{email:true}}},orderBy:{createdAt:'desc'}});
    return {...item,history};
  }

  @Post('memberships/:id/decision') @ApiOperation({summary:'Decisão institucional; exige ADMIN e CSRF'})
  @ApiCookieAuth()
  @ApiBody({type:DecisionDto}) @ApiHeader({name:'X-CSRF-Token'})
  async decision(@Req() req:Request,@Param('id') id:string,@Body() body:unknown) {
    const session=await this.auth.require(req,'ADMIN',true);
    const parsed=decisionSchema.safeParse(body); if(!uuid.safeParse(id).success||!parsed.success) throw new BadRequestException('Decisão inválida');
    await this.db.$transaction(async tx=>{
      await tx.membership.update({where:{id},data:{status:parsed.data.status,decidedAt:new Date()}});
      await tx.auditLog.create({data:{actorId:session.userId,action:'MEMBERSHIP_DECISION',entityType:'Membership',entityId:id,details:{status:parsed.data.status,reason:parsed.data.reason}}});
    });
    return {ok:true};
  }

  @Get('donations') @ApiOperation({summary:'Lista doações avulsas'})
  @ApiCookieAuth()
  @ApiQuery({name:'page',required:false,type:Number}) @ApiQuery({name:'limit',required:false,type:Number}) @ApiQuery({name:'search',required:false,type:String}) @ApiQuery({name:'financial',required:false,enum:['overdue','received','pending','refunded']}) @ApiOkResponse({type:DonationPageDto})
  async donations(@Req() req:Request,@Query() query:unknown) {
    await this.auth.require(req);
    const q=pageSchema.safeParse(query); if(!q.success) throw new BadRequestException('Filtros inválidos');
    const {page,limit,search,financial}=q.data;
    const person=search?{OR:[{name:{contains:search,mode:'insensitive' as const}},{email:{contains:search,mode:'insensitive' as const}}]}:undefined;
    const where={...(person?{person}:{}),...(financial?{payment:{is:{status:financial==='received'?'RECEIVED':financial==='overdue'?'OVERDUE':financial==='refunded'?'REFUNDED':'PENDING'}}}:{})};
    const [total,items,received]=await this.db.$transaction([this.db.donation.count({where}),this.db.donation.findMany({where,include:{person:{select:{id:true,name:true,email:true}},payment:true},orderBy:{createdAt:'desc'},skip:(page-1)*limit,take:limit}),this.db.payment.aggregate({where:{donationId:{not:null},status:'RECEIVED',...(person?{donation:{person}}:{})},_sum:{amountCents:true}})]);
    return {items,total,page,limit,receivedTotalCents:received._sum.amountCents||0};
  }

  @Get('reports/summary') @ApiOperation({summary:'Indicadores separados por finalidade'})
  @ApiCookieAuth()
  @ApiOkResponse({type:SummaryDto})
  async summary(@Req() req:Request) {
    await this.auth.require(req);
    const [memberships,donations,monthlyReceived,donationReceived,monthlyOverdue,lastSync]=await Promise.all([
      this.db.membership.count(),this.db.donation.count(),
      this.db.payment.aggregate({where:{subscriptionId:{not:null},status:'RECEIVED'},_sum:{amountCents:true}}),
      this.db.payment.aggregate({where:{donationId:{not:null},status:'RECEIVED'},_sum:{amountCents:true}}),
      this.db.payment.count({where:{subscriptionId:{not:null},status:'OVERDUE'}}),
      this.db.syncRun.findFirst({orderBy:{startedAt:'desc'},select:{startedAt:true,finishedAt:true,result:true,error:true}})
    ]);
    return {memberships,donations,monthlyReceivedCents:monthlyReceived._sum.amountCents||0,donationReceivedCents:donationReceived._sum.amountCents||0,monthlyOverdue,lastSync};
  }
  @Get('events') @ApiOperation({summary:'Eventos com falha ou origem indefinida'})
  @ApiCookieAuth()
  @ApiOkResponse({type:[InboxEventDto]})
  async events(@Req() req:Request) {
    await this.auth.require(req);
    return this.db.inboxEvent.findMany({where:{state:{in:['FAILED','UNRESOLVED']}},select:{id:true,type:true,state:true,attempts:true,receivedAt:true,lastError:true},orderBy:{receivedAt:'desc'},take:100});
  }
  @Post('events/:id/retry') @ApiOperation({summary:'Reprocessar evento; exige ADMIN e CSRF'})
  @ApiCookieAuth()
  @ApiHeader({name:'X-CSRF-Token'})
  async retry(@Req() req:Request,@Param('id') id:string) {
    const session=await this.auth.require(req,'ADMIN',true);
    const result=await this.db.inboxEvent.updateMany({where:{id,state:{in:['FAILED','UNRESOLVED']}},data:{state:'PENDING',attempts:0,nextAttemptAt:new Date(),lastError:null}});
    if (!result.count) throw new BadRequestException('Evento não encontrado ou já processado');
    await this.db.auditLog.create({data:{actorId:session.userId,action:'EVENT_RETRY',entityType:'InboxEvent',entityId:id}});
    return {ok:true};
  }
  @Post('sync/reconcile') @ApiOperation({summary:'Reconciliar com Asaas; exige ADMIN e CSRF'})
  @ApiCookieAuth()
  @ApiHeader({name:'X-CSRF-Token'})
  async reconcile(@Req() req:Request) {
    const session=await this.auth.require(req,'ADMIN',true);
    const result=await this.asaas.reconcile();
    await this.db.auditLog.create({data:{actorId:session.userId,action:'RECONCILE',entityType:'SyncRun',entityId:'asaas',details:result}});
    return result;
  }
}
