// Confirmed via docs.kalshi.com: public, unauthenticated market-data endpoints
// live at external-api.kalshi.com, regardless of the "elections" name on other subdomains.
const KALSHI_BASE = 'https://external-api.kalshi.com/trade-api/v2';

export interface KalshiMarket {
  ticker: string;
  title: string;
  close_time: string;
  // Legacy cent-integer fields (Kalshi is phasing these out through 2026 — may be missing/null)
  last_price?: number;
  yes_bid?: number;
  // Current fields: dollar-denominated, e.g. "0.42" for a 42-cent market
  last_price_dollars?: string | number;
  yes_bid_dollars?: string | number;
}

export async function listKalshiMarkets(seriesTicker: string) {
  const res = await fetch(`${KALSHI_BASE}/markets?series_ticker=${seriesTicker}&status=open`);
  if (!res.ok) throw new Error(`Kalshi API error: ${res.status}`);
  const data = await res.json();
  return data.markets as KalshiMarket[];
}

export async function getKalshiMarket(ticker: string) {
  const res = await fetch(`${KALSHI_BASE}/markets/${ticker}`);
  if (!res.ok) throw new Error(`Kalshi API error: ${res.status}`);
  const data = await res.json();
  return data.market as KalshiMarket;
}

// Normalizes price to cents (0-100) regardless of which field shape Kalshi returns.
// Tries dollar fields first (current standard), falls back to legacy cent fields.
export function getMarketPriceCents(market: KalshiMarket): number {
  const raw = market.last_price_dollars ?? market.yes_bid_dollars ?? market.last_price ?? market.yes_bid ?? 0;
  const num = Number(raw);
  if (Number.isNaN(num)) return 0;
  // Dollar fields come back as fractions (e.g. 0.42); cent fields as integers (e.g. 42)
  return Math.round(num <= 1 ? num * 100 : num);
}
