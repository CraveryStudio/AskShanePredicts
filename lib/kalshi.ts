// Confirmed via docs.kalshi.com: public, unauthenticated market-data endpoints
// live at external-api.kalshi.com, regardless of the "elections" name on other subdomains.
const KALSHI_BASE = 'https://external-api.kalshi.com/trade-api/v2';

export interface KalshiMarket {
  ticker: string;
  title: string;
  close_time: string;
  status?: string;
  result?: string;
  last_price?: number;
  yes_bid?: number;
  last_price_dollars?: string | number;
  yes_bid_dollars?: string | number;
}

export async function listKalshiMarkets(seriesTicker: string, status: string = 'open'): Promise<KalshiMarket[]> {
  const url = KALSHI_BASE + '/markets?series_ticker=' + seriesTicker + '&status=' + status;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Kalshi API error: ' + res.status);
  const data = await res.json();
  return data.markets as KalshiMarket[];
}

// Kalshi splits data into live and historical tiers (since Feb 2026). Markets settled
// before a rolling cutoff are only available via /historical/markets, not the regular
// /markets?status=settled endpoint. This is needed for any backfill covering more than
// a few recent days.
export async function getHistoricalCutoff(): Promise<string | null> {
  const res = await fetch(KALSHI_BASE + '/historical/cutoff');
  if (!res.ok) return null;
  const data = await res.json();
  return data.market_settled_ts || null;
}

export async function listHistoricalMarkets(seriesTicker: string): Promise<KalshiMarket[]> {
  const url = KALSHI_BASE + '/historical/markets?series_ticker=' + seriesTicker;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Kalshi historical API error: ' + res.status);
  const data = await res.json();
  return (data.markets || []) as KalshiMarket[];
}

// Fetches settled markets for a series across both the live and historical tiers,
// deduplicated by ticker.
export async function listAllSettledMarkets(seriesTicker: string): Promise<KalshiMarket[]> {
  const [live, historical] = await Promise.all([
    listKalshiMarkets(seriesTicker, 'settled').catch(function () { return [] as KalshiMarket[]; }),
    listHistoricalMarkets(seriesTicker).catch(function () { return [] as KalshiMarket[]; }),
  ]);
  const seen = new Set<string>();
  const combined: KalshiMarket[] = [];
  for (const m of live.concat(historical)) {
    if (seen.has(m.ticker)) continue;
    seen.add(m.ticker);
    combined.push(m);
  }
  return combined;
}

export async function getKalshiMarket(ticker: string): Promise<KalshiMarket> {
  const url = KALSHI_BASE + '/markets/' + ticker;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Kalshi API error: ' + res.status);
  const data = await res.json();
  return data.market as KalshiMarket;
}

// Normalizes price to cents (0-100) regardless of which field shape Kalshi returns.
// Tries dollar fields first (current standard), falls back to legacy cent fields.
export function getMarketPriceCents(market: KalshiMarket): number {
  const raw = market.last_price_dollars ?? market.yes_bid_dollars ?? market.last_price ?? market.yes_bid ?? 0;
  const num = Number(raw);
  if (Number.isNaN(num)) return 0;
  return Math.round(num <= 1 ? num * 100 : num);
}
