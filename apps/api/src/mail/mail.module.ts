import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { MAIL_SERVICE, ResendMailService } from './mail.service';

/**
 * Provides the MailService implementation under the MAIL_SERVICE token.
 * Global so any module (queues, auth, orders) can inject @Inject(MAIL_SERVICE)
 * without re-importing. Swap ResendMailService here to change providers.
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [{ provide: MAIL_SERVICE, useClass: ResendMailService }],
  exports: [MAIL_SERVICE],
})
export class MailModule {}
