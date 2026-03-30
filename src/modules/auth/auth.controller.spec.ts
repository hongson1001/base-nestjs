import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: Record<string, jest.Mock>;

  beforeEach(async () => {
    authService = {
      login: jest.fn(),
      register: jest.fn(),
      logout: jest.fn(),
      changePassword: jest.fn(),
      refreshToken: jest.fn(),
      getProfile: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('login()', () => {
    it('should call authService.login with dto and request', async () => {
      const dto = { email: 'test@example.com', password: 'Pass123!' };
      const req = { ip: '127.0.0.1' } as any;
      const expected = { accessToken: 'token', user: {} };
      authService.login.mockResolvedValue(expected);

      const result = await controller.login(dto, req);

      expect(authService.login).toHaveBeenCalledWith(dto, req);
      expect(result).toEqual(expected);
    });
  });

  describe('register()', () => {
    it('should call authService.register with dto', async () => {
      const dto = {
        email: 'new@example.com',
        password: 'Pass123!',
        fullName: 'New User',
      };
      const expected = { _id: '123', email: dto.email, fullName: dto.fullName };
      authService.register.mockResolvedValue(expected);

      const result = await controller.register(dto);

      expect(authService.register).toHaveBeenCalledWith(dto);
      expect(result).toEqual(expected);
    });
  });

  describe('logout()', () => {
    it('should call authService.logout and clear cookie', async () => {
      authService.logout.mockResolvedValue(undefined);
      const req = {} as any;
      const res = { clearCookie: jest.fn() } as any;

      const result = await controller.logout(req, res);

      expect(authService.logout).toHaveBeenCalledWith(req);
      expect(res.clearCookie).toHaveBeenCalledWith('connect.sid');
      expect(result).toEqual({ message: 'Logged out successfully' });
    });
  });

  describe('changePassword()', () => {
    it('should call authService.changePassword with userId and dto', async () => {
      const principal = {
        userId: '507f1f77bcf86cd799439011',
        email: 'test@example.com',
        roles: ['user'],
        permissions: [],
      };
      const dto = {
        currentPassword: 'OldPass123!',
        newPassword: 'NewPass456!',
        confirmPassword: 'NewPass456!',
      };
      authService.changePassword.mockResolvedValue(undefined);

      const result = await controller.changePassword(principal, dto);

      expect(authService.changePassword).toHaveBeenCalledWith(
        principal.userId,
        dto,
      );
      expect(result).toEqual({ message: 'Password changed successfully' });
    });
  });

  describe('refresh()', () => {
    it('should call authService.refreshToken with token', async () => {
      const expected = {
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
      };
      authService.refreshToken.mockResolvedValue(expected);

      const result = await controller.refresh('refresh-token-value');

      expect(authService.refreshToken).toHaveBeenCalledWith(
        'refresh-token-value',
      );
      expect(result).toEqual(expected);
    });
  });

  describe('getProfile()', () => {
    it('should call authService.getProfile with userId', async () => {
      const principal = {
        userId: '507f1f77bcf86cd799439011',
        email: 'test@example.com',
        roles: ['user'],
        permissions: [],
      };
      const expected = {
        _id: principal.userId,
        email: principal.email,
        fullName: 'Test User',
      };
      authService.getProfile.mockResolvedValue(expected);

      const result = await controller.getProfile(principal);

      expect(authService.getProfile).toHaveBeenCalledWith(principal.userId);
      expect(result).toEqual(expected);
    });
  });
});
