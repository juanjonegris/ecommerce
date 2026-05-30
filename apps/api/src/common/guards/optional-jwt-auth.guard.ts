import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import type { UserEntity } from '@/modules/auth/entities/user.entity';

// Unlike JwtAuthGuard, a missing or invalid token does not 401 — the request
// proceeds with `req.user` undefined so the route can fall through to guest mode.
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  override handleRequest<TUser = UserEntity>(
    _err: unknown,
    user: TUser | false,
  ): TUser | undefined {
    return user || undefined;
  }
}
