import { Global, Module } from '@nestjs/common';
import { ClsModule as NestClsModule } from 'nestjs-cls';
import { v4 as uuidv4 } from 'uuid';

@Global()
@Module({
  imports: [
    NestClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
        generateId: true,
        idGenerator: (req: {
          headers?: Record<string, string | undefined>;
        }): string => req.headers?.['x-request-id'] ?? uuidv4(),
      },
    }),
  ],
  exports: [NestClsModule],
})
export class ClsModule {}
