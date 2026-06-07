import { NextResponse } from 'next/server';

// Stripe webhook receiver. The only Route Handler in this app (CLAUDE.md §3).
//
// We DO NOT verify the Stripe signature here — that happens once on the
// NestJS side so STRIPE_WEBHOOK_SECRET lives in a single process. This handler
// only forwards the raw bytes (signature-preserving) to POST /payments/webhook
// on the API and proxies the response status back to Stripe.
//
// Stripe's signature is computed over the exact JSON bytes it sent, so we MUST
// pass through the unparsed body — `req.json()` is a parser and would break
// verification. Next.js 16 Route Handlers expose the standard Web Request API,
// so `req.arrayBuffer()` returns the raw bytes.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STRIPE_SIGNATURE_HEADER = 'stripe-signature';

export async function POST(req: Request): Promise<NextResponse | Response> {
  const signature = req.headers.get(STRIPE_SIGNATURE_HEADER);
  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }

  const apiUrl = process.env.API_URL;
  if (!apiUrl) {
    return NextResponse.json({ error: 'API_URL not configured' }, { status: 500 });
  }

  const rawBody = Buffer.from(await req.arrayBuffer());

  const upstream = await fetch(`${apiUrl}/payments/webhook`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      [STRIPE_SIGNATURE_HEADER]: signature,
    },
    body: rawBody,
  });

  const responseBody = await upstream.text();
  return new Response(responseBody, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'application/json',
    },
  });
}
