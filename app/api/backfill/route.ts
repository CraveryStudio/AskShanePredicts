import { NextResponse } from 'next/server';
import { getFredSeries } from '@/lib/fred';
import { listAllSettledMarkets, getMarketPriceCents } from '@/lib/kalshi';
import { getProbabilityEstimate } from '@/lib/anthropic';
import { scoreEdge, MIN_PRICE, MAX_PRICE } from '@/lib/scoring';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// One-time (manually triggered) historical backfill, scoped to Fed/macro only.
// Weather is excluded: NOAA's API only exposes current/future forecasts, so there is
// no way to reconstruct what the forecast actually looked like on a past date.
// For Fed markets, FRED DOES expose real historical observations (via observation_end),
// so this genuinely re-runs the model against the data that existed at the time --
// it does not just replay today's data against old markets.
// No Telegram alerts are sent for backfilled entries, to avoid spamming 90 days of history.
// Checks both the live and historical Kalshi tiers, since most of a 90-day window
// falls before Kalshi's live/historical cutoff.
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== 'Bearer ' + process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results: Array<{ ticker: string; probability: number; result: string }> = [];
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  try {
    const markets = await listAllSettledMarkets('KXFED');

    for (const market of markets) {
      if (!market.result) continue;
      const closeDate = new Date(market.close_time);
      if (closeDate < ninetyDaysAgo) continue;

      const asOfDate = closeDate.toISOString().slice(0, 10);
      const fedRateData = await getFredSeries('DFEDTARU', 5, asOfDate);
      const cpiData = await getFredSeries('CPIAUCSL', 5, asOfDate);

      const marketPriceCents = getMarketPriceCents(market);
      if (marketPriceCents < MIN_PRICE || marketPriceCents > MAX_PRICE) continue;

      const supportingData = 'Fed funds target data as of ' + asOfDate + ': ' + JSON.stringify(fedRateData) +
        String.fromCharCode(10) + 'CPI data as of ' + asOfDate + ': ' + JSON.stringify(cpiData);

      const estimate = await getProbabilityEstimate({
        eventTitle: market.title,
        marketPrice: marketPriceCents,
        supportingData: supportingData,
      });

      const scored = scoreEdge(estimate.probability, marketPriceCents);

      const { data: prediction, error: predError } = await supabase
        .from('predictions')
        .insert({
          category: 'fed_macro',
          market_id: market.ticker,
          event_title: market.title,
          resolution_date: asOfDate,
          market_price: marketPriceCents,
          model_probability: estimate.probability,
          edge: scored.edge,
          score_label: scored.label,
          rationale: '[BACKFILL] ' + estimate.rationale,
        })
        .select()
        .single();

      if (predError) throw predError;

      const modelLeanedYes = estimate.probability >= 50;
      const actualYes = market.result === 'yes';

      const { error: outcomeError } = await supabase.from('outcomes').insert({
        prediction_id: prediction.id,
        actual_result: market.result,
        market_price_before_resolution: marketPriceCents,
        was_correct: modelLeanedYes === actualYes,
      });

      if (outcomeError) throw outcomeError;

      results.push({ ticker: market.ticker, probability: estimate.probability, result: market.result });
    }

    return NextResponse.json({ success: true, backfilled: results.length, marketsFound: markets.length, results: results });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: String(err), partial: results }, { status: 500 });
  }
}
