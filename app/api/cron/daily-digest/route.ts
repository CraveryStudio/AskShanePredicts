import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { sendTelegramMessage } from '@/lib/telegram';

export const dynamic = 'force-dynamic';

interface PredictionRow {
  id: string;
  category: string;
  event_title: string;
  edge: number;
  score_label: string;
  created_at: string;
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== 'Bearer ' + process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // "Yesterday" in US Eastern time: the full calendar day before this cron runs.
    const now = new Date();
    const etNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const startOfTodayET = new Date(etNow.getFullYear(), etNow.getMonth(), etNow.getDate());
    const startOfYesterdayET = new Date(startOfTodayET.getTime() - 24 * 60 * 60 * 1000);

    // Convert those ET-local boundaries back to real UTC instants for the Supabase query.
    const offsetMs = now.getTime() - etNow.getTime();
    const windowStart = new Date(startOfYesterdayET.getTime() + offsetMs).toISOString();
    const windowEnd = new Date(startOfTodayET.getTime() + offsetMs).toISOString();

    const { data: predictions, error: predError } = await supabase
      .from('predictions')
      .select('id, category, event_title, edge, score_label, created_at')
      .gte('created_at', windowStart)
      .lt('created_at', windowEnd);
    if (predError) throw predError;

    const { data: outcomes, error: outError } = await supabase
      .from('outcomes')
      .select('prediction_id, was_correct');
    if (outError) throw outError;

    const predictionRows = (predictions || []) as PredictionRow[];

    const outcomeMap: Record<string, boolean> = {};
    (outcomes || []).forEach(function (o: { prediction_id: string; was_correct: boolean }) {
      outcomeMap[o.prediction_id] = o.was_correct;
    });

    const withOutcome = predictionRows.filter(function (p) {
      return outcomeMap[p.id] !== undefined;
    });
    const stillPending = predictionRows.filter(function (p) {
      return outcomeMap[p.id] === undefined;
    });
    const correct = withOutcome.filter(function (p) {
      return outcomeMap[p.id] === true;
    });
    const wrong = withOutcome.filter(function (p) {
      return outcomeMap[p.id] === false;
    });

    const byTier: Record<string, { correct: number; total: number }> = {};
    withOutcome.forEach(function (p) {
      if (!byTier[p.score_label]) byTier[p.score_label] = { correct: 0, total: 0 };
      byTier[p.score_label].total += 1;
      if (outcomeMap[p.id]) byTier[p.score_label].correct += 1;
    });

    const tierOrder = ['Strong lean', 'Lean', 'Fade', 'No edge'];
    const tierLines = tierOrder
      .filter(function (tier) {
        return byTier[tier];
      })
      .map(function (tier) {
        const stats = byTier[tier];
        const pct = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
        return '  ' + tier + ': ' + stats.correct + '/' + stats.total + ' (' + pct + '%)';
      });

    const winRate = withOutcome.length > 0 ? Math.round((correct.length / withOutcome.length) * 100) : null;

    const dateLabel = startOfYesterdayET.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    const messageLines = [
      'ASP DAILY DIGEST \u2014 ' + dateLabel,
      '',
      'Alerts sent: ' + predictionRows.length,
      'Resolved so far: ' +
        withOutcome.length +
        ' (' +
        correct.length +
        ' correct, ' +
        wrong.length +
        ' wrong' +
        (winRate !== null ? ', ' + winRate + '% win rate' : '') +
        ')',
      'Still pending: ' + stillPending.length,
      '',
      'By tier:',
      tierLines.length ? tierLines.join(String.fromCharCode(10)) : '  No resolved alerts yet',
    ];

    const message = messageLines.join(String.fromCharCode(10));
    await sendTelegramMessage(message);

    return NextResponse.json({
      success: true,
      message: message,
      alertsSent: predictionRows.length,
      correct: correct.length,
      wrong: wrong.length,
      pending: stillPending.length,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
