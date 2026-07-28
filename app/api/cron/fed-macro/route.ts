import { NextResponse } from 'next/server';
import { getFredSeries } from '@/lib/fred';
import { listKalshiMarkets, getMarketPriceCents } from '@/lib/kalshi';
import { getProbabilityEstimate } from '@/lib/anthropic';
import { scoreEdge, MIN_PRICE, MAX_PRICE } from '@/lib/scoring';
import { supabase } from '@/lib/supabase';
import { sendTelegramMessage } from '@/lib/telegram';
import { formatAlertMessage } from '@/lib/format-alert';

export const dynamic = 'force-dynamic';

// Kalshi's actual series ticker for Fed funds rate markets, confirmed via
// kalshi.com/markets/kxfed/fed-funds-rate
const FED_SERIES_TICKER = 'KXFED';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results = [];

  try {
    const fedRateData = await getFredSeries('DFEDTARU', 5);
    const cpiData = await getFredSeries('CPIAUCSL', 5);
    const markets = await listKalshiMarkets(FED_SERIES_TICKER);

    for (const market of markets) {
      const marketPriceCents = getMarketPriceCents(market);
      if (marketPriceCents < MIN_PRICE || marketPriceCents > MAX_PRICE) continue;

      const supportingData = `Latest Fed funds target data: ${JSON.stringify(fedRateData)}\nLatest CPI data: ${JSON.stringify(cpiData)}`;

      const estimate = await getProbabilityEstimate({
        eventTitle: market.title,
        marketPrice: marketPriceCents,
        supportingData,
      });

      const { edge, label } = scoreEdge(estimate.probability, marketPriceCents);

      const { data: prediction, error } = await supabase
        .from('predictions')
        .insert({
          category: 'fed_macro',
          market_id: market.ticker,
          event_title: market.title,
          resolution_date: market.close_time,
          market_price: marketPriceCents,
          model_probability: estimate.probability,
          edge,
          score_label: label,
          rationale: estimate.rationale,
        })
        .select()
        .single();

      if (error) throw error;
      results.push(prediction);

      const message = formatAlertMessage({
        predictionId: prediction.id,
        eventTitle: market.title,
        category: 'fed_macro',
        marketPrice: marketPriceCents,
        modelProbability: estimate.probability,
        edge,
        scoreLabel: label,
        rationale: estimate.rationale,
      });

      await sendTelegramMessage(message);
      await supabase.from('alerts_sent').insert({ prediction_id: prediction.id, channel: 'telegram' });
    }

    return NextResponse.json({ success: true, count: results.length, results });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
