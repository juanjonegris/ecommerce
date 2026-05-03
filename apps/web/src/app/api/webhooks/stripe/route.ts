import { NextResponse } from 'next/server';

// Stub Stripe webhook — only Route Handler in this app per CLAUDE.md §3.
// TODO: validate Stripe signature, route event to NestJS API.
export function POST(): NextResponse {
  return NextResponse.json({ received: true });
}
