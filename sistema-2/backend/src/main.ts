import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { config } from './config';

export async function bootstrap(listen=true) {
  const app=await NestFactory.create(AppModule,{bodyParser:true});
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({origin:config.FRONTEND_ORIGIN,credentials:true,methods:['GET','POST'],allowedHeaders:['Content-Type','X-CSRF-Token']});
  const doc=SwaggerModule.createDocument(app,new DocumentBuilder().setTitle('Federação das Mulheres — API administrativa').setVersion('0.1.0').addCookieAuth('admin_session').build());
  if(config.NODE_ENV!=='production') SwaggerModule.setup('api-docs',app,doc);
  if(listen) await app.listen(config.PORT);
  return {app,doc};
}
if(require.main===module) void bootstrap();
