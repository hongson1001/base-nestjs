import { randomBytes, timingSafeEqual } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { ErrorCode } from '../constants/error-codes.js';

const CSRF_COOKIE = 'XSRF-TOKEN';
const CSRF_HEADER = 'x-xsrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export interface CsrfOptions {
  production: boolean;
  sameSite: 'strict' | 'lax';
}

/**
 * Double-submit cookie CSRF protection, matched với Angular `withXsrfConfiguration`:
 *   - Cookie `XSRF-TOKEN` (readable bởi JS, KHÔNG HttpOnly)
 *   - Header `X-XSRF-TOKEN` gửi kèm mutating requests
 *   - Timing-safe compare
 *
 * Issue token trên mọi request nếu chưa có cookie; verify với mọi POST/PUT/PATCH/DELETE.
 */
export function csrfMiddleware(opts: CsrfOptions) {
  return (req: Request, res: Response, next: NextFunction): void => {
    let token = (req.cookies as Record<string, string> | undefined)?.[
      CSRF_COOKIE
    ];

    if (!token) {
      token = randomBytes(32).toString('hex');
      res.cookie(CSRF_COOKIE, token, {
        httpOnly: false,
        secure: opts.production,
        sameSite: opts.sameSite,
        path: '/',
      });
      if (req.cookies)
        (req.cookies as Record<string, string>)[CSRF_COOKIE] = token;
    }

    if (SAFE_METHODS.has(req.method)) return next();

    const headerVal = req.headers[CSRF_HEADER];
    const headerStr = Array.isArray(headerVal) ? headerVal[0] : headerVal;

    if (!headerStr || !safeCompare(headerStr, token)) {
      res.status(403).json({
        success: false,
        data: null,
        errors: [
          {
            code: ErrorCode.CSRF_INVALID,
            message: 'Invalid CSRF token',
            field: null,
          },
        ],
      });
      return;
    }

    next();
  };
}

function safeCompare(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
