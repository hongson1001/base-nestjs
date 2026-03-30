import type { Principal } from '../interfaces/principal.interface.js';

declare module 'express-session' {
  interface SessionData {
    principal?: Principal;
  }
}
