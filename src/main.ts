import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import { AppModule } from './app.module.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { ResponseInterceptor } from './common/interceptors/response.interceptor.js';
import { AuditLogInterceptor } from './common/interceptors/audit-log.interceptor.js';
import { RealtimeInterceptor } from './common/interceptors/realtime.interceptor.js';
import { ImageUrlInterceptor } from './common/interceptors/image-url.interceptor.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // Global prefix
  app.setGlobalPrefix('api/v1');

  // CORS
  app.enableCors({
    origin: configService.get<string>('CORS_ORIGIN', 'http://localhost:3001'),
    credentials: true,
  });

  // Session middleware (only for session auth mode)
  const authMode = configService
    .get<string>('AUTH_MODE', 'SESSION')
    .toUpperCase();
  if (authMode === 'SESSION') {
    const mongoUri = configService.get<string>(
      'MONGODB_URI',
      'mongodb://localhost:27017/app',
    );
    app.use(
      session({
        secret: configService.get<string>(
          'SESSION_SECRET',
          'change-this-secret',
        ),
        resave: false,
        saveUninitialized: false,
        store: MongoStore.create({ mongoUrl: mongoUri }),
        cookie: {
          httpOnly: true,
          secure: configService.get<string>('NODE_ENV') === 'production',
          sameSite:
            configService.get<string>('NODE_ENV') === 'production'
              ? 'strict'
              : 'lax',
          maxAge: 24 * 60 * 60 * 1000, // 24h
        },
      }),
    );
  }

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Global exception filter
  app.useGlobalFilters(new HttpExceptionFilter());

  // Global interceptors (order matters)
  const auditLogInterceptor = app.get(AuditLogInterceptor);
  const realtimeInterceptor = app.get(RealtimeInterceptor);
  const imageUrlInterceptor = app.get(ImageUrlInterceptor);

  app.useGlobalInterceptors(
    auditLogInterceptor,
    realtimeInterceptor,
    imageUrlInterceptor,
    new ResponseInterceptor(),
  );

  const port = configService.get<number>('PORT', 3000);
  await app.listen(port);
}
void bootstrap();
