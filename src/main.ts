import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { ResponseInterceptor } from './common/interceptors/response.interceptor.js';
import { AuditLogInterceptor } from './common/interceptors/audit-log.interceptor.js';
import { RealtimeInterceptor } from './common/interceptors/realtime.interceptor.js';
import { ImageUrlInterceptor } from './common/interceptors/image-url.interceptor.js';
import { csrfMiddleware } from './common/middleware/csrf.middleware.js';
import { SESSION_TTL } from './common/constants/security.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const isProduction = configService.get<string>('NODE_ENV') === 'production';

  // Global prefix
  app.setGlobalPrefix('api/v1');

  // Security headers — HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy…
  // CSP tắt (FE admin set CSP qua meta tag; nếu serve API riêng thì bật lại)
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      frameguard: { action: 'deny' },
    }),
  );

  // Cookie parser — cần cho CSRF + đọc cookie trong handler
  app.use(cookieParser());

  // CORS — support comma-separated origins (admin + customer + mobile preview…)
  const corsOrigins = configService
    .get<string>('CORS_ORIGIN', 'http://localhost:4200')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.enableCors({
    origin: corsOrigins.length === 1 ? corsOrigins[0] : corsOrigins,
    credentials: true,
  });

  const authMode = configService.get<string>('AUTH_MODE', 'NONE').toUpperCase();

  // Session middleware — chỉ bật khi AUTH_MODE=SESSION.
  // Các mode khác (NONE / JWT) bỏ qua middleware này.
  if (authMode === 'SESSION') {
    const mongoUri = configService.get<string>(
      'MONGODB_URI',
      'mongodb://localhost:27017/app',
    );
    const sessionTtlSeconds = configService.get<number>(
      'SESSION_TTL_SECONDS',
      SESSION_TTL,
    );
    app.use(
      session({
        secret: configService.get<string>(
          'SESSION_SECRET',
          'change-this-secret',
        ),
        resave: false,
        saveUninitialized: false,
        store: MongoStore.create({
          mongoUrl: mongoUri,
          ttl: sessionTtlSeconds,
        }),
        cookie: {
          httpOnly: true,
          secure: isProduction,
          sameSite: isProduction ? 'strict' : 'lax',
          maxAge: sessionTtlSeconds * 1000,
        },
      }),
    );

    // CSRF protection — double-submit cookie, match Angular `withXsrfConfiguration`
    app.use(
      csrfMiddleware({
        production: isProduction,
        sameSite: isProduction ? 'strict' : 'lax',
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

  // Global exception filter → envelope error format
  app.useGlobalFilters(new HttpExceptionFilter());

  // Global interceptors — thứ tự: audit → realtime → imageUrl → response
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

  new Logger('Bootstrap').log(`Listening on :${port} (AUTH_MODE=${authMode})`);
}
void bootstrap();
