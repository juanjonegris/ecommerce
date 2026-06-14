'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Send, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { toast } from 'sonner';

import type { Conversation, Message } from '@repo/types';

import { closeConversationAction, markReadAction, replyAction } from '@/app/actions/admin/chat';
import { AdminBreadcrumbs } from '@/components/admin/admin-breadcrumbs';
import { EmptyState } from '@/components/admin/empty-state';
import { StatusBadge } from '@/components/admin/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { formatRelative } from '@/lib/admin/format';

interface ChatInboxProps {
  token: string;
  apiUrl: string;
  locale: string;
}

interface PaginatedConversations {
  data: Conversation[];
  total: number;
  page: number;
  limit: number;
}

function conversationLabel(c: Conversation): string {
  if (c.subject) return c.subject;
  if (c.customerId) return `Customer ${c.customerId.slice(0, 8)}`;
  if (c.guestSession) return `Guest ${c.guestSession.slice(0, 8)}`;
  return c.id.slice(0, 8);
}

async function fetchConversations(apiUrl: string, token: string): Promise<PaginatedConversations> {
  const res = await fetch(`${apiUrl}/chat?limit=50`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`list failed: ${String(res.status)}`);
  return (await res.json()) as PaginatedConversations;
}

async function fetchMessages(
  apiUrl: string,
  token: string,
  conversationId: string,
): Promise<Message[]> {
  const res = await fetch(
    `${apiUrl}/chat/${encodeURIComponent(conversationId)}/messages?limit=100`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    },
  );
  if (!res.ok) throw new Error(`messages failed: ${String(res.status)}`);
  return (await res.json()) as Message[];
}

