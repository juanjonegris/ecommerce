import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExcludeEndpoint,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import type { Request } from 'express';

import type { PaginatedResponse } from '@repo/types';

import { Roles } from '@/common/decorators/roles.decorator';
import { RolesGuard } from '@/common/guards/roles.guard';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';

import { ConfirmQueryDto } from './dto/confirm-query.dto';
import { ConfirmResponseDto } from './dto/confirm-response.dto';
import { FindNewsletterQueryDto } from './dto/find-newsletter-query.dto';
import { NewsletterSubscriberResponseDto } from './dto/newsletter-subscriber-response.dto';
import {
  ACCEPTED_RESPONSE,
  SubscribeResponseDto,
} from './dto/subscribe-response.dto';
import { SubscribeDto } from './dto/subscribe.dto';
import { UnsubscribeDto } from './dto/unsubscribe.dto';
import { NewsletterService } from './newsletter.service';
import {
  NEWSLETTER_PROVIDER,
  type NewsletterProviderAdapter,
} from './providers/newsletter-provider.interface';

const PUBLIC_THROTTLE = { default: { limit: 5, ttl: 60_000 } };

@ApiTags('newsletter')
@Controller('newsletter')
export class NewsletterController {
  constructor(
    private readonly service: NewsletterService,
    @Inject(NEWSLETTER_PROVIDER)
    private readonly provider: NewsletterProviderAdapter,
  ) {}

  // --------------------------------------------------------------------------
  // Public — anti-enumeration shape on every response (plan D3).
  // --------------------------------------------------------------------------

  @Post('subscribe')
  @Throttle(PUBLIC_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Subscribe an email to the newsletter' })
  @ApiResponse({ status: 200, type: SubscribeResponseDto })
  async subscribe(@Body() dto: SubscribeDto): Promise<SubscribeResponseDto> {
    await this.service.subscribe(dto);
    return ACCEPTED_RESPONSE;
  }

  @Get('confirm')
  @Throttle(PUBLIC_THROTTLE)
  @ApiOperation({ summary: 'Confirm a subscription via tokenized link' })
  @ApiResponse({ status: 200, type: ConfirmResponseDto })
  async confirm(@Query() query: ConfirmQueryDto): Promise<ConfirmResponseDto> {
    const status = await this.service.confirm(query.token);
    return { status };
  }

  @Post('unsubscribe')
  @Throttle(PUBLIC_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unsubscribe an email (with or without token)' })
  @ApiResponse({ status: 200, type: SubscribeResponseDto })
  async unsubscribe(
    @Body() dto: UnsubscribeDto,
  ): Promise<SubscribeResponseDto> {
    await this.service.unsubscribe(dto);
    return ACCEPTED_RESPONSE;
  }

  @Post('webhooks/:provider')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  async webhook(
    @Param('provider') _providerParam: string,
    @Req() req: RawBodyRequest<Request>,
  ): Promise<{ received: true }> {
    const rawBody = req.rawBody ?? Buffer.alloc(0);
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (typeof v === 'string') headers[k.toLowerCase()] = v;
      else if (Array.isArray(v) && v[0] !== undefined) {
        headers[k.toLowerCase()] = v[0];
      }
    }
    // Mailchimp passes its shared secret in `?s=…` — expose it via a
    // synthetic header so the provider's verifyWebhook stays transport-agnostic.
    const querySecret = req.query.s;
    if (typeof querySecret === 'string')
      headers['mailchimp-secret'] = querySecret;

    const verified = await this.provider.verifyWebhook(rawBody, headers);
    if (verified) {
      await this.service.handleWebhook(this.provider.name, verified);
    }
    return { received: true };
  }

  // --------------------------------------------------------------------------
  // Admin / Staff
  // --------------------------------------------------------------------------

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List subscribers (admin only, paginated)' })
  @ApiResponse({ status: 200, description: 'Paginated subscriber list' })
  async findAll(
    @Query() query: FindNewsletterQueryDto,
  ): Promise<PaginatedResponse<NewsletterSubscriberResponseDto>> {
    const filters = {
      ...(query.status !== undefined ? { status: query.status } : {}),
      ...(query.syncState !== undefined ? { syncState: query.syncState } : {}),
      ...(query.provider !== undefined ? { provider: query.provider } : {}),
      ...(query.search !== undefined ? { search: query.search } : {}),
    };
    const result = await this.service.listForAdmin(filters, {
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    });
    return {
      ...result,
      data: result.data.map((s) => NewsletterSubscriberResponseDto.from(s)),
    };
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a subscriber by id (admin only)' })
  @ApiResponse({ status: 200, type: NewsletterSubscriberResponseDto })
  @ApiResponse({ status: 404 })
  async findOne(
    @Param('id') id: string,
  ): Promise<NewsletterSubscriberResponseDto> {
    return NewsletterSubscriberResponseDto.from(
      await this.service.findById(id),
    );
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Hard-delete a subscriber (GDPR erasure, admin only)',
  })
  @ApiResponse({ status: 204 })
  async remove(@Param('id') id: string): Promise<void> {
    await this.service.remove(id);
  }

  @Post(':id/resync')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Force a provider resync (admin only)' })
  @ApiResponse({ status: 202, type: NewsletterSubscriberResponseDto })
  @ApiResponse({
    status: 409,
    description: 'Stored provider differs from bound provider',
  })
  async resync(
    @Param('id') id: string,
  ): Promise<NewsletterSubscriberResponseDto> {
    return NewsletterSubscriberResponseDto.from(
      await this.service.forceResync(id),
    );
  }

  @Post(':id/unsubscribe')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin-forced unsubscribe (admin only)' })
  @ApiResponse({ status: 200, type: NewsletterSubscriberResponseDto })
  async adminUnsubscribe(
    @Param('id') id: string,
  ): Promise<NewsletterSubscriberResponseDto> {
    return NewsletterSubscriberResponseDto.from(
      await this.service.forceUnsubscribe(id),
    );
  }
}
