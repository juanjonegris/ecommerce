import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  LoggerService,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { ClsService } from 'nestjs-cls';
import { Observable, tap } from 'rxjs';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
    private readonly cls: ClsService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const { method, url } = req;
    const requestId = this.cls.getId();
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const statusCode = context
            .switchToHttp()
            .getResponse<Response>().statusCode;
          this.logger.log({
            message: 'Request completed',
            requestId,
            module: 'LoggingInterceptor',
            operation: 'request',
            method,
            url,
            statusCode,
            duration: Date.now() - start,
          });
        },
        error: () => {
          this.logger.log({
            message: 'Request failed',
            requestId,
            module: 'LoggingInterceptor',
            operation: 'request',
            method,
            url,
            duration: Date.now() - start,
          });
        },
      }),
    );
  }
}
