import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { ALLOW_AUTHENTICATED_KEY } from '../decorators/allow-authenticated.decorator.js';
import type { Principal } from '../interfaces/principal.interface.js';
import { ErrorCode } from '../constants/error-codes.js';

interface AuthRequest extends Omit<Request, 'session'> {
  principal?: Principal;
  session?: Request['session'] & {
    principal?: Principal;
  };
}

interface JwtPayload {
  sub?: string;
  userId?: string;
  email?: string;
  roles?: string[];
  permissions?: string[];
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthRequest>();
    const authMode = this.configService
      .get<string>('AUTH_MODE', 'SESSION')
      .toUpperCase();

    let principal: Principal | undefined;

    if (authMode === 'JWT') {
      principal = await this.extractPrincipalFromJwt(request);
    } else {
      principal = this.extractPrincipalFromSession(request);
    }

    if (!principal) {
      const allowAuthenticated = this.reflector.getAllAndOverride<boolean>(
        ALLOW_AUTHENTICATED_KEY,
        [context.getHandler(), context.getClass()],
      );
      if (allowAuthenticated) return true;

      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'Authentication required',
      });
    }

    request.principal = principal;
    return true;
  }

  private extractPrincipalFromSession(
    request: AuthRequest,
  ): Principal | undefined {
    return request.session?.principal ?? undefined;
  }

  private async extractPrincipalFromJwt(
    request: AuthRequest,
  ): Promise<Principal | undefined> {
    const authHeader = request.headers['authorization'];
    if (!authHeader) return undefined;

    const [scheme, token] = authHeader.split(' ');
    if (scheme !== 'Bearer' || !token) return undefined;

    try {
      const payload: JwtPayload = await this.jwtService.verifyAsync<JwtPayload>(
        token,
        {
          secret: this.configService.get<string>('JWT_SECRET'),
        },
      );

      return {
        userId: payload.sub ?? payload.userId ?? '',
        email: payload.email ?? '',
        roles: payload.roles ?? [],
        permissions: payload.permissions ?? [],
      };
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'TokenExpiredError') {
        throw new UnauthorizedException({
          code: ErrorCode.TOKEN_EXPIRED,
          message: 'Token has expired',
        });
      }
      throw new UnauthorizedException({
        code: ErrorCode.TOKEN_INVALID,
        message: 'Invalid token',
      });
    }
  }
}
