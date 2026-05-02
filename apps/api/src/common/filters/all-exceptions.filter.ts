import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  LoggerService,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { ClsService } from 'nestjs-cls';

@Injectable()
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
    private readonly cls: ClsService,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();
    const requestId = this.cls.getId();

    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    if (!(exception instanceof HttpException)) {
      this.logger.error(
        {
          message: 'Unhandled exception',
          requestId,
          module: 'AllExceptionsFilter',
          operation: 'catch',
          method: req.method,
          url: req.url,
          error:
            exception instanceof Error ? exception.message : String(exception),
        },
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    const body =
      exception instanceof HttpException
        ? (exception.getResponse() as Record<string, unknown>)
        : {
            statusCode,
            message: 'Internal server error',
            error: 'Internal Server Error',
          };

    res.status(statusCode).json(body);
  }
}