export function ChatInbox({ token, apiUrl, locale }: ChatInboxProps): React.ReactElement {
  const t = useTranslations('admin.chat');
  const tCommon = useTranslations('admin.common');
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);

  const conversationsQuery = useQuery({
    queryKey: ['admin-conversations'],
    queryFn: () => fetchConversations(apiUrl, token),
    enabled: token.length > 0,
  });

  const messagesQuery = useQuery({
    queryKey: ['admin-messages', selectedId],
    queryFn: () => {
      if (!selectedId) return Promise.resolve([] as Message[]);
      return fetchMessages(apiUrl, token, selectedId);
    },
    enabled: token.length > 0 && selectedId !== null,
  });

  const replyMutation = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: string }) => replyAction(id, body),
    onSuccess: () => {
      // The socket's message:new echo will arrive too; both append + dedupe
      // by id when the realtime handler merges below.
      if (selectedId) {
        void queryClient.invalidateQueries({
          queryKey: ['admin-messages', selectedId],
        });
      }
      void queryClient.invalidateQueries({
        queryKey: ['admin-conversations'],
      });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : tCommon('error'));
    },
  });

  // Realtime — connect once, subscribe to message:new + conversation events.
  useEffect(() => {
    if (token.length === 0) return;
    const socket = io(`${apiUrl}/chat`, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
    });
    socketRef.current = socket;

    const onNewMessage = (payload: { message: Message }): void => {
      const incoming = payload.message;
      // Append to the active conversation's cache if applicable.
      queryClient.setQueryData<Message[]>(['admin-messages', incoming.conversationId], (prev) => {
        if (!prev) return prev;
        if (prev.some((m) => m.id === incoming.id)) return prev;
        return [...prev, incoming];
      });
      // Always invalidate the conversation list so lastMessageAt refreshes.
      void queryClient.invalidateQueries({
        queryKey: ['admin-conversations'],
      });
    };

    const onConversationChanged = (): void => {
      void queryClient.invalidateQueries({
        queryKey: ['admin-conversations'],
      });
    };

    socket.on('message:new', onNewMessage);
    socket.on('conversation:updated', onConversationChanged);
    socket.on('conversation:new', onConversationChanged);

    return () => {
      socket.off('message:new', onNewMessage);
      socket.off('conversation:updated', onConversationChanged);
      socket.off('conversation:new', onConversationChanged);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, apiUrl, queryClient]);

  // Auto-scroll the message thread to the bottom on new messages.
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messagesQuery.data]);

  // Mark customer messages as read whenever an admin opens the conversation.
  useEffect(() => {
    if (!selectedId) return;
    void markReadAction(selectedId).catch(() => {
      // Mark-read is best-effort; failure shouldn't block UX.
    });
  }, [selectedId]);

  const onReplySubmit = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    if (!selectedId) return;
    const body = replyText.trim();
    if (body.length === 0) return;
    setReplyText('');
    replyMutation.mutate({ id: selectedId, body });
  };

  const onCloseConversation = async (): Promise<void> => {
    if (!selectedId) return;
    try {
      await closeConversationAction(selectedId);
      toast.success(t('closeConversation'));
      void queryClient.invalidateQueries({
        queryKey: ['admin-conversations'],
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tCommon('error'));
    }
  };

  const conversations = conversationsQuery.data?.data ?? [];
  const messages = messagesQuery.data ?? [];
  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="flex flex-col h-full" data-testid="admin-chat-inbox">
      <div className="p-6 pb-3">
        <AdminBreadcrumbs segments={[{ key: 'chat' }]} />
        <h1 className="text-3xl font-bold">{t('title')}</h1>
      </div>
      <div className="flex flex-1 min-h-0 border-t">
        {/* Conversation list (left) */}
        <aside className="w-80 border-r flex flex-col" data-testid="admin-chat-conversation-list">
          <ScrollArea className="flex-1">
            {conversationsQuery.isPending ? (
              <p className="p-4 text-sm text-muted-foreground">{tCommon('loading')}</p>
            ) : conversations.length === 0 ? (
              <EmptyState title={tCommon('empty')} />
            ) : (
              <ul className="flex flex-col">
                {conversations.map((c) => {
                  const isActive = c.id === selectedId;
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedId(c.id);
                        }}
                        className={`w-full text-left p-3 hover:bg-muted transition-colors flex flex-col gap-1 ${
                          isActive ? 'bg-muted/60' : ''
                        }`}
                        data-testid={`admin-chat-conversation-${c.id}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-sm truncate">
                            {conversationLabel(c)}
                          </span>
                          <StatusBadge status={c.status} />
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {formatRelative(c.lastMessageAt, locale)}
                        </span>
                      </button>
                      <Separator />
                    </li>
                  );
                })}
              </ul>
            )}
          </ScrollArea>
        </aside>

        {/* Message thread (right) */}
        <section className="flex-1 flex flex-col min-h-0" data-testid="admin-chat-thread">
          {selected === null ? (
            <div className="flex-1 flex items-center justify-center p-6">
              <p className="text-sm text-muted-foreground">{t('selectConversation')}</p>
            </div>
          ) : (
            <>
              <header className="p-4 border-b flex items-center justify-between gap-2">
                <div className="flex flex-col">
                  <span className="font-medium">{conversationLabel(selected)}</span>
                  <span className="text-xs text-muted-foreground">{selected.id.slice(0, 12)}</span>
                </div>
                {selected.status === 'OPEN' ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      void onCloseConversation();
                    }}
                    data-testid="admin-chat-close-button"
                  >
                    <XCircle className="size-4 mr-2" aria-hidden />
                    {t('closeConversation')}
                  </Button>
                ) : (
                  <StatusBadge status={selected.status} />
                )}
              </header>
              <ScrollArea ref={scrollRef} className="flex-1 p-4">
                {messagesQuery.isPending ? (
                  <p className="text-sm text-muted-foreground">{tCommon('loading')}</p>
                ) : (
                  <ul className="flex flex-col gap-3" data-testid="admin-chat-messages">
                    {messages.map((m) => {
                      const isAdmin = m.sender === 'ADMIN';
                      const isSystem = m.sender === 'SYSTEM';
                      return (
                        <li
                          key={m.id}
                          className={`flex ${isAdmin ? 'justify-end' : 'justify-start'}`}
                          data-testid={`admin-chat-message-${m.id}`}
                        >
                          <div
                            className={`max-w-[70%] rounded-lg px-3 py-2 text-sm ${
                              isSystem
                                ? 'bg-muted/50 text-muted-foreground italic text-xs'
                                : isAdmin
                                  ? 'bg-primary text-primary-foreground'
                                  : 'bg-muted'
                            }`}
                          >
                            <p className="whitespace-pre-wrap break-words">{m.body}</p>
                            <p className="text-[10px] mt-1 opacity-60">
                              {formatRelative(m.createdAt, locale)}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </ScrollArea>
              {selected.status === 'OPEN' ? (
                <form
                  onSubmit={onReplySubmit}
                  className="p-3 border-t flex items-center gap-2"
                  data-testid="admin-chat-reply-form"
                >
                  <Input
                    value={replyText}
                    onChange={(e) => {
                      setReplyText(e.target.value);
                    }}
                    placeholder={t('messagePlaceholder')}
                    disabled={replyMutation.isPending}
                    data-testid="admin-chat-reply-input"
                  />
                  <Button
                    type="submit"
                    disabled={replyMutation.isPending || replyText.trim().length === 0}
                    data-testid="admin-chat-reply-submit"
                  >
                    <Send className="size-4" aria-hidden />
                  </Button>
                </form>
              ) : (
                <div className="p-3 border-t text-xs text-muted-foreground text-center">
                  {t('closed')}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
