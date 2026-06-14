/**
 * Pure-JS error class shared between the server-only admin fetchers and the
 * Client Component error boundary. Lives in its own module so importing it
 * from `'use client'` files does not pull in `next/headers` via lib/auth.
 */
export class AdminAuthError extends Error {
  static readonly NAME = 'AdminAuthError';
  constructor(message = 'admin auth failed') {
    super(message);
    this.name = AdminAuthError.NAME;
  }
}
