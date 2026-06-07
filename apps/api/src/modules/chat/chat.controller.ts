import {
  BadRequestException,
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
import type { CartIdentity } from '@/modules/cart/cart.service';

import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { ConversationListItemResponseDto } from './dto/conversation-list-item-response.dto';
import { ConversationResponseDto } from './dto/conversation-response.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { FindConversationsQueryDto } from './dto/find-conversations-query.dto';
import { GetMessagesQueryDto } from './dto/get-messages-query.dto';
import { MessageResponseDto } from './dto/message-response.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';

const SESSION_HEADER = 'x-cart-session';

@ApiTags('chat')
@Controller('chat')
export class ChatController {
  constructor(
    private readonly service: ChatService,
    private readonly gateway: ChatGateway,
  ) {}

  // --------------------------------------------------------------------------
  // Customer endpoints (guest + auth)
  // --------------------------------------------------------------------------

  @Get('me')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth()
  @ApiHeader({ name: SESSION_HEADER, required: false })
  @ApiOperation({
    summary:
      "Get or create the caller's open conversation (guest or auth). Returns conversation + first page of messages.",
  })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 400, description: 'Missing auth and session header' })
  async getMyConversation(
    @OptionalUser() user: UserEntity | undefined,
    @Headers(SESSION_HEADER) session: string | undefined,
  ): Promise<{
    conversation: ConversationResponseDto;
    messages: MessageResponseDto[];
  }> {
    const identity = this.resolveIdentity(user, session);
    const conv = await this.service.getOrCreateMyConversation(identity);
    const messages = await this.service.getMessages(
      conv.id,
      { limit: 50 },
      identity,
    );
    return {
      conversation: ConversationResponseDto.from(conv),
      messages: messages.map((m) => MessageResponseDto.from(m)),
    };
  }

  @Get('me/messages')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth()
  @ApiHeader({ name: SESSION_HEADER, required: false })
  @ApiOperation({ summary: "Paginate the caller's conversation history" })
  @ApiResponse({ status: 200, type: [MessageResponseDto] })
  async getMyMessages(
    @OptionalUser() user: UserEntity | undefined,
    @Headers(SESSION_HEADER) session: string | undefined,
    @Query() query: GetMessagesQueryDto,
  ): Promise<MessageResponseDto[]> {
    const identity = this.resolveIdentity(user, session);
    const conv = await this.service.findMyConversation(identity);
    const messages = await this.service.getMessages(conv.id, query, identity);
    return messages.map((m) => MessageResponseDto.from(m));
  }

  @Post('me/messages')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth()
  @ApiHeader({ name: SESSION_HEADER, required: false })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Send a message as the customer (REST fallback for clients without WebSocket).',
  })
  @ApiResponse({ status: 201, type: MessageResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Empty body or conversation closed',
  })
  async sendMyMessage(
    @OptionalUser() user: UserEntity | undefined,
    @Headers(SESSION_HEADER) session: string | undefined,
    @Body() dto: CreateMessageDto,
  ): Promise<MessageResponseDto> {
    const identity = this.resolveIdentity(user, session);
    const conv = await this.service.findMyConversation(identity);
    const { message, envelope } = await this.service.sendMessageAsCustomer(
      identity,
      conv.id,
      dto.body,
    );
    this.gateway.broadcast(envelope);
    return MessageResponseDto.from(message);
  }

  @Post('me/read')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth()
  @ApiHeader({ name: SESSION_HEADER, required: false })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Mark admin messages as read by the customer' })
  @ApiResponse({ status: 204 })
  async markMyRead(
    @OptionalUser() user: UserEntity | undefined,
    @Headers(SESSION_HEADER) session: string | undefined,
  ): Promise<void> {
    const identity = this.resolveIdentity(user, session);
    const conv = await this.service.findMyConversation(identity);
    await this.service.markRead(conv.id, 'customer', identity);
  }

  // --------------------------------------------------------------------------
  // Admin/staff endpoints
  // --------------------------------------------------------------------------

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Paginated list of conversations (open first by lastMessageAt desc). Admin only.',
  })
  @ApiResponse({ status: 200, description: 'Paginated conversation list' })
  async findAll(
    @Query() query: FindConversationsQueryDto,
  ): Promise<PaginatedResponse<ConversationListItemResponseDto>> {
    const result = await this.service.listForAdmin({
      ...(query.status !== undefined ? { status: query.status } : {}),
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    });
    return {
      ...result,
      data: result.data.map((row) =>
        ConversationListItemResponseDto.fromRow(row),
      ),
    };
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get a conversation + first page of messages (admin only)',
  })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404 })
  async findOne(@Param('id') id: string): Promise<{
    conversation: ConversationResponseDto;
    messages: MessageResponseDto[];
  }> {
    const conv = await this.service.findById(id);
    const messages = await this.service.getMessages(id, { limit: 50 });
    return {
      conversation: ConversationResponseDto.from(conv),
      messages: messages.map((m) => MessageResponseDto.from(m)),
    };
  }

  @Get(':id/messages')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Paginate messages for a conversation (admin only)',
  })
  @ApiResponse({ status: 200, type: [MessageResponseDto] })
  async getMessagesForAdmin(
    @Param('id') id: string,
    @Query() query: GetMessagesQueryDto,
  ): Promise<MessageResponseDto[]> {
    const messages = await this.service.getMessages(id, query);
    return messages.map((m) => MessageResponseDto.from(m));
  }

  @Post(':id/reply')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Send an admin reply (admin only)' })
  @ApiResponse({ status: 201, type: MessageResponseDto })
  async reply(
    @CurrentUser() user: UserEntity,
    @Param('id') id: string,
    @Body() dto: CreateMessageDto,
  ): Promise<MessageResponseDto> {
    const { message, envelope } = await this.service.sendMessageAsAdmin(
      user.id,
      id,
      dto.body,
    );
    this.gateway.broadcast(envelope);
    return MessageResponseDto.from(message);
  }

  @Post(':id/read')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Mark customer messages as read by admin' })
  @ApiResponse({ status: 204 })
  async markAdminRead(@Param('id') id: string): Promise<void> {
    await this.service.markRead(id, 'admin');
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update status or subject (admin only)' })
  @ApiResponse({ status: 200, type: ConversationResponseDto })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateConversationDto,
  ): Promise<ConversationResponseDto> {
    const { conversation, envelope } = await this.service.updateStatus(id, dto);
    this.gateway.broadcast(envelope);
    return ConversationResponseDto.from(conversation);
  }

  // --------------------------------------------------------------------------
  // Identity resolution shared by all customer endpoints
  // --------------------------------------------------------------------------

  private resolveIdentity(
    user: UserEntity | undefined,
    session: string | undefined,
  ): CartIdentity {
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
    return identity;
  }
}
