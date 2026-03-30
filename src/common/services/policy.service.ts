import { Injectable } from '@nestjs/common';
import type { Principal } from '../interfaces/principal.interface.js';
import { Role } from '../constants/roles.js';

@Injectable()
export class PolicyService {
  /**
   * Evaluate whether a principal is allowed to perform an action on a resource.
   *
   * Permission format: `${resource}:${action}` (e.g. "products:create")
   * Admin role bypasses all permission checks.
   */
  evaluate(principal: Principal, resource: string, action: string): boolean {
    if (!principal) return false;

    // Admin bypasses all checks
    if (principal.roles?.includes(Role.ADMIN)) return true;

    const requiredPermission = `${resource}:${action}`;
    return (principal.permissions ?? []).includes(requiredPermission);
  }
}
