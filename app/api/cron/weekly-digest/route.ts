import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { sendTelegramMessage } from '@/lib/telegram';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== 'Bearer ' + process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: predictions, error: predError } = await supabase
      .from('predictions')
      .select('id, category, event_title, edge, score_label, created_at')
      .gte('created_at', sevenDaysAgo);
    if (predError) throw predError;

    const { data: outcomes, error: outError } = await supabase
      .from('outcomes')
      .select('prediction_id, was_correct');
    if (outError) throw outError;

    const outcomeMap = {};
    (outcomes || []).forEach(function (o) { outcomeMap[o.prediction_id] = o.was_correct; });

    const withOutcome = (predictions || []).filter(function (p) { return outcomeMap[p.id] !== undefined; });
    const openPositions = (predictions || []).filter(function (p) { return outcomeMap[p.id] === undefined; });

    const byCategory = {};
    withOutcome.forEach(function (p) {
      if (!byCategory[p.category]) byCategory[p.category] = { correct: 0, total: 0 };
      byCategory[p.category].total += 1;
      if (outcomeMap[p.id]) byCategory[p.category].correct += 1;
    });

    const categoryLines = Object.keys(byCategory).map(function (cat) {
      const stats = byCategory[cat];
      const pct = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
      return '  ' + cat + ': ' + stats.correct + '/' + stats.total + ' (' + pct + '%)';
    });

    const sorted = withOutcome.slice().sort(function (a, b) { return Math.abs(b.edge) - Math.abs(a.edge); });
    const best = sorted.find(function (p) { return outcomeMap[p.id] === true; });
    const worst = sorted.find(function (p) { return outcomeMap[p.id] === false; });

    const messageLines = [
      'ASP WEEKLY DIGEST',
      '',
      'Accuracy by category (last 7 days, resolved only):',
      categoryLines.length ? categoryLines.join(String.fromCharCode(10)) : '  No resolved predictions yet',
      '',
      'Best call: ' + (best ? best.event_title + ' (' + best.score_label + ')' : 'none yet'),
      'Worst call: ' + (worst ? worst.event_title + ' (' + worst.score_label + ')' : 'none yet'),
      '',
      'Open positions awaiting resolution: ' + openPositions.length,
    ];

    const message = messageLines.join(String.fromCharCode(10));
    await sendTelegramMessage(message);

    return NextResponse.json({ success: true, message: message });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
