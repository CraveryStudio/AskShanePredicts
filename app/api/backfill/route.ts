import { NextResponse } from 'next/server';
import { getFredSeries } from '@/lib/fred';
import { listAllSettledMarkets, getMarketPriceCents } from '@/lib/kalshi';
import { getProbabilityEstimate } from '@/lib/anthropic';
import { scoreEdge } from '@/lib/scoring';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// One-time (manually triggered, repeatable) historical backfill, scoped to Fed/macro only.
// Weather is excluded: NOAA's API only exposes current/future forecasts.
// FRED exposes real historical observations (via observation_end), so this genuinely
// re-runs the model against the data that existed at the time.
// No Telegram alerts are sent for backfilled entries.
// Does NOT apply the live price filter -- a settled market's price is always 0 or 100.
// Processes at most BATCH_LIMIT markets per call and skips ones already backfilled
// (by market_id), so calling this endpoint repeatedly makes incremental progress
// instead of timing out or redoing work.
const BATCH_LIMIT = 8;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== 'Bearer ' + process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

const results: Array<{ ticker: string; probability: number; result: string }> = [];
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

try {
  const markets = await listAllSettledMarkets('KXFED');
  const inWindow = markets.filter(function (m) {
    return m.result && new Date(m.close_time) >= ninetyDaysAgo;
  });

  const { data: alreadyDone, error: doneError } = await supabase
  .from('predictions')
  .select('market_id')
  .eq('category', 'fed_macro');
  if (doneError) throw doneError;

  const doneSet = new Set((alreadyDone || []).map(function (r) { return r.market_id; }));
  const remaining = inWindow.filter(function (m) { return !doneSet.has(m.ticker); });
  const batch = remaining.slice(0, BATCH_LIMIT);

  for (const market of batch) {
    const closeDate = new Date(market.close_time);
    const asOfDate = closeDate.toISOString().slice(0, 10);
    const fedRateData = await getFredSeries('DFEDTARU', 5, asOfDate);
    const cpiData = await getFredSeries('CPIAUCSL', 5, asOfDate);

  const marketPriceCents = getMarketPriceCents(market);

  const supportingData = 'Fed funds target data as of ' + asOfDate + ': ' + JSON.stringify(fedRateData) +
    String.fromCharCode(10) + 'CPI data as of ' + asOfDate + ': ' + JSON.stringify(cpiData);

  const estimate = await getProbabilityEstimate({
    eventTitle: market.title,
    marketPrice: marketPriceCents,
    supportingData: supportingData,
  });

  const scored = scoreEdge(estimate.probabilityLow, estimate.probabilityHigh, marketPriceCents);

  const { data: prediction, error: predError } = await supabase
    .from('predictions')
    .insert({
      category: 'fed_macro',
      market_id: market.ticker,
      event_title: market.title,
      resolution_date: asOfDate,
      market_price: marketPriceCents,
      model_probability: estimate.probabilityLow,
      edge: scored.edge,
      score_label: scored.label,
      rationale: '[BACKFILL] ' + estimate.rationale,
    })
    .select()
    .single();

  if (predError) throw predError;

  const modelLeanedYes = estimate.probabilityLow >= 50;
    const actualYes = (market.result as string) === 'yes';

  const { error: outcomeError } = await supabase.from('outcomes').insert({
    prediction_id: prediction.id,
    actual_result: market.result,
    market_price_before_resolution: marketPriceCents,
    was_correct: modelLeanedYes === actualYes,
  });

  if (outcomeError) throw outcomeError;

  results.push({ ticker: market.ticker, probability: estimate.probabilityLow, result: market.result as string });
  }

  return NextResponse.json({
    success: true,
    backfilled: results.length,
    marketsFound: markets.length,
    inWindow: inWindow.length,
    remainingAfterThisBatch: remaining.length - batch.length,
    results: results,
  });
} catch (err) {
  console.error(err);
  return NextResponse.json({ error: String(err), partial: results }, { status: 500 });
}
}
