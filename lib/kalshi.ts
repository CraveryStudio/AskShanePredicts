// Confirmed via docs.kalshi.com: public, unauthenticated market-data endpoints
// live at external-api.kalshi.com, regardless of the "elections" name on other subdomains.
const KALSHI_BASE = 'https://external-api.kalshi.com/trade-api/v2';

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
