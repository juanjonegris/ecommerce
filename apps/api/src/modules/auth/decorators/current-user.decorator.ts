import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import type { UserEntity } from '../entities/user.entity';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): UserEntity => {
    const req = ctx
      .switchToHttp()
      .getRequest<Request & { user?: UserEntity }>();
    if (!req.user) {
      throw new Error(
        'CurrentUser decorator used on a route without JwtAuthGuard',
      );
    }
    return req.user;
  },
);
