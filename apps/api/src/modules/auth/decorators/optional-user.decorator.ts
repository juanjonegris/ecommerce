import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import type { UserEntity } from '../entities/user.entity';

// Like CurrentUser, but returns undefined instead of throwing when no user is
// present — for routes behind OptionalJwtAuthGuard that serve guests too.
export const OptionalUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): UserEntity | undefined => {
    const req = ctx
      .switchToHttp()
      .getRequest<Request & { user?: UserEntity }>();
    return req.user;
  },
);
