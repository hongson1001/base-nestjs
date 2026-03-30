import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { Principal } from '../interfaces/principal.interface.js';

interface RequestWithPrincipal extends Request {
  principal?: Principal;
  user?: Principal;
}

export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Principal | undefined => {
    const request = ctx.switchToHttp().getRequest<RequestWithPrincipal>();
    return request.principal ?? request.user;
  },
);
