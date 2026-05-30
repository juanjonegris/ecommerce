import { randomUUID } from 'node:crypto';

import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';

import { OptionalJwtAuthGuard } from '@/common/guards/optional-jwt-auth.guard';
import { CurrentUser } from '@/modules/auth/decorators/current-user.decorator';
import { OptionalUser } from '@/modules/auth/decorators/optional-user.decorator';
import type { UserEntity } from '@/modules/auth/entities/user.entity';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';

import type { CartIdentity } from './cart.service';
import { CartService } from './cart.service';
import { AddToCartDto } from './dto/add-to-cart.dto';
import { CartResponseDto } from './dto/cart-response.dto';
import { MergeCartDto } from './dto/merge-cart.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';

const SESSION_HEADER = 'x-cart-session';

@ApiTags('cart')
@Controller('cart')
export class CartController {
  constructor(private readonly service: CartService) {}

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiHeader({ name: SESSION_HEADER, required: false })
  @ApiOperation({ summary: 'Get the current cart (guest or authenticated)' })
  @ApiResponse({ status: 200, type: CartResponseDto })
  async getCart(
    @OptionalUser() user: UserEntity | undefined,
    @Headers(SESSION_HEADER) session: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CartResponseDto> {
    const identity = this.resolve(user, session, res);
    const cart = await this.service.getCart(identity);
    return this.toResponse(cart, identity);
  }

  @Post('items')
  @UseGuards(OptionalJwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: SESSION_HEADER, required: false })
  @ApiOperation({ summary: 'Add an item or increment its quantity' })
  @ApiResponse({ status: 200, type: CartResponseDto })
  @ApiResponse({ status: 400, description: 'Product is not available' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async addItem(
    @Body() dto: AddToCartDto,
    @OptionalUser() user: UserEntity | undefined,
    @Headers(SESSION_HEADER) session: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CartResponseDto> {
    const identity = this.resolve(user, session, res);
    const cart = await this.service.addItem(identity, dto);
    return this.toResponse(cart, identity);
  }

  @Patch('items/:productId')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiHeader({ name: SESSION_HEADER, required: false })
  @ApiOperation({ summary: 'Set the exact quantity of a cart item' })
  @ApiResponse({ status: 200, type: CartResponseDto })
  @ApiResponse({ status: 400, description: 'Quantity must be at least 1' })
  @ApiResponse({ status: 404, description: 'Item not in cart' })
  async updateItem(
    @Param('productId') productId: string,
    @Body() dto: UpdateCartItemDto,
    @OptionalUser() user: UserEntity | undefined,
    @Headers(SESSION_HEADER) session: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CartResponseDto> {
    const identity = this.resolve(user, session, res);
    const cart = await this.service.updateQuantity(
      identity,
      productId,
      dto.quantity,
    );
    return this.toResponse(cart, identity);
  }

  @Delete('items/:productId')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiHeader({ name: SESSION_HEADER, required: false })
  @ApiOperation({ summary: 'Remove an item from the cart' })
  @ApiResponse({ status: 200, type: CartResponseDto })
  @ApiResponse({ status: 404, description: 'Item not in cart' })
  async removeItem(
    @Param('productId') productId: string,
    @OptionalUser() user: UserEntity | undefined,
    @Headers(SESSION_HEADER) session: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CartResponseDto> {
    const identity = this.resolve(user, session, res);
    const cart = await this.service.removeItem(identity, productId);
    return this.toResponse(cart, identity);
  }

  @Delete()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiHeader({ name: SESSION_HEADER, required: false })
  @ApiOperation({ summary: 'Clear the entire cart' })
  @ApiResponse({ status: 200, type: CartResponseDto })
  async clear(
    @OptionalUser() user: UserEntity | undefined,
    @Headers(SESSION_HEADER) session: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CartResponseDto> {
    const identity = this.resolve(user, session, res);
    const cart = await this.service.clear(identity);
    return this.toResponse(cart, identity);
  }

  @Post('merge')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Merge a guest cart into the authenticated cart' })
  @ApiResponse({ status: 200, type: CartResponseDto })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  async merge(
    @CurrentUser() user: UserEntity,
    @Body() dto: MergeCartDto,
  ): Promise<CartResponseDto> {
    const cart = await this.service.merge(user, dto.sessionId);
    return CartResponseDto.from(cart);
  }

  // Identity is an HTTP concern: pick user vs guest, and for guests generate +
  // echo the session id so the client can persist it across requests.
  private resolve(
    user: UserEntity | undefined,
    sessionHeader: string | undefined,
    res: Response,
  ): CartIdentity {
    if (user) return { type: 'user', id: user.id };
    const sessionId = sessionHeader ?? randomUUID();
    res.setHeader('X-Cart-Session', sessionId);
    return { type: 'guest', id: sessionId };
  }

  private toResponse(
    cart: Parameters<typeof CartResponseDto.from>[0],
    identity: CartIdentity,
  ): CartResponseDto {
    return CartResponseDto.from(
      cart,
      identity.type === 'guest' ? identity.id : undefined,
    );
  }
}
