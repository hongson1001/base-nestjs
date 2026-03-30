import { Global, Module } from '@nestjs/common';
import { NotificationGateway } from './notification.gateway.js';

@Global()
@Module({
  providers: [NotificationGateway],
  exports: [NotificationGateway],
})
export class GatewayModule {}
