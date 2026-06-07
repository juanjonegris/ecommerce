import { Module } from '@nestjs/common';

import { CartModule } from '@/modules/cart/cart.module';
import { ProductsModule } from '@/modules/products/products.module';
import { PrismaModule } from '@/prisma/prisma.module';
import { QueuesModule } from '@/queues/queues.module';

import { OrdersController } from './orders.controller';
import { OrdersRepository } from './orders.repository';
import { OrdersService } from './orders.service';

@Module({
  imports: [PrismaModule, ProductsModule, CartModule, QueuesModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrdersRepository],
  exports: [OrdersService],
})
export class OrdersModule {}
