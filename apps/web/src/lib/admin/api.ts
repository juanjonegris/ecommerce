import type {
  Category,
  Conversation,
  ConversationStatus,
  DiscountCode,
  Message,
  NewsletterStatus,
  NewsletterSubscriber,
  NewsletterSyncState,
  Order,
  OrderStatus,
  PaginatedResponse,
  Payment,
  Product,
  ProductImage,
} from '@repo/types';

import { getSessionToken } from '@/lib/auth';

import { AdminAuthError } from './auth-error';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

export { AdminAuthError };

type QueryValue = string | number | boolean | undefined;
type QueryMap = Readonly<Record<string, QueryValue>>;

interface FetchOpts {
  method?: string;
  body?: unknown;
  query?: QueryMap;
}

function buildQuery(query: QueryMap | undefined): string {
  if (!query) return '';
  const parts: string[] = [];
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === '') continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return parts.length === 0 ? '' : `?${parts.join('&')}`;
}

/**
 * Bearer-attaching, no-store fetcher for the admin dashboard. All admin
 * data is per-user and stale-after-write, so we never cache.
 */
async function fetchAdmin<T>(path: string, opts: FetchOpts = {}): Promise<T> {
  const token = await getSessionToken();
  if (!token) throw new AdminAuthError('missing session');

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

  const init: RequestInit = {
    method: opts.method ?? 'GET',
    headers,
    cache: 'no-store',
  };
  if (opts.body !== undefined) init.body = JSON.stringify(opts.body);

  const res = await fetch(`${API_URL}${path}${buildQuery(opts.query)}`, init);
  if (res.status === 401 || res.status === 403) {
    throw new AdminAuthError(`admin ${path} unauthorized`);
  }
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Admin ${path}: ${String(res.status)} ${detail}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// --- Products ---------------------------------------------------------------

export interface AdminProductsQuery {
  page?: number;
  limit?: number;
  categoryId?: string;
  sortBy?: 'price' | 'createdAt';
  order?: 'asc' | 'desc';
}

export function getAdminProducts(
  query: AdminProductsQuery = {},
): Promise<PaginatedResponse<Product>> {
  return fetchAdmin<PaginatedResponse<Product>>('/products', { query: query as QueryMap });
}

export function getAdminProduct(slug: string): Promise<Product> {
  return fetchAdmin<Product>(`/products/${encodeURIComponent(slug)}`);
}

export function listProductImages(productId: string): Promise<PaginatedResponse<ProductImage>> {
  return fetchAdmin<PaginatedResponse<ProductImage>>('/uploads/product-images', {
    query: { productId, limit: 100 },
  });
}

// --- Categories -------------------------------------------------------------

export function listCategories(): Promise<Category[]> {
  return fetchAdmin<Category[]>('/categories');
}

// --- Orders -----------------------------------------------------------------

export interface AdminOrdersQuery {
  page?: number;
  limit?: number;
  status?: OrderStatus;
}

export function listOrders(query: AdminOrdersQuery = {}): Promise<PaginatedResponse<Order>> {
  return fetchAdmin<PaginatedResponse<Order>>('/orders', { query: query as QueryMap });
}

export function getOrder(id: string): Promise<Order> {
  return fetchAdmin<Order>(`/orders/${encodeURIComponent(id)}`);
}

export function getPaymentsByOrder(orderId: string): Promise<Payment[]> {
  return fetchAdmin<Payment[]>(`/payments/order/${encodeURIComponent(orderId)}`);
}

// --- Discounts --------------------------------------------------------------

export interface AdminDiscountsQuery {
  page?: number;
  limit?: number;
}

export function listDiscounts(
  query: AdminDiscountsQuery = {},
): Promise<PaginatedResponse<DiscountCode>> {
  return fetchAdmin<PaginatedResponse<DiscountCode>>('/discounts', { query: query as QueryMap });
}

export function getDiscount(id: string): Promise<DiscountCode> {
  return fetchAdmin<DiscountCode>(`/discounts/${encodeURIComponent(id)}`);
}

// --- Newsletter -------------------------------------------------------------

export interface AdminNewsletterQuery {
  page?: number;
  limit?: number;
  status?: NewsletterStatus;
  syncState?: NewsletterSyncState;
  provider?: string;
  search?: string;
}

export function listSubscribers(
  query: AdminNewsletterQuery = {},
): Promise<PaginatedResponse<NewsletterSubscriber>> {
  return fetchAdmin<PaginatedResponse<NewsletterSubscriber>>('/newsletter', {
    query: query as QueryMap,
  });
}

// --- Chat -------------------------------------------------------------------

export interface AdminConversationsQuery {
  page?: number;
  limit?: number;
  status?: ConversationStatus;
}

export function listConversationsForAdmin(
  query: AdminConversationsQuery = {},
): Promise<PaginatedResponse<Conversation>> {
  return fetchAdmin<PaginatedResponse<Conversation>>('/chat', { query: query as QueryMap });
}

export function getConversation(id: string): Promise<Conversation> {
  return fetchAdmin<Conversation>(`/chat/${encodeURIComponent(id)}`);
}

export interface MessagesQuery {
  cursor?: string;
  limit?: number;
}

export function getMessages(conversationId: string, query: MessagesQuery = {}): Promise<Message[]> {
  return fetchAdmin<Message[]>(`/chat/${encodeURIComponent(conversationId)}/messages`, {
    query: query as QueryMap,
  });
}

// --- Runtime info (settings page) -------------------------------------------

export interface AdminRuntimeInfo {
  brandName: string;
  supportEmail: string;
  locales: readonly string[];
  defaultLocale: string;
  providers: {
    payment: 'stripe' | 'stub';
    newsletter: 'mailchimp' | 'klaviyo' | 'stub';
    storage: 's3' | 'stub';
    search: 'postgres-fts' | 'stub';
  };
  configured: {
    stripe: boolean;
    resend: boolean;
    mailchimp: boolean;
    klaviyo: boolean;
    s3: boolean;
  };
}

export { fetchAdmin };
