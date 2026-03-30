import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service.js';
import { AuthRepository } from './auth.repository.js';
import { AuthErrorCode } from './constants/auth-error-codes.js';

jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
  genSalt: jest.fn(),
}));

const mockObjectId = '507f1f77bcf86cd799439011';

function createMockUser(overrides: Record<string, unknown> = {}) {
  const user = {
    _id: { toString: () => mockObjectId },
    email: 'test@example.com',
    password: '$2b$12$hashedpassword',
    fullName: 'Test User',
    roles: ['user'],
    permissions: ['read'],
    isActive: true,
    lockUntil: null as Date | null,
    loginAttempts: 0,
    refreshToken: '$2b$12$hashedRefreshToken',
    comparePassword: jest.fn<Promise<boolean>, [string]>(),
    toObject: jest.fn(),
    ...overrides,
  };
  user.toObject.mockReturnValue({
    _id: mockObjectId,
    email: user.email,
    password: user.password,
    fullName: user.fullName,
    roles: user.roles,
    permissions: user.permissions,
    isActive: user.isActive,
    refreshToken: user.refreshToken,
    twoFactorSecret: 'secret',
    loginAttempts: user.loginAttempts,
    lockUntil: user.lockUntil,
  });
  return user;
}

describe('AuthService', () => {
  let service: AuthService;
  let authRepository: Record<string, jest.Mock>;
  let configService: Record<string, jest.Mock>;
  let jwtService: Record<string, jest.Mock>;

  beforeEach(async () => {
    authRepository = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      createUser: jest.fn(),
      updateUser: jest.fn(),
      incrementLoginAttempts: jest.fn(),
      resetLoginAttempts: jest.fn(),
      updateLastLogin: jest.fn(),
      updateRefreshToken: jest.fn(),
    };

    configService = {
      get: jest.fn((key: string, defaultVal?: string) => {
        const map: Record<string, string> = {
          AUTH_MODE: 'jwt',
          JWT_SECRET: 'test-jwt-secret',
          JWT_REFRESH_SECRET: 'test-jwt-refresh-secret',
        };
        return map[key] ?? defaultVal;
      }),
    };

    jwtService = {
      signAsync: jest.fn(),
      verify: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: AuthRepository, useValue: authRepository },
        { provide: ConfigService, useValue: configService },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // login()
  // ---------------------------------------------------------------------------
  describe('login()', () => {
    const loginDto = { email: 'test@example.com', password: 'Password123!' };
    const mockReq = {} as any;

    it('should return tokens and user for valid credentials (jwt mode)', async () => {
      const user = createMockUser();
      user.comparePassword.mockResolvedValue(true);
      authRepository.findByEmail.mockResolvedValue(user);
      authRepository.resetLoginAttempts.mockResolvedValue(user);
      authRepository.updateLastLogin.mockResolvedValue(user);
      authRepository.updateRefreshToken.mockResolvedValue(user);

      jwtService.signAsync
        .mockResolvedValueOnce('access-token-value')
        .mockResolvedValueOnce('refresh-token-value');

      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-refresh');

      const result = await service.login(loginDto, mockReq);

      expect(result).toEqual({
        accessToken: 'access-token-value',
        refreshToken: 'refresh-token-value',
        user: {
          userId: mockObjectId,
          email: 'test@example.com',
          roles: ['user'],
          permissions: ['read'],
        },
      });
      expect(authRepository.resetLoginAttempts).toHaveBeenCalledWith(
        mockObjectId,
      );
      expect(authRepository.updateLastLogin).toHaveBeenCalledWith(mockObjectId);
      expect(authRepository.updateRefreshToken).toHaveBeenCalledWith(
        mockObjectId,
        'hashed-refresh',
      );
    });

    it('should return user principal for valid credentials (session mode)', async () => {
      // Recreate service with session mode
      configService.get.mockImplementation(
        (key: string, defaultVal?: string) => {
          const map: Record<string, string> = {
            AUTH_MODE: 'session',
            JWT_SECRET: 'test-jwt-secret',
            JWT_REFRESH_SECRET: 'test-jwt-refresh-secret',
          };
          return map[key] ?? defaultVal;
        },
      );

      const sessionModule = await Test.createTestingModule({
        providers: [
          AuthService,
          { provide: AuthRepository, useValue: authRepository },
          { provide: ConfigService, useValue: configService },
          { provide: JwtService, useValue: jwtService },
        ],
      }).compile();

      const sessionService = sessionModule.get<AuthService>(AuthService);

      const user = createMockUser();
      user.comparePassword.mockResolvedValue(true);
      authRepository.findByEmail.mockResolvedValue(user);
      authRepository.resetLoginAttempts.mockResolvedValue(user);
      authRepository.updateLastLogin.mockResolvedValue(user);

      const sessionReq = { session: {} } as any;

      const result = await sessionService.login(loginDto, sessionReq);

      expect(result).toEqual({
        user: {
          userId: mockObjectId,
          email: 'test@example.com',
          roles: ['user'],
          permissions: ['read'],
        },
      });
      expect(sessionReq.session.principal).toEqual({
        userId: mockObjectId,
        email: 'test@example.com',
        roles: ['user'],
        permissions: ['read'],
      });
    });

    it('should throw INVALID_CREDENTIALS for wrong email', async () => {
      authRepository.findByEmail.mockResolvedValue(null);

      await expect(service.login(loginDto, mockReq)).rejects.toThrow(
        UnauthorizedException,
      );

      try {
        await service.login(loginDto, mockReq);
      } catch (e: any) {
        expect(e.response.code).toBe(AuthErrorCode.INVALID_CREDENTIALS);
      }
    });

    it('should throw INVALID_CREDENTIALS for wrong password and increment login attempts', async () => {
      const user = createMockUser();
      user.comparePassword.mockResolvedValue(false);
      authRepository.findByEmail.mockResolvedValue(user);
      authRepository.incrementLoginAttempts.mockResolvedValue(user);

      await expect(service.login(loginDto, mockReq)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(authRepository.incrementLoginAttempts).toHaveBeenCalledWith(
        mockObjectId,
      );
    });

    it('should throw ACCOUNT_DISABLED for inactive user', async () => {
      const user = createMockUser({ isActive: false });
      authRepository.findByEmail.mockResolvedValue(user);

      await expect(service.login(loginDto, mockReq)).rejects.toThrow(
        ForbiddenException,
      );

      try {
        await service.login(loginDto, mockReq);
      } catch (e: any) {
        expect(e.response.code).toBe(AuthErrorCode.ACCOUNT_DISABLED);
      }
    });

    it('should throw ACCOUNT_LOCKED for locked user', async () => {
      const futureDate = new Date(Date.now() + 600_000);
      const user = createMockUser({ lockUntil: futureDate });
      authRepository.findByEmail.mockResolvedValue(user);

      await expect(service.login(loginDto, mockReq)).rejects.toThrow(
        ForbiddenException,
      );

      try {
        await service.login(loginDto, mockReq);
      } catch (e: any) {
        expect(e.response.code).toBe(AuthErrorCode.ACCOUNT_LOCKED);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // register()
  // ---------------------------------------------------------------------------
  describe('register()', () => {
    const registerDto = {
      email: 'new@example.com',
      password: 'Password123!',
      fullName: 'New User',
    };

    it('should create user and return without password', async () => {
      authRepository.findByEmail.mockResolvedValue(null);

      const createdUser = createMockUser({
        email: 'new@example.com',
        fullName: 'New User',
      });
      createdUser.toObject.mockReturnValue({
        _id: mockObjectId,
        email: 'new@example.com',
        fullName: 'New User',
        password: 'hashed',
        refreshToken: 'token',
        twoFactorSecret: 'secret',
      });
      authRepository.createUser.mockResolvedValue(createdUser);

      const result = await service.register(registerDto);

      expect(result).toEqual({
        _id: mockObjectId,
        email: 'new@example.com',
        fullName: 'New User',
      });
      expect(result).not.toHaveProperty('password');
      expect(result).not.toHaveProperty('refreshToken');
      expect(result).not.toHaveProperty('twoFactorSecret');
      expect(authRepository.createUser).toHaveBeenCalledWith({
        email: 'new@example.com',
        password: 'Password123!',
        fullName: 'New User',
      });
    });

    it('should throw EMAIL_ALREADY_EXISTS for duplicate email', async () => {
      authRepository.findByEmail.mockResolvedValue(createMockUser());

      await expect(service.register(registerDto)).rejects.toThrow(
        ConflictException,
      );

      try {
        await service.register(registerDto);
      } catch (e: any) {
        expect(e.response.code).toBe(AuthErrorCode.EMAIL_ALREADY_EXISTS);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // logout()
  // ---------------------------------------------------------------------------
  describe('logout()', () => {
    it('should clear refresh token in jwt mode', async () => {
      authRepository.updateRefreshToken.mockResolvedValue(null);

      const req = {
        principal: {
          userId: mockObjectId,
          email: 'test@example.com',
          roles: ['user'],
          permissions: [],
        },
      } as any;

      await service.logout(req);

      expect(authRepository.updateRefreshToken).toHaveBeenCalledWith(
        mockObjectId,
        null,
      );
    });

    it('should destroy session in session mode', async () => {
      configService.get.mockImplementation(
        (key: string, defaultVal?: string) => {
          const map: Record<string, string> = {
            AUTH_MODE: 'session',
            JWT_SECRET: 'test-jwt-secret',
            JWT_REFRESH_SECRET: 'test-jwt-refresh-secret',
          };
          return map[key] ?? defaultVal;
        },
      );

      const sessionModule = await Test.createTestingModule({
        providers: [
          AuthService,
          { provide: AuthRepository, useValue: authRepository },
          { provide: ConfigService, useValue: configService },
          { provide: JwtService, useValue: jwtService },
        ],
      }).compile();

      const sessionService = sessionModule.get<AuthService>(AuthService);

      const destroyFn = jest.fn((cb: (err?: Error) => void) => cb());
      const req = { session: { destroy: destroyFn } } as any;

      await sessionService.logout(req);

      expect(destroyFn).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // changePassword()
  // ---------------------------------------------------------------------------
  describe('changePassword()', () => {
    const dto = {
      currentPassword: 'OldPass123!',
      newPassword: 'NewPass456!',
      confirmPassword: 'NewPass456!',
    };

    it('should change password successfully', async () => {
      const user = createMockUser();
      user.comparePassword.mockResolvedValue(true);
      authRepository.findById.mockResolvedValue(user);
      authRepository.updateUser.mockResolvedValue(user);

      (bcrypt.genSalt as jest.Mock).mockResolvedValue('mock-salt');
      (bcrypt.hash as jest.Mock).mockResolvedValue('new-hashed-password');

      await service.changePassword(mockObjectId, dto);

      expect(bcrypt.genSalt).toHaveBeenCalled();
      expect(bcrypt.hash).toHaveBeenCalledWith('NewPass456!', 'mock-salt');
      expect(authRepository.updateUser).toHaveBeenCalledWith(mockObjectId, {
        password: 'new-hashed-password',
      });
    });

    it('should throw CURRENT_PASSWORD_INCORRECT for wrong current password', async () => {
      const user = createMockUser();
      user.comparePassword.mockResolvedValue(false);
      authRepository.findById.mockResolvedValue(user);

      await expect(service.changePassword(mockObjectId, dto)).rejects.toThrow(
        BadRequestException,
      );

      try {
        await service.changePassword(mockObjectId, dto);
      } catch (e: any) {
        expect(e.response.code).toBe(AuthErrorCode.CURRENT_PASSWORD_INCORRECT);
      }
    });

    it('should throw PASSWORD_MISMATCH if new password equals current password', async () => {
      const samePasswordDto = {
        currentPassword: 'SamePass123!',
        newPassword: 'SamePass123!',
        confirmPassword: 'SamePass123!',
      };

      const user = createMockUser();
      user.comparePassword.mockResolvedValue(true);
      authRepository.findById.mockResolvedValue(user);

      await expect(
        service.changePassword(mockObjectId, samePasswordDto),
      ).rejects.toThrow(BadRequestException);

      try {
        await service.changePassword(mockObjectId, samePasswordDto);
      } catch (e: any) {
        expect(e.response.code).toBe(AuthErrorCode.PASSWORD_MISMATCH);
      }
    });

    it('should throw INVALID_CREDENTIALS for non-existent user', async () => {
      authRepository.findById.mockResolvedValue(null);

      await expect(service.changePassword(mockObjectId, dto)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // refreshToken()
  // ---------------------------------------------------------------------------
  describe('refreshToken()', () => {
    it('should return new tokens for valid refresh token', async () => {
      const user = createMockUser();
      const payload = {
        sub: mockObjectId,
        email: 'test@example.com',
        roles: ['user'],
        permissions: ['read'],
      };

      jwtService.verify.mockReturnValue(payload);
      authRepository.findById.mockResolvedValue(user);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      jwtService.signAsync
        .mockResolvedValueOnce('new-access-token')
        .mockResolvedValueOnce('new-refresh-token');

      (bcrypt.hash as jest.Mock).mockResolvedValue('new-hashed-refresh');
      authRepository.updateRefreshToken.mockResolvedValue(user);

      const result = await service.refreshToken('valid-refresh-token');

      expect(result).toEqual({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      });
      expect(jwtService.verify).toHaveBeenCalledWith('valid-refresh-token', {
        secret: 'test-jwt-refresh-secret',
      });
      expect(authRepository.updateRefreshToken).toHaveBeenCalledWith(
        mockObjectId,
        'new-hashed-refresh',
      );
    });

    it('should throw REFRESH_TOKEN_EXPIRED for expired token', async () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('jwt expired');
      });

      await expect(service.refreshToken('expired-token')).rejects.toThrow(
        UnauthorizedException,
      );

      try {
        await service.refreshToken('expired-token');
      } catch (e: any) {
        expect(e.response.code).toBe(AuthErrorCode.REFRESH_TOKEN_EXPIRED);
      }
    });

    it('should throw REFRESH_TOKEN_INVALID for mismatched token', async () => {
      const payload = {
        sub: mockObjectId,
        email: 'test@example.com',
        roles: ['user'],
        permissions: ['read'],
      };

      jwtService.verify.mockReturnValue(payload);
      authRepository.findById.mockResolvedValue(createMockUser());
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.refreshToken('bad-token')).rejects.toThrow(
        UnauthorizedException,
      );

      try {
        await service.refreshToken('bad-token');
      } catch (e: any) {
        expect(e.response.code).toBe(AuthErrorCode.REFRESH_TOKEN_INVALID);
      }
    });

    it('should throw REFRESH_TOKEN_INVALID when user has no stored refresh token', async () => {
      const payload = {
        sub: mockObjectId,
        email: 'test@example.com',
        roles: ['user'],
        permissions: ['read'],
      };

      jwtService.verify.mockReturnValue(payload);
      authRepository.findById.mockResolvedValue(
        createMockUser({ refreshToken: null }),
      );

      await expect(service.refreshToken('some-token')).rejects.toThrow(
        UnauthorizedException,
      );

      try {
        await service.refreshToken('some-token');
      } catch (e: any) {
        expect(e.response.code).toBe(AuthErrorCode.REFRESH_TOKEN_INVALID);
      }
    });

    it('should throw REFRESH_TOKEN_INVALID when not in jwt mode', async () => {
      configService.get.mockImplementation(
        (key: string, defaultVal?: string) => {
          const map: Record<string, string> = {
            AUTH_MODE: 'session',
            JWT_SECRET: 'test-jwt-secret',
            JWT_REFRESH_SECRET: 'test-jwt-refresh-secret',
          };
          return map[key] ?? defaultVal;
        },
      );

      const sessionModule = await Test.createTestingModule({
        providers: [
          AuthService,
          { provide: AuthRepository, useValue: authRepository },
          { provide: ConfigService, useValue: configService },
          { provide: JwtService, useValue: jwtService },
        ],
      }).compile();

      const sessionService = sessionModule.get<AuthService>(AuthService);

      await expect(sessionService.refreshToken('token')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // getProfile()
  // ---------------------------------------------------------------------------
  describe('getProfile()', () => {
    it('should return user without sensitive fields', async () => {
      const user = createMockUser();
      authRepository.findById.mockResolvedValue(user);

      const result = await service.getProfile(mockObjectId);

      expect(result).not.toHaveProperty('password');
      expect(result).not.toHaveProperty('refreshToken');
      expect(result).not.toHaveProperty('twoFactorSecret');
      expect(result).not.toHaveProperty('loginAttempts');
      expect(result).not.toHaveProperty('lockUntil');
      expect(result).toHaveProperty('email', 'test@example.com');
      expect(result).toHaveProperty('fullName', 'Test User');
    });

    it('should throw for non-existent user', async () => {
      authRepository.findById.mockResolvedValue(null);

      await expect(service.getProfile('nonexistent-id')).rejects.toThrow(
        UnauthorizedException,
      );

      try {
        await service.getProfile('nonexistent-id');
      } catch (e: any) {
        expect(e.response.code).toBe(AuthErrorCode.INVALID_CREDENTIALS);
      }
    });
  });
});
