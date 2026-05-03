import {
  Body,
  Controller,
  Delete,
  Get,
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
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import type { PaginatedResponse } from '@repo/types';

import { Roles } from '@/common/decorators/roles.decorator';
import { RolesGuard } from '@/common/guards/roles.guard';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';

import { CreateProductDto } from './dto/create-product.dto';
import { FindProductsQueryDto } from './dto/find-products-query.dto';
import { ProductResponseDto } from './dto/product-response.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductsService } from './products.service';

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(private readonly service: ProductsService) {}

  @Get()
  @ApiOperation({
    summary: 'List products (paginated, filterable by category, sortable)',
  })
  @ApiResponse({ status: 200, description: 'Paginated product list' })
  async findAll(
    @Query() query: FindProductsQueryDto,
  ): Promise<PaginatedResponse<ProductResponseDto>> {
    const result = await this.service.findAll(query);
    return {
      ...result,
      data: result.data.map((p) => ProductResponseDto.from(p)),
    };
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Get product by slug' })
  @ApiResponse({ status: 200, type: ProductResponseDto })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async findOne(@Param('slug') slug: string): Promise<ProductResponseDto> {
    return ProductResponseDto.from(await this.service.findBySlug(slug));
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create product (admin only)' })
  @ApiResponse({ status: 201, type: ProductResponseDto })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  @ApiResponse({ status: 403, description: 'Insufficient role' })
  @ApiResponse({ status: 409, description: 'Slug already exists' })
  async create(@Body() dto: CreateProductDto): Promise<ProductResponseDto> {
    return ProductResponseDto.from(await this.service.create(dto));
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update product (admin only)' })
  @ApiResponse({ status: 200, type: ProductResponseDto })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  @ApiResponse({ status: 403, description: 'Insufficient role' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ): Promise<ProductResponseDto> {
    return ProductResponseDto.from(await this.service.update(id, dto));
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete product (admin only)' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  @ApiResponse({ status: 403, description: 'Insufficient role' })
  async remove(@Param('id') id: string): Promise<void> {
    await this.service.remove(id);
  }
}
