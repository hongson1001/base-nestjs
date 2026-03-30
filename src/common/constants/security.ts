/** Session time-to-live in seconds (24 hours) */
export const SESSION_TTL = 86400;

/** Default session secret — override via SESSION_SECRET env var */
export const SESSION_SECRET = 'change-me-in-production';

/** Bcrypt hashing rounds */
export const BCRYPT_ROUNDS = 12;

/** Maximum consecutive failed login attempts before lockout */
export const MAX_LOGIN_ATTEMPTS = 5;

/** Account lockout duration in milliseconds (15 minutes) */
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

/** JWT access token time-to-live */
export const JWT_ACCESS_TTL = '15m';

/** JWT refresh token time-to-live */
export const JWT_REFRESH_TTL = '7d';

/** Minimum password length */
export const PASSWORD_MIN_LENGTH = 8;

/** General rate limit window in seconds */
export const RATE_LIMIT_TTL = 60;

/** General rate limit max requests per window */
export const RATE_LIMIT_MAX = 100;

/** Auth-specific rate limit window in seconds */
export const AUTH_RATE_LIMIT_TTL = 60;

/** Auth-specific rate limit max requests per window */
export const AUTH_RATE_LIMIT_MAX = 5;
