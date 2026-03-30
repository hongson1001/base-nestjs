import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { PermissionGuard } from './permission.guard.js';

describe('PermissionGuard', () => {
  let guard: PermissionGuard;

  const mockReflector = {
    getAllAndOverride: jest.fn(),
  };

  const createMockContext = (principal?: Record<string, unknown>) => {
    const request = { principal };
    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue(request),
      }),
    } as any;
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        PermissionGuard,
        { provide: Reflector, useValue: mockReflector },
      ],
    }).compile();

    guard = module.get(PermissionGuard);
    jest.clearAllMocks();
  });

  it('should allow if no permissions required', () => {
    mockReflector.getAllAndOverride.mockReturnValue(undefined);
    const context = createMockContext();

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow if required permissions is empty array', () => {
    mockReflector.getAllAndOverride.mockReturnValue([]);
    const context = createMockContext();

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow if principal has required permission', () => {
    mockReflector.getAllAndOverride.mockReturnValue(['products:read']);
    const context = createMockContext({
      userId: 'user-1',
      email: 'test@test.com',
      roles: ['user'],
      permissions: ['products:read', 'products:create'],
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should deny if principal lacks required permission', () => {
    mockReflector.getAllAndOverride.mockReturnValue(['products:delete']);
    const context = createMockContext({
      userId: 'user-1',
      email: 'test@test.com',
      roles: ['user'],
      permissions: ['products:read'],
    });

    expect(guard.canActivate(context)).toBe(false);
  });

  it('should deny if no principal', () => {
    mockReflector.getAllAndOverride.mockReturnValue(['products:read']);
    const context = createMockContext(undefined);

    expect(guard.canActivate(context)).toBe(false);
  });
});
