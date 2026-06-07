import type { LoggerService } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { ClsService } from 'nestjs-cls';

import type { AppConfig } from '@/config/configuration';
import { OrdersModule } from '@/modules/orders/orders.module';
import { PrismaModule } from '@/prisma/prisma.module';

import { PaymentsController } from './payments.controller';
import { PaymentsRepository } from './payments.repository';
import { PaymentsService } from './payments.service';
import {
  PAYMENT_PROVIDER,
  type PaymentProviderAdapter,
} from './providers/payment-provider.interface';
import { StripeProvider } from './providers/stripe.provider';
import { StubPaymentProvider } from './providers/stub.provider';
import { WebhookEventsRepository } from './webhook-events.repository';

@Module({
  imports: [PrismaModule, ConfigModule, OrdersModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    PaymentsRepository,
    WebhookEventsRepository,
    {
      provide: PAYMENT_PROVIDER,
      inject: [ConfigService, WINSTON_MODULE_NEST_PROVIDER, ClsService],
      useFactory: (
        config: ConfigService,
        logger: LoggerService,
        cls: ClsService,
      ): PaymentProviderAdapter => {
        const key =
          config.get<AppConfig['STRIPE_SECRET_KEY']>('STRIPE_SECRET_KEY') ?? '';
        return key
          ? new StripeProvider(config, logger, cls)
          : new StubPaymentProvider(logger, cls);
      },
    },
  ],
})
export class PaymentsModule {}
