import { UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { AuthGuard } from './auth.guard.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { ALLOW_AUTHENTICATED_KEY } from '../decorators/allow-authenticated.decorator.js';
import { ErrorCode } from '../constants/error-codes.js';

describe('AuthGuard', () => {
  let guard: AuthGuard;
  let reflector: Reflector;
  let configService: ConfigService;
  let jwtService: JwtService;

  const mockReflector = {
    getAllAndOverride: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  const mockJwtService = {
    verifyAsync: jest.fn(),
  };

  const createMockContext = (overrides: Record<string, unknown> = {}) => {
    const request = {
      headers: {},
      session: {},
      ...overrides,
    };
    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue(request),
      }),
      __request: request,
    } as any;
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AuthGuard,
        { provide: Reflector, useValue: mockReflector },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    guard = module.get(AuthGuard);
    reflector = module.get(Reflector);
    configService = module.get(ConfigService);
    jwtService = module.get(JwtService);

    jest.clearAllMocks();
  });

  describe('public routes', () => {
    it('should allow public routes (IS_PUBLIC_KEY = true)', async () => {
      mockReflector.getAllAndOverride.mockReturnValue(true);
      const context = createMockContext();

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockReflector.getAllAndOverride).toHaveBeenCalledWith(
        IS_PUBLIC_KEY,
        [context.getHandler(), context.getClass()],
      );
    });
  });

  describe('session mode', () => {
    beforeEach(() => {
      mockReflector.getAllAndOverride.mockReturnValue(false);
      mockConfigService.get.mockReturnValue('SESSION');
    });

    it('should reject unauthenticated requests in session mode', async () => {
      const context = createMockContext({ session: {} });

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should extract principal from session in session mode', async () => {
      const principal = {
        userId: 'user-1',
        email: 'test@test.com',
        roles: ['user'],
        permissions: ['read'],
      };
      const context = createMockContext({
        session: { principal },
      });

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(context.__request.principal).toEqual(principal);
    });
  });

  describe('JWT mode', () => {
    beforeEach(() => {
      mockReflector.getAllAndOverride.mockReturnValue(false);
      mockConfigService.get.mockImplementation(
        (key: string, defaultVal?: string) => {
          if (key === 'AUTH_MODE') return 'JWT';
          if (key === 'JWT_SECRET') return 'test-secret';
          return defaultVal;
        },
      );
    });

    it('should extract principal from JWT in jwt mode', async () => {
      const payload = {
        sub: 'user-1',
        email: 'test@test.com',
        roles: ['user'],
        permissions: ['read'],
      };
      mockJwtService.verifyAsync.mockResolvedValue(payload);

      const context = createMockContext({
        headers: { authorization: 'Bearer valid-token' },
      });

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(context.__request.principal).toEqual({
        userId: 'user-1',
        email: 'test@test.com',
        roles: ['user'],
        permissions: ['read'],
      });
    });

    it('should throw TOKEN_EXPIRED for expired JWT', async () => {
      const error = new Error('Token expired');
      error.name = 'TokenExpiredError';
      mockJwtService.verifyAsync.mockRejectedValue(error);

      const context = createMockContext({
        headers: { authorization: 'Bearer expired-token' },
      });

      try {
        await guard.canActivate(context);
        fail('Expected UnauthorizedException');
      } catch (err: any) {
        expect(err).toBeInstanceOf(UnauthorizedException);
        const response = err.getResponse();
        expect(response.code).toBe(ErrorCode.TOKEN_EXPIRED);
      }
    });

    it('should throw TOKEN_INVALID for invalid JWT', async () => {
      mockJwtService.verifyAsync.mockRejectedValue(new Error('Invalid'));

      const context = createMockContext({
        headers: { authorization: 'Bearer bad-token' },
      });

      try {
        await guard.canActivate(context);
        fail('Expected UnauthorizedException');
      } catch (err: any) {
        expect(err).toBeInstanceOf(UnauthorizedException);
        const response = err.getResponse();
        expect(response.code).toBe(ErrorCode.TOKEN_INVALID);
      }
    });
  });

  describe('ALLOW_AUTHENTICATED_KEY', () => {
    it('should allow if ALLOW_AUTHENTICATED_KEY is set and no principal', async () => {
      mockReflector.getAllAndOverride
        .mockReturnValueOnce(false) // IS_PUBLIC_KEY
        .mockReturnValueOnce(true); // ALLOW_AUTHENTICATED_KEY
      mockConfigService.get.mockReturnValue('SESSION');

      const context = createMockContext({ session: {} });

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });
  });
});
