import { NextResponse } from 'next/server';
import { getKalshiMarket, getMarketPriceCents } from '@/lib/kalshi';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// Daily job: finds predictions whose resolution_date has passed and no outcome
// has been recorded yet, checks Kalshi for the final result, and logs it.
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== 'Bearer ' + process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const today = new Date().toISOString().slice(0, 10);

    const { data: pendingPredictions, error: fetchError } = await supabase
      .from('predictions')
      .select('id, market_id, model_probability, resolution_date')
      .lte('resolution_date', today);

    if (fetchError) throw fetchError;

    const { data: existingOutcomes, error: outcomesError } = await supabase
      .from('outcomes')
      .select('prediction_id');

    if (outcomesError) throw outcomesError;

    const resolvedIds = new Set((existingOutcomes || []).map(function (o) { return o.prediction_id; }));
    const unresolved = (pendingPredictions || []).filter(function (p) { return !resolvedIds.has(p.id); });

    const results = [];

    for (const prediction of unresolved) {
      const market = await getKalshiMarket(prediction.market_id);
      if (!market.result) continue;

      const marketPriceCents = getMarketPriceCents(market);
      const modelLeanedYes = prediction.model_probability >= 50;
      const actualYes = market.result === 'yes';
      const wasCorrect = modelLeanedYes === actualYes;

      const { data, error } = await supabase
        .from('outcomes')
        .insert({
          prediction_id: prediction.id,
          actual_result: market.result,
          market_price_before_resolution: marketPriceCents,
          was_correct: wasCorrect,
        })
        .select()
        .single();

      if (error) throw error;
      results.push(data);
    }

    return NextResponse.json({ success: true, checked: unresolved.length, resolved: results.length, results: results });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
