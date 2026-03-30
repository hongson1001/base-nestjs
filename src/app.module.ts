import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule } from '@nestjs/throttler';
import { JwtModule } from '@nestjs/jwt';
import { APP_GUARD } from '@nestjs/core';

import { AuthGuard } from './common/guards/auth.guard.js';
import { PermissionGuard } from './common/guards/permission.guard.js';
import { CustomThrottlerGuard } from './common/guards/custom-throttler.guard.js';

import { AuditLogInterceptor } from './common/interceptors/audit-log.interceptor.js';
import { RealtimeInterceptor } from './common/interceptors/realtime.interceptor.js';
import { ImageUrlInterceptor } from './common/interceptors/image-url.interceptor.js';

import { FileStorageService } from './common/services/file-storage.service.js';
import { PolicyService } from './common/services/policy.service.js';

import { GatewayModule } from './common/gateways/gateway.module.js';

import { AuditLog, AuditLogSchema } from './common/schemas/audit-log.schema.js';
import { Counter, CounterSchema } from './common/schemas/counter.schema.js';

import { AuthModule } from './modules/auth/auth.module.js';

import { RATE_LIMIT_TTL, RATE_LIMIT_MAX } from './common/constants/security.js';

@Module({
  imports: [
    // Config
    ConfigModule.forRoot({ isGlobal: true }),

    // MongoDB
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>(
          'MONGODB_URI',
          'mongodb://localhost:27017/app',
        ),
      }),
    }),

    // Shared schemas
    MongooseModule.forFeature([
      { name: AuditLog.name, schema: AuditLogSchema },
      { name: Counter.name, schema: CounterSchema },
    ]),

    // Rate limiting
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: RATE_LIMIT_TTL * 1000,
          limit: RATE_LIMIT_MAX,
        },
      ],
    }),

    // JWT (global, used by AuthGuard + NotificationGateway)
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET', 'jwt-secret-change-me'),
        signOptions: { expiresIn: '15m' },
      }),
    }),

    // WebSocket gateway (global)
    GatewayModule,

    // Feature modules
    AuthModule,
  ],
  providers: [
    // Global guards (order: Auth → Throttler → Permission)
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: CustomThrottlerGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },

    // Services needed by global interceptors
    FileStorageService,
    PolicyService,

    // Interceptors (registered as providers so main.ts can app.get() them)
    AuditLogInterceptor,
    RealtimeInterceptor,
    ImageUrlInterceptor,
  ],
  exports: [FileStorageService, PolicyService],
})
export class AppModule {}
