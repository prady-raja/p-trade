export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '';
export const MARKET_CACHE_KEY = 'p_trade_market_cache';

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  if (!API_BASE_URL) {
    throw new Error('NEXT_PUBLIC_API_BASE_URL is missing. Add it in .env.local.');
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: { ...(options?.headers || {}) },
    cache: 'no-store',
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : {};

  if (!res.ok) {
    throw new Error(data?.detail || 'Request failed');
  }

  return data as T;
}
