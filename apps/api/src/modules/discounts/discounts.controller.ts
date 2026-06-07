import {
  BadRequestException,
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
import { OptionalUser } from '@/modules/auth/decorators/optional-user.decorator';
import type { UserEntity } from '@/modules/auth/entities/user.entity';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import type { CartIdentity } from '@/modules/cart/cart.service';

import { DiscountsService } from './discounts.service';
import { CreateDiscountDto } from './dto/create-discount.dto';
import { DiscountResponseDto } from './dto/discount-response.dto';
import { DiscountValidationResponseDto } from './dto/discount-validation-response.dto';
import { FindDiscountsQueryDto } from './dto/find-discounts-query.dto';
import { UpdateDiscountDto } from './dto/update-discount.dto';
import { ValidateDiscountDto } from './dto/validate-discount.dto';

const SESSION_HEADER = 'x-cart-session';

@ApiTags('discounts')
@Controller('discounts')
export class DiscountsController {
  constructor(private readonly service: DiscountsService) {}

  @Post('validate')
  @UseGuards(OptionalJwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiHeader({ name: SESSION_HEADER, required: false })
  @ApiOperation({
    summary:
      'Validate a discount code against the current cart subtotal (guest or auth)',
  })
  @ApiResponse({ status: 200, type: DiscountValidationResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Expired, empty cart, or missing session',
  })
  @ApiResponse({ status: 404, description: 'Code not found or inactive' })
  async validate(
    @OptionalUser() user: UserEntity | undefined,
    @Headers(SESSION_HEADER) session: string | undefined,
    @Body() dto: ValidateDiscountDto,
  ): Promise<DiscountValidationResponseDto> {
    const identity: CartIdentity | null = user
      ? { type: 'user', id: user.id }
      : session
        ? { type: 'guest', id: session }
        : null;
    if (!identity) {
      throw new BadRequestException(
        'Missing auth token or x-cart-session header',
      );
    }
    const result = await this.service.validate(dto.code, identity);
    return DiscountValidationResponseDto.from(result);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List discount codes (admin only, paginated)' })
  @ApiResponse({ status: 200, description: 'Paginated discount list' })
  async findAll(
    @Query() query: FindDiscountsQueryDto,
  ): Promise<PaginatedResponse<DiscountResponseDto>> {
    const result = await this.service.findAll({
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    });
    return {
      ...result,
      data: result.data.map((d) => DiscountResponseDto.from(d)),
    };
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a discount code by id (admin only)' })
  @ApiResponse({ status: 200, type: DiscountResponseDto })
  @ApiResponse({ status: 404, description: 'Discount not found' })
  async findOne(@Param('id') id: string): Promise<DiscountResponseDto> {
    return DiscountResponseDto.from(await this.service.findById(id));
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a discount code (admin only)' })
  @ApiResponse({ status: 201, type: DiscountResponseDto })
  @ApiResponse({
    status: 400,
    description: 'XOR violation or expiresAt in the past',
  })
  @ApiResponse({ status: 409, description: 'Code already exists' })
  async create(@Body() dto: CreateDiscountDto): Promise<DiscountResponseDto> {
    return DiscountResponseDto.from(await this.service.create(dto));
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a discount code (admin only)' })
  @ApiResponse({ status: 200, type: DiscountResponseDto })
  @ApiResponse({ status: 404, description: 'Discount not found' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateDiscountDto,
  ): Promise<DiscountResponseDto> {
    return DiscountResponseDto.from(await this.service.update(id, dto));
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a discount code (admin only)' })
  @ApiResponse({ status: 204 })
  async remove(@Param('id') id: string): Promise<void> {
    await this.service.remove(id);
  }
}
