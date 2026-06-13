import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validateOrReject } from 'class-validator';

import type { PaginatedResponse } from '@repo/types';

import { Roles } from '@/common/decorators/roles.decorator';
import { RolesGuard } from '@/common/guards/roles.guard';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';

import { FindProductImagesQueryDto } from './dto/find-product-images-query.dto';
import { PresignUploadResponseDto } from './dto/presign-upload-response.dto';
import { PresignUploadDto } from './dto/presign-upload.dto';
import { ProductImageResponseDto } from './dto/product-image-response.dto';
import { ReorderImagesDto } from './dto/reorder-images.dto';
import { UploadDirectMetadataDto } from './dto/upload-direct-metadata.dto';
import { UploadsService } from './uploads.service';

const HARD_FILE_LIMIT_BYTES = 26_214_400;

@ApiTags('uploads')
@Controller('uploads/product-images')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.STAFF)
@ApiBearerAuth()
export class UploadsController {
  constructor(private readonly service: UploadsService) {}

  @Post('presign')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Issue a presigned upload URL (admin only)' })
  @ApiResponse({ status: 201, type: PresignUploadResponseDto })
  @ApiResponse({ status: 400, description: 'Bad mime type or size' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async presign(
    @Body() dto: PresignUploadDto,
  ): Promise<PresignUploadResponseDto> {
    const result = await this.service.presign(dto);
    return {
      imageId: result.imageId,
      uploadUrl: result.uploadUrl,
      requiredHeaders: result.requiredHeaders,
      publicUrl: result.publicUrl,
      expiresAt: result.expiresAt.toISOString(),
      mode: result.mode,
    };
  }

  @Post(':id/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm a presigned upload landed (admin only)' })
  @ApiResponse({ status: 200, type: ProductImageResponseDto })
  @ApiResponse({ status: 400, description: 'Object missing in storage' })
  @ApiResponse({ status: 404, description: 'Image not found' })
  async confirm(@Param('id') id: string): Promise<ProductImageResponseDto> {
    return ProductImageResponseDto.from(await this.service.confirm(id));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: HARD_FILE_LIMIT_BYTES },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        metadata: {
          type: 'string',
          description:
            'JSON-encoded UploadDirectMetadataDto (productId, fileName, mimeType, width?, height?)',
        },
      },
      required: ['file', 'metadata'],
    },
  })
  @ApiOperation({
    summary: 'Server-proxied multipart upload (admin only)',
  })
  @ApiResponse({ status: 201, type: ProductImageResponseDto })
  async uploadDirect(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('metadata') metadataRaw: string,
  ): Promise<ProductImageResponseDto> {
    if (!file) {
      throw new BadRequestException('file field is required');
    }
    const metadata = await parseAndValidateMetadata(metadataRaw);
    return ProductImageResponseDto.from(
      await this.service.uploadDirect(file, metadata),
    );
  }

  @Get()
  @ApiOperation({ summary: 'List product images (admin only, paginated)' })
  @ApiResponse({ status: 200, description: 'Paginated product image list' })
  async findAll(
    @Query() query: FindProductImagesQueryDto,
  ): Promise<PaginatedResponse<ProductImageResponseDto>> {
    const filters = {
      ...(query.productId !== undefined ? { productId: query.productId } : {}),
      ...(query.status !== undefined ? { status: query.status } : {}),
    };
    const result = await this.service.listForAdmin(filters, {
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    });
    return {
      ...result,
      data: result.data.map((r) => ProductImageResponseDto.from(r)),
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a product image by id (admin only)' })
  @ApiResponse({ status: 200, type: ProductImageResponseDto })
  @ApiResponse({ status: 404 })
  async findOne(@Param('id') id: string): Promise<ProductImageResponseDto> {
    return ProductImageResponseDto.from(await this.service.findById(id));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a product image (admin only)' })
  @ApiResponse({ status: 204 })
  async remove(@Param('id') id: string): Promise<void> {
    await this.service.remove(id);
  }

  @Post('reorder')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reorder product images (admin only)' })
  @ApiResponse({ status: 200, type: [ProductImageResponseDto] })
  @ApiResponse({ status: 400, description: 'Cross-product or unknown id' })
  async reorder(
    @Body() dto: ReorderImagesDto,
  ): Promise<ProductImageResponseDto[]> {
    const updated = await this.service.reorder(dto);
    return updated.map((r) => ProductImageResponseDto.from(r));
  }
}

async function parseAndValidateMetadata(
  raw: string,
): Promise<UploadDirectMetadataDto> {
  if (typeof raw !== 'string' || raw.length === 0) {
    throw new BadRequestException('metadata field is required');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new BadRequestException('metadata is not valid JSON');
  }
  const dto = plainToInstance(UploadDirectMetadataDto, parsed);
  try {
    await validateOrReject(dto);
  } catch {
    throw new BadRequestException('metadata failed validation');
  }
  return dto;
}
