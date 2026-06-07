import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExcludeEndpoint,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';

import { OptionalJwtAuthGuard } from '@/common/guards/optional-jwt-auth.guard';
import { CurrentUser } from '@/modules/auth/decorators/current-user.decorator';
import { OptionalUser } from '@/modules/auth/decorators/optional-user.decorator';
import type { UserEntity } from '@/modules/auth/entities/user.entity';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';

import { CreateIntentResponseDto } from './dto/create-intent-response.dto';
import { CreateIntentDto } from './dto/create-intent.dto';
import { PaymentResponseDto } from './dto/payment-response.dto';
import { PaymentsService } from './payments.service';

const SESSION_HEADER = 'x-cart-session';
const STRIPE_SIGNATURE_HEADER = 'stripe-signature';

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly service: PaymentsService) {}

  @Post('intent')
  @UseGuards(OptionalJwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @ApiHeader({ name: SESSION_HEADER, required: false })
  @ApiOperation({
    summary: 'Create a payment intent for a PENDING order',
  })
  @ApiResponse({ status: 201, type: CreateIntentResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Order is not in PENDING status',
  })
  @ApiResponse({
    status: 403,
    description: 'Caller does not own the order or no session',
  })
  @ApiResponse({ status: 404, description: 'Order not found' })
  @ApiResponse({ status: 409, description: 'Order already paid' })
  async createIntent(
    @OptionalUser() user: UserEntity | undefined,
    @Headers(SESSION_HEADER) session: string | undefined,
    @Body() dto: CreateIntentDto,
  ): Promise<CreateIntentResponseDto> {
    const payment = await this.service.createIntent(dto.orderId, user, session);
    return CreateIntentResponseDto.from(payment);
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers(STRIPE_SIGNATURE_HEADER) signature: string | undefined,
  ): Promise<{ received: true }> {
    if (!signature) {
      // Missing signature is a 400 — the BadRequestException is mapped by the
      // global filter to the canonical error shape.
      throw new BadRequestException('Missing stripe-signature header');
    }
    const rawBody = req.rawBody;
    if (!rawBody) {
      // main.ts must boot with { rawBody: true } for this to be defined.
      throw new BadRequestException('Raw body not available');
    }
    await this.service.handleWebhook(rawBody, signature);
    return { received: true };
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a payment by ID' })
  @ApiResponse({ status: 200, type: PaymentResponseDto })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  @ApiResponse({ status: 403, description: 'Not your payment' })
  @ApiResponse({ status: 404, description: 'Payment not found' })
  async findOne(
    @CurrentUser() user: UserEntity,
    @Param('id') id: string,
  ): Promise<PaymentResponseDto> {
    return PaymentResponseDto.from(
      await this.service.findById(id, { id: user.id, role: user.role }),
    );
  }

  @Get('order/:orderId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List payments for an order' })
  @ApiResponse({ status: 200, type: [PaymentResponseDto] })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  @ApiResponse({ status: 403, description: 'Not your order' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async findByOrder(
    @CurrentUser() user: UserEntity,
    @Param('orderId') orderId: string,
  ): Promise<PaymentResponseDto[]> {
    const payments = await this.service.findByOrder(orderId, {
      id: user.id,
      role: user.role,
    });
    return payments.map((p) => PaymentResponseDto.from(p));
  }
}
