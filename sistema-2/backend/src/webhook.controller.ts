import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';
import { ApiBody, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AsaasService } from './asaas.service';
import { AsaasWebhookDto } from './api.dto';

@ApiTags('asaas')
@Controller('webhooks')
export class WebhookController {
  constructor(private readonly service:AsaasService) {}
  @Post('asaas') @HttpCode(200) @ApiOperation({summary:'Recebe e persiste evento Asaas; authToken no header asaas-access-token'})
  @ApiHeader({name:'asaas-access-token'}) @ApiBody({type:AsaasWebhookDto})
  receive(@Headers('asaas-access-token') token:string|undefined,@Body() body:unknown) {return this.service.receive(token,body);}
}
