import { Body, Controller, Headers, HttpCode, Post, Req } from '@nestjs/common';
import { ApiBody, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { AsaasService } from './asaas.service';
import { CaktoService } from './cakto.service';
import { AsaasWebhookDto } from './api.dto';

@ApiTags('asaas')
@Controller('webhooks')
export class WebhookController {
  constructor(private readonly service:AsaasService, private readonly cakto:CaktoService) {}
  @Post('asaas') @HttpCode(200) @ApiOperation({summary:'Recebe e persiste evento Asaas; authToken no header asaas-access-token'})
  @ApiHeader({name:'asaas-access-token'}) @ApiBody({type:AsaasWebhookDto})
  receive(@Headers('asaas-access-token') token:string|undefined,@Body() body:unknown) {return this.service.receive(token,body);}
  @Post('cakto') @HttpCode(200) @ApiOperation({summary:'Recebe eventos assinados da Cakto'})
  caktoEvent(@Req() req:RawBodyRequest<Request>, @Headers('x-cakto-timestamp') timestamp:string|undefined, @Headers('x-cakto-signature') signature:string|undefined, @Body() body:unknown) {
    return this.cakto.receive(req.rawBody, timestamp, signature, body);
  }
}
