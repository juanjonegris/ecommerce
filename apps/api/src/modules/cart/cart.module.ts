import { Module } from '@nestjs/common';

import { HealthModule } from '@/modules/health/health.module';
import { ProductsModule } from '@/modules/products/products.module';

import { CartController } from './cart.controller';
import { CartRepository } from './cart.repository';
import { CartService } from './cart.service';

@Module({
  imports: [HealthModule, ProductsModule],
  controllers: [CartController],
  providers: [CartService, CartRepository],
})
export class CartModule {}
