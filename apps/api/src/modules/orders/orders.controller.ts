import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import type { PaginatedResponse } from '@repo/types';

import { Roles } from '@/common/decorators/roles.decorator';
import { OptionalJwtAuthGuard } from '@/common/guards/optional-jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { CurrentUser } from '@/modules/auth/decorators/current-user.decorator';
import { OptionalUser } from '@/modules/auth/decorators/optional-user.decorator';
import type { UserEntity } from '@/modules/auth/entities/user.entity';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';

import { CreateOrderDto } from './dto/create-order.dto';
import { FindOrdersQueryDto } from './dto/find-orders-query.dto';
import { OrderResponseDto } from './dto/order-response.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrdersService } from './orders.service';

const SESSION_HEADER = 'x-cart-session';

@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly service: OrdersService) {}

  @Post()
  @UseGuards(OptionalJwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiHeader({ name: SESSION_HEADER, required: false })
  @ApiOperation({ summary: 'Create an order from the current cart' })
  @ApiResponse({ status: 201, type: OrderResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Empty cart or unavailable product',
  })
  async create(
    @OptionalUser() user: UserEntity | undefined,
    @Headers(SESSION_HEADER) session: string | undefined,
    @Body() dto: CreateOrderDto,
  ): Promise<OrderResponseDto> {
    return OrderResponseDto.from(await this.service.create(user, session, dto));
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List orders (own orders for customers, all for admin)',
  })
  @ApiResponse({ status: 200, description: 'Paginated order list' })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  async findAll(
    @CurrentUser() user: UserEntity,
    @Query() query: FindOrdersQueryDto,
  ): Promise<PaginatedResponse<OrderResponseDto>> {
    const result = await this.service.findAll(user.id, user.role, query);
    return {
      ...result,
      data: result.data.map((o) => OrderResponseDto.from(o)),
    };
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get an order by ID' })
  @ApiResponse({ status: 200, type: OrderResponseDto })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  @ApiResponse({ status: 403, description: 'Not your order' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async findOne(
    @CurrentUser() user: UserEntity,
    @Param('id') id: string,
  ): Promise<OrderResponseDto> {
    return OrderResponseDto.from(
      await this.service.findById(id, user.id, user.role),
    );
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Transition an order status (admin only)' })
  @ApiResponse({ status: 200, type: OrderResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid status transition' })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  @ApiResponse({ status: 403, description: 'Insufficient role' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async updateStatus(
    @CurrentUser() user: UserEntity,
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
  ): Promise<OrderResponseDto> {
    return OrderResponseDto.from(
      await this.service.transitionStatus(id, dto.status, user),
    );
  }

  @Post(':id/cancel')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel an order' })
  @ApiResponse({ status: 200, type: OrderResponseDto })
  @ApiResponse({ status: 400, description: 'Order cannot be cancelled' })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  @ApiResponse({ status: 403, description: 'Not allowed to cancel' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async cancel(
    @CurrentUser() user: UserEntity,
    @Param('id') id: string,
  ): Promise<OrderResponseDto> {
    return OrderResponseDto.from(await this.service.cancel(id, user));
  }
}
