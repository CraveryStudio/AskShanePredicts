import { NextResponse } from 'next/server';
import { listKalshiMarkets, getMarketPriceCents } from '@/lib/kalshi';
import { getProbabilityEstimate } from '@/lib/anthropic';
import { scoreEdge, MIN_PRICE, MAX_PRICE } from '@/lib/scoring';
import { supabase } from '@/lib/supabase';
import { sendTelegramMessage } from '@/lib/telegram';
import { formatAlertMessage } from '@/lib/format-alert';

export const dynamic = 'force-dynamic';

async function getNoaaForecast(office: string, gridX: number, gridY: number) {
  const res = await fetch(`https://api.weather.gov/gridpoints/${office}/${gridX},${gridY}/forecast`, {
    headers: { 'User-Agent': 'AskShanePredicts (personal use)' },
  });
  if (!res.ok) throw new Error(`NOAA API error: ${res.status}`);
  const data = await res.json();
  return data.properties.periods;
}

// Kalshi series ticker confirmed via kalshi.com/category/climate (KXHIGHNY = NYC daily high temp).
// NOAA gridpoint confirmed for Central Park, NY (the station Kalshi's NYC weather markets settle against).
const WEATHER_SERIES = [
  { seriesTicker: 'KXHIGHNY', office: 'OKX', gridX: 34, gridY: 38, label: 'NYC high temp (Central Park)' },
];

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results = [];

  try {
    for (const series of WEATHER_SERIES) {
      const markets = await listKalshiMarkets(series.seriesTicker);
      const forecast = await getNoaaForecast(series.office, series.gridX, series.gridY);

      for (const market of markets) {
        const marketPriceCents = getMarketPriceCents(market);
        if (marketPriceCents < MIN_PRICE || marketPriceCents > MAX_PRICE) continue;

        const supportingData = `NOAA forecast periods for ${series.label}: ${JSON.stringify(forecast.slice(0, 3))}`;

        const estimate = await getProbabilityEstimate({
          eventTitle: market.title,
          marketPrice: marketPriceCents,
          supportingData,
        });

        const { edge, label } = scoreEdge(estimate.probability, marketPriceCents);

        const { data: prediction, error } = await supabase
          .from('predictions')
          .insert({
            category: 'weather',
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
          category: 'weather',
          marketPrice: marketPriceCents,
          modelProbability: estimate.probability,
          edge,
          scoreLabel: label,
          rationale: estimate.rationale,
        });

        await sendTelegramMessage(message);
        await supabase.from('alerts_sent').insert({ prediction_id: prediction.id, channel: 'telegram' });
      }
    }

    return NextResponse.json({ success: true, count: results.length, results });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
