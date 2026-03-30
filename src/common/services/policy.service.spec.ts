import { Test } from '@nestjs/testing';
import { PolicyService } from './policy.service.js';
import { Role } from '../constants/roles.js';
import type { Principal } from '../interfaces/principal.interface.js';

describe('PolicyService', () => {
  let service: PolicyService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [PolicyService],
    }).compile();

    service = module.get(PolicyService);
  });

  it('should return true for admin role (bypass)', () => {
    const principal: Principal = {
      userId: 'admin-1',
      email: 'admin@test.com',
      roles: [Role.ADMIN],
      permissions: [],
    };

    expect(service.evaluate(principal, 'products', 'delete')).toBe(true);
  });

  it('should return true if principal has exact permission', () => {
    const principal: Principal = {
      userId: 'user-1',
      email: 'user@test.com',
      roles: [Role.USER],
      permissions: ['products:create', 'products:read'],
    };

    expect(service.evaluate(principal, 'products', 'create')).toBe(true);
  });

  it('should return false if principal lacks permission', () => {
    const principal: Principal = {
      userId: 'user-1',
      email: 'user@test.com',
      roles: [Role.USER],
      permissions: ['products:read'],
    };

    expect(service.evaluate(principal, 'products', 'delete')).toBe(false);
  });

  it('should return false for null principal', () => {
    expect(service.evaluate(null as any, 'products', 'read')).toBe(false);
  });
});
