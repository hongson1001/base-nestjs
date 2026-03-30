import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

export const RequirePermission = (permissions: string | string[]) =>
  SetMetadata(
    PERMISSIONS_KEY,
    Array.isArray(permissions) ? permissions : [permissions],
  );
