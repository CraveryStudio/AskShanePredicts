const KALSHI_BASE = 'https://api.elections.kalshi.com/trade-api/v2';

// Public market-data endpoints are read-only and do not require authentication.
// The signed KALSHI_API_KEY_ID / private key are reserved for future authenticated
// endpoints (e.g. portfolio, order placement) which ASP does not use in Phase 1.

export async function listKalshiMarkets(seriesTicker: string) {
  const res = await fetch(`${KALSHI_BASE}/markets?series_ticker=${seriesTicker}&status=open`);
  if (!res.ok) throw new Error(`Kalshi API error: ${res.status}`);
  const data = await res.json();
  return data.markets as Array<{
    ticker: string;
    title: string;
    close_time: string;
    last_price: number;
    yes_bid: number;
  }>;
}

export async function getKalshiMarket(ticker: string) {
  const res = await fetch(`${KALSHI_BASE}/markets/${ticker}`);
  if (!res.ok) throw new Error(`Kalshi API error: ${res.status}`);
  const data = await res.json();
  return data.market;
}
