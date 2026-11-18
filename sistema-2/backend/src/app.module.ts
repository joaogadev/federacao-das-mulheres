import { Module } from '@nestjs/common';
import { Database } from './prisma.service';
import { AuthController, AuthService } from './auth';
import { AdminController } from './admin.controller';
import { WebhookController } from './webhook.controller';
import { AsaasClient } from './asaas.client';
import { AsaasService } from './asaas.service';
import { HotmartService } from './hotmart.service';
import {
  DocumentsController,
  DocumentUploadGuard,
} from './documents.controller';
import { ScansController } from './scans.controller';

@Module({
  controllers: [
    AuthController,
    AdminController,
    WebhookController,
    DocumentsController,
    ScansController,
  ],
  providers: [
    Database,
    AuthService,
    AsaasClient,
    AsaasService,
    HotmartService,
    DocumentUploadGuard,
  ],
})
export class AppModule {}
