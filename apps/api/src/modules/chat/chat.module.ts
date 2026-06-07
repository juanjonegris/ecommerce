import { Module } from '@nestjs/common';

import { AuthModule } from '@/modules/auth/auth.module';
import { PrismaModule } from '@/prisma/prisma.module';

import { ChatController } from './chat.controller';
import { ChatGateway } from './chat.gateway';
import { ChatRepository } from './chat.repository';
import { ChatService } from './chat.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [ChatController],
  providers: [ChatService, ChatRepository, ChatGateway],
  exports: [ChatService],
})
export class ChatModule {}
