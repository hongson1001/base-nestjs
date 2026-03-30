import { applyDecorators } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  AUTH_RATE_LIMIT_TTL,
  AUTH_RATE_LIMIT_MAX,
} from '../constants/security.js';

export const ThrottleAuth = () =>
  applyDecorators(
    Throttle({
      default: {
        ttl: AUTH_RATE_LIMIT_TTL * 1000,
        limit: AUTH_RATE_LIMIT_MAX,
      },
    }),
  );
