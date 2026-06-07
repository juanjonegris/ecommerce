import { Module } from '@nestjs/common';

import { CartModule } from '@/modules/cart/cart.module';
import { PrismaModule } from '@/prisma/prisma.module';

import { DiscountsController } from './discounts.controller';
import { DiscountsRepository } from './discounts.repository';
import { DiscountsService } from './discounts.service';

@Module({
  imports: [PrismaModule, CartModule],
  controllers: [DiscountsController],
  providers: [DiscountsService, DiscountsRepository],
  exports: [DiscountsService],
})
export class DiscountsModule {}
