import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';

// Parse at module load (once). Avoids falling back to '*' if .env failed to load,
// since that would break credentials:true browsers reject wildcard origin.
function resolveCorsOrigins(): string | string[] {
  const raw = process.env.CORS_ORIGIN;
  if (!raw) return 'http://localhost:4200';
  const origins = raw
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  return origins.length === 1 ? origins[0] : origins;
}

export interface EntityChangePayload {
  entity: string;
  action: string;
  id: string | null;
  timestamp: string; // ISO 8601
  scope?: string;
}

export interface NotificationPayload {
  type: string;
  title: string;
  message: string;
}

interface JwtPayload {
  sub?: string;
  userId?: string;
  roles?: string[];
}

interface SessionRequest {
  session?: {
    principal?: {
      userId: string;
      roles?: string[];
    };
  };
}

@WebSocketGateway({
  namespace: '/ws',
  cors: {
    // Decorator metadata evaluates at class-load — ConfigService isn't ready yet.
    // We read process.env here and validate in the constructor below.
    origin: resolveCorsOrigins(),
    credentials: true,
  },
})
export class NotificationGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(NotificationGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {
    // Sanity-check CORS origin — warn loud if resolved to wildcard or fallback.
    const origin = this.configService.get<string>('CORS_ORIGIN');
    if (!origin) {
      this.logger.warn(
        'CORS_ORIGIN not set — WebSocket using fallback http://localhost:4200. ' +
          'Set CORS_ORIGIN in env for production.',
      );
    }
  }

  async handleConnection(client: Socket): Promise<void> {
    const authMode = this.configService
      .get<string>('AUTH_MODE', 'NONE')
      .toUpperCase();

    // NONE mode: cho phép anonymous connection (skeleton chưa bật auth)
    if (authMode === 'NONE') {
      this.logger.debug(`Client connected (anonymous): ${client.id}`);
      return;
    }

    try {
      const principal = await this.authenticate(client);
      if (!principal) {
        client.disconnect(true);
        return;
      }

      // Store principal on socket data
      (client.data as Record<string, unknown>).principal = principal;

      // Auto-join user-specific room
      await client.join(`user:${principal.userId}`);

      // Auto-join role rooms
      for (const role of principal.roles ?? []) {
        await client.join(`role:${role}`);
      }

      this.logger.debug(
        `Client connected: ${client.id} (user: ${principal.userId})`,
      );
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(`Client disconnected: ${client.id}`);
  }

  sendToRoom(room: string, event: string, data: unknown): void {
    this.server.to(room).emit(event, data);
  }

  broadcast(event: string, data: unknown): void {
    this.server.emit(event, data);
  }

  pushEntityChange(payload: EntityChangePayload): void {
    const room = payload.scope ?? payload.entity;
    this.server.to(room).emit('entity:changed', payload);
    // Also broadcast to a general channel
    this.server.emit('entity:changed', payload);
  }

  pushNotification(room: string, payload: NotificationPayload): void {
    this.server.to(room).emit('notification:new', {
      ...payload,
      timestamp: new Date().toISOString(),
    });
  }

  private async authenticate(
    client: Socket,
  ): Promise<{ userId: string; roles: string[] } | null> {
    // Try JWT from handshake auth or query
    const auth = client.handshake.auth as Record<string, unknown>;
    const token =
      (typeof auth?.token === 'string' ? auth.token : undefined) ??
      (typeof client.handshake.query?.token === 'string'
        ? client.handshake.query.token
        : undefined);

    if (token) {
      try {
        const payload: JwtPayload =
          await this.jwtService.verifyAsync<JwtPayload>(token, {
            secret: this.configService.get<string>('JWT_SECRET'),
          });
        return {
          userId: payload.sub ?? payload.userId ?? '',
          roles: payload.roles ?? [],
        };
      } catch {
        return null;
      }
    }

    // Try session cookie — the session middleware should have parsed it
    const request = client.request as SessionRequest;
    if (request?.session?.principal) {
      const p = request.session.principal;
      return { userId: p.userId, roles: p.roles ?? [] };
    }

    return null;
  }
}
