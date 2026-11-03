import { Module } from '@nestjs/common';
import { Database } from './prisma.service';
import { AuthController, AuthService } from './auth';
import { AdminController } from './admin.controller';
import { WebhookController } from './webhook.controller';
import { AsaasClient } from './asaas.client';
import { AsaasService } from './asaas.service';

@Module({controllers:[AuthController,AdminController,WebhookController],providers:[Database,AuthService,AsaasClient,AsaasService]})
export class AppModule {}
