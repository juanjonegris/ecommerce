import { setRequestLocale } from 'next-intl/server';

import { getSessionToken } from '@/lib/auth';

import { ChatInbox } from './chat-inbox';

interface ChatPageProps {
  params: Promise<{ locale: string }>;
}

// The chat inbox needs a bearer for the socket.io connection — cookies()
// only works server-side, so we read it here in this Server Component
// wrapper and pass it as a prop to the Client Component. Security trade-off:
// the token is exposed to client-side JS via the React tree (any XSS in
// the admin shell could exfiltrate it). Acceptable for admin tooling that
// already requires auth; a future tightening could swap this for a
// short-lived "socket-only" token minted by a separate endpoint.
export default async function ChatPage({ params }: ChatPageProps): Promise<React.ReactElement> {
  const { locale } = await params;
  setRequestLocale(locale);
  const token = await getSessionToken();
  const apiUrl = process.env.API_URL ?? 'http://localhost:3001';

  return (
    <div className="flex flex-col h-screen" data-testid="admin-chat-page">
      <ChatInbox token={token ?? ''} apiUrl={apiUrl} locale={locale} />
    </div>
  );
}
